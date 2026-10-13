import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BizFeeConfig } from "@prisma/client";
import { PrismaService } from "../../common/services/prisma.service";
import {
  errandPlatformFee,
  errandRiderIncome,
} from "../../common/commission";
import { joinAddressParts } from "../address/address-location";
import { readErrandDeliveryRequirements } from "../errand/errand-delivery-requirements";
import { internalErrandTypeToMini } from "../errand/errand-config.util";
import { PURCHASE_TYPE } from "../errand-purchase/purchase.policy";
import { WechatMomentsService } from "../wechat-moments/wechat-moments.service";
import { WechatMomentsConfig } from "../wechat-moments/wechat-moments.config";
import { WechatpadError } from "../wechat-moments/wechatpad.client";
import {
  assertKeys,
  BroadcastAction,
  BroadcastKind,
  BroadcastSettings,
  decideBroadcast,
  DeliveryRequirements,
  dormArea,
  DormAddress,
  dormLine,
  isGroupWxid,
  maskRiderName,
  normalizeSettings,
  OPEN_ROUND_HOURS,
  OrderView,
  orderPhase,
  renderMessage,
  SETTINGS_KEY,
  shanghaiDayStart,
  stripSensitive,
  validateSettings,
} from "./wechat-broadcast.policy";

const SERVICE_NAMES: Record<string, string> = {
  express_pickup: "快递代取",
  express_send: "快递代寄",
  food_delivery: "餐食代取",
  custom_task: "校园跑腿",
  purchase: "代买服务",
};
const STATUSES = [
  "pending",
  "sending",
  "sent",
  "draft",
  "unknown",
  "failed",
  "skipped",
  "expired",
];
const MAX_ATTEMPTS = 3;

type FeeConfig = BizFeeConfig | null;

@Injectable()
export class WechatBroadcastService {
  constructor(
    readonly prisma: PrismaService,
    readonly moments: WechatMomentsService,
  ) {}

  async settings(): Promise<BroadcastSettings> {
    const row = await this.prisma.config.findUnique({
      where: { key: SETTINGS_KEY },
    });
    return normalizeSettings(row?.value);
  }

  async saveSettings(input: any) {
    const current = await this.settings();
    const now = new Date();
    const next = validateSettings(input, current, now);
    if (next.enabled && !next.dryRun) {
      const connection = await this.moments.getConfig();
      if (connection.missing.length)
        throw new BadRequestException(
          "请先在朋友圈同步页完成共用微信连接，再开启正式发送",
        );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.config.upsert({
        where: { key: SETTINGS_KEY },
        update: { value: next as any },
        create: {
          key: SETTINGS_KEY,
          value: next as any,
          group: "wechat",
          desc: "订单群播报设置",
        },
      });
      if (next.enabledAt !== current.enabledAt || !next.enabled) {
        // Queued messages and dry-run rounds from before this change are never sent live.
        await tx.wechatOrderBroadcast.updateMany({
          where: { status: "pending" },
          data: { status: "skipped", reason: "settings_changed", closedAt: now },
        });
        await tx.wechatOrderBroadcast.updateMany({
          where: { kind: "new", closedAt: null },
          data: { closedAt: now },
        });
      }
    });
    return this.status();
  }

  async status() {
    const now = new Date();
    const [settings, connection, state, regions, groups, seen, today] =
      await Promise.all([
        this.settings(),
        this.moments.getConfig(),
        this.moments.getState(),
        this.prisma.region.findMany({
          select: { id: true, name: true, isOpen: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
        this.prisma.wechatOrderBroadcastGroup.findMany(),
        this.prisma.wechatChatConversation.findMany({
          where: { kind: "group" },
          select: { wxid: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
        this.prisma.wechatOrderBroadcast.groupBy({
          by: ["status"],
          where: { createdAt: { gte: shanghaiDayStart(now) } },
          _count: true,
        }),
      ]);
    const bound = new Map(groups.map((g) => [g.regionId, g]));
    const detected = new Map<string, Date>();
    for (const row of seen)
      if (!detected.has(row.wxid)) detected.set(row.wxid, row.updatedAt);
    return {
      settings,
      connection: {
        deviceId: connection.wechatpad.deviceId,
        online: state.online === true,
        missing: connection.missing,
      },
      regions: regions.map((r) => ({
        id: r.id,
        name: r.name,
        isOpen: r.isOpen,
        group: bound.get(r.id) || null,
      })),
      detectedGroups: [...detected].map(([wxid, lastSeenAt]) => ({
        wxid,
        lastSeenAt,
      })),
      today: Object.fromEntries(today.map((row) => [row.status, row._count])),
    };
  }

  async saveGroup(regionId: string, input: any) {
    assertKeys(input, ["groupWxid", "groupName", "enabled"]);
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw new NotFoundException("校区不存在");
    const groupWxid = String(input.groupWxid || "").trim();
    if (!isGroupWxid(groupWxid))
      throw new BadRequestException("请填写以 @chatroom 结尾的群 ID");
    const groupName = String(input.groupName ?? "").trim();
    if (groupName.length > 40)
      throw new BadRequestException("群备注最多 40 字");
    if (typeof input.enabled !== "boolean")
      throw new BadRequestException("enabled 必须是开关");
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.wechatOrderBroadcastGroup.findUnique({
        where: { regionId },
      });
      if (previous && (previous.groupWxid !== groupWxid || !input.enabled))
        await this.dropQueued(tx, regionId, "group_changed");
      return tx.wechatOrderBroadcastGroup.upsert({
        where: { regionId },
        update: { groupWxid, groupName, enabled: input.enabled },
        create: { regionId, groupWxid, groupName, enabled: input.enabled },
      });
    });
  }

  async removeGroup(regionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.wechatOrderBroadcastGroup.deleteMany({
        where: { regionId },
      });
      if (!removed.count) throw new NotFoundException("该校区没有绑定群");
      await this.dropQueued(tx, regionId, "group_removed");
    });
    return { ok: true };
  }

  private async dropQueued(tx: any, regionId: string, reason: string) {
    const now = new Date();
    await tx.wechatOrderBroadcast.updateMany({
      where: { regionId, status: "pending" },
      data: { status: "skipped", reason, closedAt: now },
    });
    await tx.wechatOrderBroadcast.updateMany({
      where: { regionId, kind: "new", closedAt: null },
      data: { closedAt: now },
    });
  }

  async testSend(regionId: string) {
    const group = await this.prisma.wechatOrderBroadcastGroup.findUnique({
      where: { regionId },
    });
    if (!group) throw new NotFoundException("请先为该校区绑定群");
    const connection = await this.moments.getConfig();
    if (connection.missing.length)
      throw new BadRequestException(
        `微信连接未完成：${connection.missing.join("、")}`,
      );
    const state = await this.moments.getState();
    if (state.online !== true)
      throw new BadRequestException("微信未上线，请先在朋友圈同步页确认登录");
    try {
      const result = await this.client(connection).sendText(
        group.groupWxid,
        "【测试】订单群播报已连接到本群。之后本校区的新订单会自动发到这里。",
      );
      return { ok: true, confirmed: result.confirmed };
    } catch (error) {
      if (error instanceof WechatpadError)
        throw new BadRequestException(
          error.ambiguous
            ? "发送结果未知，请到群里确认是否收到"
            : `发送失败：${error.message}`,
        );
      throw error;
    }
  }

  async records(query: any) {
    const page = Math.max(1, Math.floor(Number(query?.page) || 1));
    const pageSize = 30;
    const where: any = {};
    if (STATUSES.includes(query?.status)) where.status = query.status;
    if (typeof query?.regionId === "string" && query.regionId)
      where.regionId = query.regionId;
    if (typeof query?.orderNo === "string" && query.orderNo.trim()) {
      const order = await this.prisma.errandOrder.findUnique({
        where: { orderNo: query.orderNo.trim() },
        select: { id: true },
      });
      where.orderId = order?.id || "__none__";
    }
    const [rows, total] = await Promise.all([
      this.prisma.wechatOrderBroadcast.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wechatOrderBroadcast.count({ where }),
    ]);
    const [orders, regions] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.orderId))] } },
        select: { id: true, orderNo: true },
      }),
      this.prisma.region.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.regionId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const orderNo = new Map(orders.map((o) => [o.id, o.orderNo]));
    const regionName = new Map(regions.map((r) => [r.id, r.name]));
    return {
      list: rows.map((row) => ({
        ...row,
        orderNo: orderNo.get(row.orderId) || "",
        regionName: regionName.get(row.regionId) || "",
      })),
      total,
      page,
      pageSize,
    };
  }

  async resolveUnknown(id: string, input: any) {
    assertKeys(input, ["resolution"]);
    if (!["sent", "not_sent"].includes(input.resolution))
      throw new BadRequestException("请明确核查结果");
    const result = await this.prisma.wechatOrderBroadcast.updateMany({
      where: { id, status: "unknown" },
      data:
        input.resolution === "sent"
          ? { status: "sent", reason: "operator_confirmed_sent", sentAt: new Date() }
          : { status: "failed", reason: "operator_confirmed_not_sent" },
    });
    if (result.count !== 1) throw new ConflictException("该记录已处理");
    return { ok: true };
  }

  async preview(input: any) {
    assertKeys(input, ["orderNo"]);
    const orderNo = String(input.orderNo || "").trim();
    if (!orderNo) throw new BadRequestException("请输入订单号");
    const found = await this.prisma.errandOrder.findUnique({
      where: { orderNo },
      select: { id: true },
    });
    const order = found ? await this.loadOrder(found.id) : null;
    if (!order) throw new NotFoundException("订单不存在");
    const view = await this.buildView(order);
    const now = new Date();
    return {
      phase: orderPhase(order),
      messages: {
        new: renderMessage(view, "new", 1, {}, now),
        accepted: renderMessage(
          view,
          "accepted",
          1,
          {
            at: order.acceptTime || now,
            rider: maskRiderName(order.RegionRider) || "张**",
          },
          now,
        ),
        cancelled: renderMessage(
          view,
          "cancelled",
          1,
          { at: order.cancelTime || now },
          now,
        ),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Order view
  // -------------------------------------------------------------------------

  loadOrder(id: string) {
    return this.prisma.errandOrder.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { sortOrder: "asc" } },
        purchase: { select: { approvedGoodsCents: true } },
        RegionRider: { select: { realName: true, anonymous: true } },
      },
    });
  }

  async buildView(
    order: NonNullable<Awaited<ReturnType<WechatBroadcastService["loadOrder"]>>>,
    cache: { fee?: FeeConfig } = {},
  ): Promise<OrderView> {
    const remark = parseRemark(order.remark);
    if (!("fee" in cache))
      cache.fee = await this.prisma.bizFeeConfig.findUnique({
        where: { bizType: "errand_order" },
      });
    const [region, points] = await Promise.all([
      order.regionId
        ? this.prisma.region.findUnique({
            where: { id: order.regionId },
            select: { name: true },
          })
        : null,
      this.pickupPoints(order.tasks),
    ]);
    const purchase = order.type === PURCHASE_TYPE;
    // 帮我寄件：常用地址是上门取件处，送达的是快递点。
    const pickupSide = order.type === "deliver";
    const dormText = pickupSide ? order.pickupAddress : order.deliverAddress;
    const address = await this.findDormAddress(order, remark, dormText);
    const area = dormArea(address, dormText);
    let pickup: string;
    let delivery: string;
    if (purchase) {
      pickup = stripSensitive(
        order.tasks
          .map((t) => t.itemDescription)
          .filter(Boolean)
          .join(" → ") || order.pickupAddress,
        48,
      );
      delivery = area;
    } else if (pickupSide) {
      pickup = area;
      delivery = stripSensitive(order.deliverAddress);
    } else {
      const names = [
        ...new Set(
          order.tasks
            .map(
              (t) =>
                (t.pickupPointId && points.get(t.pickupPointId)) ||
                stripSensitive(t.pickupAddress, 24),
            )
            .filter(Boolean),
        ),
      ];
      pickup = stripSensitive(
        names.join("、") || order.pickupAddress,
        48,
      );
      delivery = area;
    }
    let requirements: DeliveryRequirements = {};
    try {
      requirements = readErrandDeliveryRequirements(order);
    } catch {
      requirements = {};
    }
    const platformFee = errandPlatformFee(order, cache.fee);
    const serviceType = internalErrandTypeToMini(order.type);
    return {
      orderNo: order.orderNo,
      purchase,
      serviceName: SERVICE_NAMES[serviceType] || "校园跑腿",
      regionName: region?.name || "本校区",
      riderIncome: errandRiderIncome({ ...order, platformFee }),
      advance: purchase
        ? (order.purchase?.approvedGoodsCents || 0) / 100
        : null,
      pickup,
      delivery,
      dorm: dormLine(requirements, address?.gender ?? null, pickupSide),
      orderedAt: order.createdAt,
    };
  }

  private async pickupPoints(tasks: Array<{ pickupPointId: string | null }>) {
    const ids = [
      ...new Set(tasks.map((t) => t.pickupPointId).filter(Boolean)),
    ] as string[];
    if (!ids.length) return new Map<string, string>();
    const rows = await this.prisma.errandPickupPoint.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, stripSensitive(r.name, 24)]));
  }

  private async findDormAddress(
    order: { userId: string },
    remark: Record<string, any>,
    text: string,
  ): Promise<DormAddress | null> {
    const select = {
      id: true,
      fullAddress: true,
      dormitoryNumber: true,
      detail: true,
      gender: true,
    };
    const id = typeof remark.address_id === "string" ? remark.address_id : "";
    if (id) {
      const row = await this.prisma.address.findFirst({
        where: { id, userId: order.userId },
        select,
      });
      if (row) return row;
    }
    // 代买订单不在备注里记地址 ID，按下单时拼出的地址文字匹配用户的常用地址。
    const target = compact(text);
    if (target.length < 4) return null;
    const rows = await this.prisma.address.findMany({
      where: { userId: order.userId },
      select,
      take: 30,
    });
    return (
      rows.find((row) =>
        [row.detail, joinAddressParts([row.fullAddress, row.dormitoryNumber])]
          .map(compact)
          .some(
            (value) =>
              value.length >= 4 &&
              (value === target || target.startsWith(value) || value.startsWith(target)),
          ),
      ) || null
    );
  }

  // -------------------------------------------------------------------------
  // Worker steps
  // -------------------------------------------------------------------------

  /** Creates the rows the current order states call for. */
  async scan(settings: BroadcastSettings, now: Date) {
    const groups = await this.prisma.wechatOrderBroadcastGroup.findMany({
      where: { enabled: true },
    });
    const byRegion = new Map(groups.map((g) => [g.regionId, g]));
    const recent = new Date(now.getTime() - settings.maxDelayMinutes * 60_000);
    const [fresh, open] = await Promise.all([
      byRegion.size
        ? this.prisma.errandOrder.findMany({
            where: {
              regionId: { in: [...byRegion.keys()] },
              status: "pending_accept",
              riderId: null,
              payTime: { gte: new Date(settings.enabledAt || now) },
              OR: [{ payTime: { gte: recent } }, { updatedAt: { gte: recent } }],
            },
            select: { id: true },
            orderBy: { payTime: "asc" },
            take: 200,
          })
        : [],
      this.prisma.wechatOrderBroadcast.findMany({
        where: {
          kind: "new",
          closedAt: null,
          createdAt: { gte: new Date(now.getTime() - OPEN_ROUND_HOURS * 3600_000) },
        },
        select: { orderId: true },
        take: 500,
      }),
    ]);
    const ids = [
      ...new Set([...fresh.map((o) => o.id), ...open.map((r) => r.orderId)]),
    ];
    if (!ids.length) return 0;
    const [orders, rows] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          regionId: true,
          status: true,
          riderId: true,
          payTime: true,
          refundStatus: true,
          updatedAt: true,
        },
      }),
      this.prisma.wechatOrderBroadcast.findMany({
        where: { orderId: { in: ids } },
        select: {
          id: true,
          orderId: true,
          regionId: true,
          groupWxid: true,
          round: true,
          kind: true,
          status: true,
          closedAt: true,
        },
      }),
    ]);
    let changed = 0;
    for (const order of orders) {
      const own = rows.filter((r) => r.orderId === order.id);
      for (const action of decideBroadcast(order, own, settings, now)) {
        const opening = own.find(
          (r) =>
            r.kind === "new" &&
            r.round === (action.type === "create" ? action.round : -1),
        );
        const target =
          action.type === "create" && action.kind !== "new"
            ? opening && { regionId: opening.regionId, groupWxid: opening.groupWxid }
            : order.regionId && byRegion.get(order.regionId);
        changed += await this.apply(action, order.id, target || null, now);
      }
    }
    return changed;
  }

  private async apply(
    action: BroadcastAction,
    orderId: string,
    target: { regionId: string; groupWxid: string } | null,
    now: Date,
  ): Promise<number> {
    if (action.type === "skip") {
      const r = await this.prisma.wechatOrderBroadcast.updateMany({
        where: { id: action.id, status: "pending" },
        data: { status: "skipped", reason: action.reason, closedAt: now },
      });
      return r.count;
    }
    if (action.type === "close") {
      const r = await this.prisma.wechatOrderBroadcast.updateMany({
        where: { id: action.id, closedAt: null },
        data: { closedAt: now },
      });
      return r.count;
    }
    if (!target) return 0;
    try {
      await this.prisma.wechatOrderBroadcast.create({
        data: {
          orderId,
          regionId: target.regionId,
          groupWxid: target.groupWxid,
          round: action.round,
          kind: action.kind,
          status: action.status,
          reason: action.reason || null,
          ...(action.status === "skipped" && action.kind === "new"
            ? { closedAt: now }
            : {}),
        },
      });
      return 1;
    } catch (error: any) {
      if (error?.code === "P2002") return 0;
      throw error;
    }
  }

  /** Sends at most one queued message per group per call. */
  async sendDue(settings: BroadcastSettings, now: Date) {
    const db = this.prisma.wechatOrderBroadcast;
    await db.updateMany({
      where: { status: "sending", leaseUntil: { lt: now } },
      data: { status: "unknown", reason: "send_lease_expired", leaseUntil: null },
    });
    const stale = new Date(now.getTime() - settings.maxDelayMinutes * 60_000);
    await db.updateMany({
      where: { status: "pending", kind: "new", createdAt: { lt: stale } },
      data: { status: "expired", reason: "expired", closedAt: now },
    });
    await db.updateMany({
      where: { status: "pending", createdAt: { lt: stale } },
      data: { status: "expired", reason: "expired" },
    });
    const due = await db.findMany({
      where: { status: "pending", notBefore: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    if (!due.length) return 0;
    const connection = await this.moments.getConfig();
    if (!settings.dryRun) {
      const state = await this.moments.getState();
      // Stay queued while WeChat is offline; rows expire after maxDelayMinutes.
      if (connection.missing.length || state.online !== true) return 0;
    }
    const cache: { fee?: FeeConfig } = {};
    const groups = new Set<string>();
    let handled = 0;
    for (const row of due) {
      if (groups.has(row.groupWxid)) continue;
      groups.add(row.groupWxid);
      if (!settings.dryRun) {
        const last = await db.findFirst({
          where: {
            groupWxid: row.groupWxid,
            status: { in: ["sending", "sent", "unknown"] },
          },
          orderBy: { updatedAt: "desc" },
          select: { status: true, updatedAt: true },
        });
        if (
          last &&
          (last.status === "sending" ||
            now.getTime() - last.updatedAt.getTime() <
              settings.minIntervalSeconds * 1000)
        )
          continue;
      }
      handled += await this.deliver(row, settings, connection, cache);
    }
    return handled;
  }

  async deliver(
    row: { id: string; orderId: string; groupWxid: string; round: number; kind: string; attempts: number },
    settings: BroadcastSettings,
    connection: WechatMomentsConfig,
    cache: { fee?: FeeConfig } = {},
  ): Promise<number> {
    const db = this.prisma.wechatOrderBroadcast;
    const claim = await db.updateMany({
      where: { id: row.id, status: "pending" },
      data: {
        status: "sending",
        attempts: { increment: 1 },
        leaseUntil: new Date(Date.now() + 60_000),
      },
    });
    if (claim.count !== 1) return 0;
    const attempts = row.attempts + 1;
    const finish = (data: Record<string, any>) =>
      db.updateMany({
        where: { id: row.id, status: "sending" },
        data: { leaseUntil: null, ...data },
      });
    let started = false;
    try {
      const order = await this.loadOrder(row.orderId);
      if (!order) {
        await finish({
          status: "skipped",
          reason: "order_missing",
          ...(row.kind === "new" ? { closedAt: new Date() } : {}),
        });
        return 1;
      }
      // The scan decides what a changed order needs; hand the row back to it.
      if (row.kind === "new" && orderPhase(order) !== "available") {
        await finish({ status: "pending", attempts: { decrement: 1 } });
        return 0;
      }
      if (row.kind !== "new" && !settings.dryRun) {
        const opening = await db.findUnique({
          where: {
            orderId_round_kind: {
              orderId: row.orderId,
              round: row.round,
              kind: "new",
            },
          },
          select: { status: true },
        });
        if (opening?.status === "draft") {
          await finish({ status: "skipped", reason: "opening_was_draft" });
          return 1;
        }
      }
      const view = await this.buildView(order, cache);
      const now = new Date();
      const text = renderMessage(
        view,
        row.kind as BroadcastKind,
        row.round,
        row.kind === "accepted"
          ? { at: order.acceptTime, rider: maskRiderName(order.RegionRider) }
          : row.kind === "cancelled"
            ? { at: order.cancelTime }
            : {},
        now,
      );
      if (settings.dryRun) {
        await finish({ status: "draft", text, reason: null });
        return 1;
      }
      started = true;
      const result = await this.client(connection).sendText(row.groupWxid, text);
      await finish({
        status: result.confirmed ? "sent" : "unknown",
        reason: result.confirmed ? null : "unrecognized_delivery_receipt",
        remoteId: result.messageId,
        sentAt: result.confirmed ? new Date() : null,
        text,
      });
      return 1;
    } catch (error) {
      const ambiguous =
        started && (!(error instanceof WechatpadError) || error.ambiguous);
      if (ambiguous) {
        await finish({ status: "unknown", reason: "send_result_unknown" });
      } else if (attempts < MAX_ATTEMPTS) {
        await finish({
          status: "pending",
          reason: started ? "send_rejected_retry" : "prepare_failed_retry",
          notBefore: new Date(Date.now() + 30_000 * attempts),
        });
      } else {
        await finish({
          status: "failed",
          reason: started ? "send_rejected" : "prepare_failed",
        });
      }
      return 1;
    }
  }

  /** Keeps 30 days of records; rows still awaiting an operator's check stay. */
  async purgeHistory(now: Date) {
    const r = await this.prisma.wechatOrderBroadcast.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - 30 * 86400_000) },
        status: { in: ["sent", "draft", "failed", "skipped", "expired"] },
      },
    });
    return r.count;
  }

  private client(connection: WechatMomentsConfig) {
    return this.moments.createClient({
      ...connection,
      wechatpad: { ...connection.wechatpad, timeoutMs: 20_000 },
    });
  }
}

function parseRemark(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

const compact = (value: unknown) => String(value || "").replace(/\s+/g, "");
