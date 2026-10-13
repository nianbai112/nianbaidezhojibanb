import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { errandPlatformFee } from '../../common/commission';
import { PrismaService } from "../../common/services/prisma.service";
import { creditConfirmedRiderIncome } from "../rider-app/rider-income-credit";
import { RiderPayoutService } from '../rider-payout/rider-payout.service';
import {
  inspectErrandAssignmentRisk,
  recordErrandAssignmentRisk,
} from "./errand-assignment-guard";
import { RedisService } from "../../common/services/redis.service";
import { NotifyService } from "../notify/notify.service";
import { errandExtendedConfigKey } from "./errand-config.util";
import { LEGACY_MARKETING_HOLD_REASONS } from "./errand-transaction-guards";

import { assertPurchaseReadyForDelivery, lockPurchase, purchaseEvent, PURCHASE_TRANSACTION_OPTIONS } from '../errand-purchase/purchase.transactions';
import { policy as purchasePolicy, purchaseConfigKey } from '../errand-purchase/purchase.policy';

@Injectable()
export class ErrandLifecycleService {
  private readonly logger = new Logger(ErrandLifecycleService.name);
  private autoReceiptCursor: { deadline: string; id: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis?: RedisService,
    private readonly notifyService?: NotifyService,
    @Optional() private readonly riderPayout?: RiderPayoutService,
  ) {}

  @Interval(10 * 60 * 1000)
  async runScheduledAutoReceipt() {
    if (!this.redis) return;
    const lock = (this.redis as any).withRenewingLock || this.redis.withLock;
    return lock.call(this.redis, "errand:auto-receipt", 9 * 60, () =>
      this.autoConfirmDueOrders(),
    );
  }

  @Interval(5 * 60 * 1000)
  async runScheduledRiskScan() {
    if (!this.redis) return;
    const lock = (this.redis as any).withRenewingLock || this.redis.withLock;
    return lock.call(this.redis, "errand:risk-scan", 4 * 60, () =>
      this.scanActionableRisks(),
    );
  }

  @Interval(5 * 60 * 1000)
  async runScheduledSettlementRelease() {
    if (!this.redis) return;
    const lock = (this.redis as any).withRenewingLock || this.redis.withLock;
    return lock.call(this.redis, "errand:settlement-hold-release", 4 * 60, () =>
      this.releaseMaturedSettlementHolds(),
    );
  }

  async releaseMaturedSettlementHolds(now = new Date()) {
    const holds = await this.prisma.errandSettlementHold.findMany({
      where: { status: "holding", OR: [
        { releaseAt: { lte: now } },
        { reasonCode: { in: LEGACY_MARKETING_HOLD_REASONS } },
      ] },
      select: { id: true, orderId: true, riderId: true },
      orderBy: { releaseAt: "asc" },
      take: 100,
    });
    let released = 0;
    let blocked = 0;
    for (const hold of holds) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const currentHold = await tx.errandSettlementHold.findUnique({
            where: { id: hold.id },
          });
          const legacyMarketingHold = !!currentHold && LEGACY_MARKETING_HOLD_REASONS.includes(currentHold.reasonCode);
          if (!currentHold || currentHold.status !== "holding" ||
            (!legacyMarketingHold && (!currentHold.releaseAt || currentHold.releaseAt > now))) return "skipped";
          const order = await tx.errandOrder.findUnique({ where: { id: hold.orderId } });
          if (!order || order.status !== "completed" || order.riderId !== hold.riderId ||
            (legacyMarketingHold && !order.receiptConfirmedAt)) {
            await tx.errandSettlementHold.update({
              where: { id: hold.id },
              data: { releaseAt: null, reasonCode: "order_state_mismatch" },
            });
            return "blocked";
          }
          if (["refunding", "refunded"].includes(String(order.refundStatus || "none"))) {
            await tx.errandSettlementHold.update({
              where: { id: hold.id },
              data: { releaseAt: null, reasonCode: "refund_in_progress" },
            });
            return "blocked";
          }
          const [appeal, openRisk, assignmentRisk] = await Promise.all([
            tx.orderAppeal.findFirst({
              where: {
                orderId: order.id,
                orderType: { in: ["errand", "errand_order"] },
                status: { notIn: ["resolved", "rejected", "closed", "cancelled", "completed"] },
              },
              select: { id: true },
            }),
            tx.deliveryRiskEvent.findFirst({
              where: {
                orderId: order.id,
                orderType: "errand",
                handled: false,
                eventLevel: { in: ["error", "critical"] },
              },
              select: { id: true, eventType: true },
            }),
            inspectErrandAssignmentRisk(tx, order, order.riderId || ""),
          ]);
          const assignmentManualApproved = !!currentHold.resolvedBy
            && currentHold.reasonCode === `admin_release:${assignmentRisk.eventType}`;
          if (assignmentRisk.blocked || !assignmentManualApproved) {
            await recordErrandAssignmentRisk(
              tx,
              order,
              order.riderId || "",
              "冻结收益释放复核",
              assignmentRisk,
            );
          }
          const assignmentRequiresReview = assignmentRisk.blocked
            || (
              ["error", "critical"].includes(String(assignmentRisk.eventLevel || ""))
              && !assignmentManualApproved
            );
          if (appeal || openRisk || assignmentRequiresReview) {
            await tx.errandSettlementHold.update({
              where: { id: hold.id },
              data: {
                releaseAt: null,
                reasonCode: appeal
                  ? "open_appeal"
                  : openRisk?.eventType || assignmentRisk.reasonCode || "risk_recheck_failed",
              },
            });
            await tx.errandOrder.update({
              where: { id: order.id },
              data: { settlementEligibleAt: null },
            });
            return "blocked";
          }
          const claimed = await tx.errandSettlementHold.updateMany({
            where: { id: hold.id, status: "holding", reasonCode: currentHold.reasonCode,
              ...(legacyMarketingHold ? {} : { releaseAt: { lte: now } }) },
            data: {
              status: "released",
              resolvedAt: now,
              resolvedBy: "system:risk_recheck",
              reasonCode: "risk_recheck_passed",
            },
          });
          if (claimed.count !== 1) return "skipped";
          let settlementOrder = { ...order, platformFee: Number(order.platformFee) };
          // Unsettled legacy coupon holds adopt the new gross-price rule.
          // Existing settlement items retain their recorded amount and cannot
          // be credited again by this compatibility release.
          if (legacyMarketingHold && !await tx.riderSettlementItem.findFirst({ where: {
            orderType: 'errand', orderId: order.id, riderId: order.riderId,
            settlement: { status: { not: 'REJECTED' } },
          }, select: { id: true } })) {
            const config = await tx.bizFeeConfig.findUnique({ where: { bizType: 'errand_order' } });
            const platformFee = errandPlatformFee(order, config);
            await tx.errandOrder.update({ where: { id: order.id }, data: { platformFee } });
            settlementOrder = { ...order, platformFee };
          }
          await this.creditConfirmedRiderIncome(tx, settlementOrder, now);
          await tx.errandOrder.update({
            where: { id: order.id },
            data: { settlementEligibleAt: now },
          });
          return "released";
        });
        if (result === "released") released += 1;
        if (result === "blocked") blocked += 1;
      } catch (error: any) {
        blocked += 1;
        this.logger.warn(
          `跑腿冻结收益释放失败 hold=${hold.id}: ${error?.message || error}`,
        );
      }
    }
    if (released) this.riderPayout?.kick();
    return { checked: holds.length, released, blocked };
  }

  async autoConfirmDueOrders(now = new Date()) {
    const cursorKey = "errand:auto-receipt:cursor";
    const stored = this.redis?.getJson
      ? await this.redis.getJson<{ deadline: string; id: string }>(cursorKey)
      : this.autoReceiptCursor;
    let cursor = stored?.id && Number.isFinite(new Date(stored.deadline).getTime())
      ? stored : null;
    const result = { checked: 0, completed: 0, held: 0 };
    // A held page must never hide later orders. Bound each run and persist a
    // stable deadline/id cursor so the next worker run resumes after this batch.
    for (let page = 0; page < 10; page += 1) {
      const orders = await this.prisma.errandOrder.findMany({
        where: {
          status: "arrived",
          receiptConfirmDeadline: { lte: now },
          ...(cursor ? { OR: [
            { receiptConfirmDeadline: { gt: new Date(cursor.deadline) } },
            { receiptConfirmDeadline: new Date(cursor.deadline), id: { gt: cursor.id } },
          ] } : {}),
        },
        select: {
          id: true, orderNo: true, userId: true, regionId: true,
          refundStatus: true, receiptConfirmDeadline: true,
        },
        orderBy: [{ receiptConfirmDeadline: "asc" }, { id: "asc" }],
        take: 100,
      });
      if (orders.length) {
        const batch = await this.autoConfirmReceiptBatch(orders);
        result.checked += batch.checked;
        result.completed += batch.completed;
        result.held += batch.held;
      }
      const last = orders[orders.length - 1];
      cursor = orders.length === 100
        ? { deadline: last.receiptConfirmDeadline!.toISOString(), id: last.id }
        : null;
      this.autoReceiptCursor = cursor;
      if (this.redis?.setJson) await this.redis.setJson(cursorKey, cursor, 24 * 60 * 60);
      if (!cursor) break;
    }
    return result;
  }

  private async autoConfirmReceiptBatch(orders: Array<{
    id: string; orderNo: string; userId: string; regionId: string | null;
    refundStatus: string; receiptConfirmDeadline: Date | null;
  }>) {
    const regionIds = [
      ...new Set(orders.map((order) => order.regionId).filter(Boolean)),
    ] as string[];
    const configRows = this.prisma.config?.findMany
      ? await this.prisma.config
          .findMany({
            where: {
              key: {
                in: [
                  ...regionIds.map(errandExtendedConfigKey),
                  errandExtendedConfigKey("global"),
                ],
              },
            },
            select: { key: true, value: true },
          })
      : [];
    const configs = new Map(
      configRows.map((row: any) => [row.key, row.value || {}]),
    );
    const globalConfig: any =
      configs.get(errandExtendedConfigKey("global")) || {};

    const orderIds = orders.map((order) => order.id);
    const [appeals, riskEvents] = await Promise.all([
      this.prisma.orderAppeal.findMany({
        where: {
          orderId: { in: orderIds },
          orderType: { in: ["errand", "errand_order"] },
          status: {
            notIn: ["resolved", "rejected", "closed", "cancelled", "completed"],
          },
        },
        select: { orderId: true },
      }),
      this.prisma.deliveryRiskEvent.findMany({
        where: {
          orderId: { in: orderIds },
          orderType: "errand",
          handled: false,
          eventLevel: { in: ["error", "critical"] },
        },
        select: { orderId: true },
      }),
    ]);
    const heldIds = new Set([
      ...appeals.map((item) => item.orderId),
      ...riskEvents.map((item) => item.orderId),
    ]);
    let completed = 0;
    let held = 0;

    for (const order of orders) {
      const regionConfig: any =
        configs.get(errandExtendedConfigKey(order.regionId || "global")) ||
        globalConfig;
      const autoReceiptEnabled =
        regionConfig.autoReceiptEnabled ??
        regionConfig.auto_receipt_enabled ??
        globalConfig.autoReceiptEnabled ??
        globalConfig.auto_receipt_enabled ??
        true;
      if (
        autoReceiptEnabled === false ||
        heldIds.has(order.id) ||
        ["refunding", "refunded"].includes(String(order.refundStatus || "none"))
      ) {
        held += 1;
        continue;
      }
      try {
        const updated = await this.confirmReceipt(order.id, order.userId, "system");
        // The buyer or an administrator may finish after the scan selected it.
        // Their completed receipt is idempotent, but is not a system receipt.
        if (updated.receiptConfirmedBy !== "system") continue;
        completed += 1;
        if (this.notifyService) {
          await this.notifyService
            .createAndDispatch({
              userId: order.userId,
              regionId: order.regionId || undefined,
              type: "delivery",
              scene: "errand_order_auto_received",
              title: "跑腿订单已自动确认收货",
              content:
                "订单已达到约定的自动确认时间，系统已确认收货；如有问题请尽快发起售后。",
              data: { orderId: order.id, orderNo: order.orderNo },
              linkType: "page",
              linkValue: `/pagesA/order/errand-detail/errand-detail?order_id=${order.id}`,
              channelMask: { inApp: true, websocket: true },
            })
            .catch((error) => {
              this.logger.warn(
                `跑腿自动确认通知失败 order=${order.id}: ${error?.message || error}`,
              );
            });
        }
      } catch (error: any) {
        held += 1;
        this.logger.warn(
          `跑腿自动确认跳过 order=${order.id}: ${error?.message || error}`,
        );
      }
    }

    return { checked: orders.length, completed, held };
  }

  async scanActionableRisks(now = new Date()) {
    const [orders, rewardConfigs, failedRefunds] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: {
          status: {
            in: ["pending_accept", "accepted", "in_progress", "arrived"],
          },
        },
        select: {
          id: true,
          orderNo: true,
          regionId: true,
          riderId: true,
          status: true,
          createdAt: true,
          acceptTime: true,
          pickupTime: true,
          receiptConfirmDeadline: true,
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
      this.prisma.errandRewardPunish.findMany({
        select: { regionId: true, timeoutMinutes: true },
      }),
      this.prisma.paymentRefund.findMany({
        where: {
          status: { in: ["failed", "abnormal", "closed"] },
          payment: { is: { bizType: "errand_order" } },
        },
        select: {
          id: true,
          status: true,
          failReason: true,
          payment: { select: { bizId: true, orderNo: true } },
        },
        orderBy: { updatedAt: "asc" },
        take: 100,
      }),
    ]);
    const timeoutByRegion = new Map(
      rewardConfigs.map((item) => [
        item.regionId,
        Math.max(1, Number(item.timeoutMinutes || 30)),
      ]),
    );
    const candidates: Array<{
      orderId: string;
      riderId?: string | null;
      eventType: string;
      eventLevel: string;
      description: string;
    }> = [];

    for (const order of orders) {
      const timeoutMinutes = timeoutByRegion.get(order.regionId || "") || 30;
      const cutoff = now.getTime() - timeoutMinutes * 60 * 1000;
      if (
        order.status === "pending_accept" &&
        !order.riderId &&
        new Date(order.createdAt).getTime() <= cutoff
      ) {
        candidates.push({
          orderId: order.id,
          eventType: "unaccepted_timeout",
          eventLevel: "warning",
          description: `订单 ${order.orderNo} 超过${timeoutMinutes}分钟无人接单，请联系骑手或用户。`,
        });
      }
      const deliverySince = order.pickupTime || order.acceptTime;
      if (
        ["accepted", "in_progress"].includes(order.status) &&
        deliverySince &&
        new Date(deliverySince).getTime() <= cutoff
      ) {
        candidates.push({
          orderId: order.id,
          riderId: order.riderId,
          eventType: "delivery_overdue",
          eventLevel: "error",
          description: `订单 ${order.orderNo} 履约超过${timeoutMinutes}分钟，请核查骑手位置和配送轨迹。`,
        });
      }
      if (
        order.status === "arrived" &&
        order.receiptConfirmDeadline &&
        new Date(order.receiptConfirmDeadline).getTime() <=
          now.getTime() - 48 * 60 * 60 * 1000
      ) {
        candidates.push({
          orderId: order.id,
          riderId: order.riderId,
          eventType: "auto_receipt_hold",
          eventLevel: "critical",
          description: `订单 ${order.orderNo} 自动确认已冻结超过48小时，请处理申诉、退款或风险事件。`,
        });
      }
    }
    for (const refund of failedRefunds) {
      if (!refund.payment?.bizId) continue;
      candidates.push({
        orderId: refund.payment.bizId,
        eventType: "refund_failed",
        eventLevel: "critical",
        description: `订单 ${refund.payment.orderNo || refund.payment.bizId} 退款失败：${refund.failReason || refund.status}。`,
      });
    }

    let created = 0;
    for (const candidate of candidates) {
      const existing = await this.prisma.deliveryRiskEvent.findFirst({
        where: {
          orderId: candidate.orderId,
          orderType: "errand",
          eventType: candidate.eventType,
          handled: false,
        },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.deliveryRiskEvent.create({
        data: { ...candidate, orderType: "errand" },
      });
      created += 1;
    }
    return { checked: candidates.length, created };
  }

  async riderTransition(orderId: string, riderId: string, dto: any) {
    const status = this.normalizeRiderStatus(dto?.status);
    if (status === "completed")
      throw new BadRequestException("骑手只能标记送达，不能确认完成");
    if (status === "in_progress")
      return this.markInProgress(orderId, riderId, dto);
    if (status === "arrived") return this.markArrived(orderId, riderId, dto);
    throw new BadRequestException("骑手只能更新取货或送达状态");
  }

  async markInProgress(orderId: string, riderId: string, evidence: any = {}) {
    return this.transitionRiderOrder(
      orderId,
      riderId,
      "accepted",
      "in_progress",
      {
        pickupTime: new Date(),
      },
      evidence,
    );
  }

  async markArrived(orderId: string, riderId: string, evidence: any = {}) {
    const order = await this.requireRiderOrder(orderId, riderId, "in_progress");
    try {
      this.assertRequiredDeliveryProof(order, evidence);
    } catch (error) {
      const existingRisk = await this.prisma.deliveryRiskEvent.findFirst({
        where: {
          orderId,
          orderType: "errand",
          eventType: "delivery_evidence_rejected",
          handled: false,
        },
        select: { id: true },
      });
      if (!existingRisk) {
        await this.prisma.deliveryRiskEvent.create({
          data: {
            orderId,
            orderType: "errand",
            riderId,
            eventType: "delivery_evidence_rejected",
            eventLevel: "error",
            description: `订单 ${order.orderNo || order.id} 缺少要求的送达凭证，送达操作已拦截。`,
          },
        });
      }
      throw error;
    }
    const now = new Date();
    const currentPurchaseConfig = order.type === "purchase"
      ? await this.prisma.config.findUnique({
          where: { key: purchaseConfigKey(order.regionId || "global") },
          select: { value: true },
        })
      : null;
    const receiptHours = order.type === "purchase"
      ? purchasePolicy(currentPurchaseConfig?.value).autoReceiptHours
      : 24;
    const receiptConfirmDeadline = new Date(now.getTime() + receiptHours * 60 * 60 * 1000);
    const updated = await this.transitionRiderOrder(
      orderId,
      riderId,
      "in_progress",
      "arrived",
      {
        deliverTime: now,
        receiptConfirmDeadline,
      },
      evidence,
      order,
    );
    await this.releaseRiderAfterDelivery(orderId, riderId);
    return updated;
  }

  async confirmReceipt(
    orderId: string,
    userId: string,
    source: "user" | "system" | "rider" | "admin" = "user",
    receiptCode?: string,
    options: { adminReason?: string } = {},
  ) {
    const adminReason = typeof options.adminReason === "string" ? options.adminReason.trim() : "";
    if (source === "admin" && (!userId?.trim() || !adminReason || adminReason.length > 500)) {
      throw new BadRequestException("请填写 1 至 500 字的管理员代确认原因");
    }
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (source === "user" && order.userId !== userId) {
      throw new BadRequestException("无权确认该订单");
    }
    if (source === "rider") {
      if (order.riderId !== userId)
        throw new BadRequestException("无权确认该订单");
      if (!order.receiptCode)
        throw new BadRequestException("该订单未生成收货码");
      if (String(receiptCode || "").trim() !== order.receiptCode) {
        throw new BadRequestException("收货码不正确");
      }
    }
    if (order.status === "completed" && order.receiptConfirmedAt) return order;
    if (order.status !== "arrived")
      throw new BadRequestException("订单尚未送达，不能确认收货");
    if (
      ["refunding", "refunded"].includes(String(order.refundStatus || "none"))
    ) {
      throw new BadRequestException("订单退款处理中，不能确认收货");
    }

    const appeal = await this.prisma.orderAppeal.findFirst({
        where: {
          orderId,
          orderType: { in: ["errand", "errand_order"] },
          status: {
            notIn: ["resolved", "rejected", "closed", "cancelled", "completed"],
          },
        },
        select: { id: true, status: true },
      });
    if (appeal) throw new BadRequestException("订单售后处理中，暂不能确认收货");

    const now = new Date();
    let confirmed = false;
    let blockedReason: string | null = null;
    const initialOrder = order;
    const updated = await this.prisma.$transaction(async (tx) => {
      let order = initialOrder;
      if (source === "admin" || source === "system") {
        const current = order.type === "purchase"
          ? (await lockPurchase(tx, orderId)).order
          : await tx.errandOrder.findUnique({ where: { id: orderId } });
        if (!current) throw new NotFoundException("订单不存在");
        if (current.status === "completed" && current.receiptConfirmedAt) return current;
        if (current.status !== "arrived") throw new BadRequestException("订单尚未送达，不能确认收货");
        if (["refunding", "refunded"].includes(String(current.refundStatus || "none"))) {
          throw new BadRequestException("订单退款处理中，不能确认收货");
        }
        if (source === "system" && (!current.receiptConfirmDeadline || new Date(current.receiptConfirmDeadline) > now)) {
          throw new BadRequestException("尚未达到自动确认收货时间");
        }
        if (source === "system") {
          const [regionConfig, globalConfig] = await Promise.all([
            tx.config.findUnique({ where: { key: errandExtendedConfigKey(current.regionId || "global") } }),
            current.regionId ? tx.config.findUnique({ where: { key: errandExtendedConfigKey("global") } }) : Promise.resolve(null),
          ]);
          const regional: any = regionConfig?.value || {};
          const global: any = globalConfig?.value || {};
          if ((regional.autoReceiptEnabled ?? regional.auto_receipt_enabled ?? global.autoReceiptEnabled ?? global.auto_receipt_enabled ?? true) === false) {
            throw new BadRequestException("自动确认收货已关闭");
          }
        }
        order = current;
      }
      const [assignmentRisk, existingHold, currentOpenRisk, currentAppeal] = await Promise.all([
        inspectErrandAssignmentRisk(tx, order, order.riderId || ""),
        tx.errandSettlementHold.findUnique({ where: { orderId } }),
        tx.deliveryRiskEvent.findFirst({
          where: {
            orderId,
            orderType: "errand",
            handled: false,
            eventLevel: { in: ["error", "critical"] },
          },
          select: { id: true, eventType: true },
        }),
        tx.orderAppeal.findFirst({
          where: {
            orderId,
            orderType: { in: ["errand", "errand_order"] },
            status: {
              notIn: ["resolved", "rejected", "closed", "cancelled", "completed"],
            },
          },
          select: { id: true, status: true },
        }),
      ]);
      if (currentAppeal) {
        throw new BadRequestException("订单售后处理中，暂不能确认收货");
      }
      const assignmentManualApproved = !!existingHold?.resolvedBy
        && existingHold.reasonCode === `admin_release:${assignmentRisk.eventType}`;
      if (assignmentRisk.blocked || !assignmentManualApproved) {
        await recordErrandAssignmentRisk(
          tx,
          order,
          order.riderId || "",
          "确认收货结算",
          assignmentRisk,
        );
      }
      const riskBlocked = !!currentOpenRisk
        || assignmentRisk.blocked
        || (
          ["error", "critical"].includes(String(assignmentRisk.eventLevel || ""))
          && !assignmentManualApproved
        );
      if ((source === "admin" || source === "system") && riskBlocked) {
        // Keep newly discovered risk visible to administrators. Throwing here
        // would roll it back and leave an unresolvable, silently blocked order.
        // Commit only the risk record; no completion or money mutation follows.
        blockedReason = "订单存在未处理的严重风险，请先核查处理后再确认收货";
        return order;
      }
      const rejected = existingHold?.status === "rejected";
      const legacyMarketingHold = existingHold?.status === 'holding' && LEGACY_MARKETING_HOLD_REASONS.includes(existingHold.reasonCode);
      const keepExistingHold = existingHold?.status === "holding" && !legacyMarketingHold;
      const shouldHold = rejected || riskBlocked || keepExistingHold;
      const releaseAt = rejected || riskBlocked
        ? null
        : keepExistingHold ? existingHold.releaseAt || now : null;
      const holdReason = rejected
        ? existingHold.reasonCode
        : riskBlocked
          ? currentOpenRisk?.eventType || assignmentRisk.reasonCode || "risk_review_required"
          : assignmentManualApproved
            ? existingHold.reasonCode
            : existingHold?.reasonCode || "admin_release_pending_recheck";
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id: orderId,
          userId: order.userId,
          status: "arrived",
          refundStatus: { notIn: ["refunding", "refunded"] },
          ...(source === "system" ? { receiptConfirmDeadline: { lte: now } } : {}),
        },
        data: {
          status: "completed",
          receiptConfirmedAt: now,
          receiptConfirmedBy: source,
          completeTime: now,
          settlementEligibleAt: shouldHold ? releaseAt : now,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      }

      // Freeze the fee in the receipt transaction; held payouts reuse this amount.
      const feeConfig = await tx.bizFeeConfig.findUnique({ where: { bizType: "errand_order" } });
      const platformFee = errandPlatformFee(order, feeConfig);
      await tx.errandOrder.update({ where: { id: orderId }, data: { platformFee } });
      await tx.deliveryOrderNode.create({
        data: {
          orderId,
          orderType: "errand",
          nodeType: "completed",
          nodeLabel:
            source === "system"
              ? "超时自动确认收货"
              : source === "admin"
                ? "管理员代确认收货"
                : source === "rider"
                  ? "骑手凭收货码确认收货"
                  : "用户已确认收货",
          operatorId: source === "system" ? null : userId,
          operatorType: source,
          riderType: "part_time",
          displayMode: order.deliveryDisplayMode || "status_nodes",
          remark:
            source === "system"
              ? "达到订单约定的自动确认时间，系统自动确认"
              : source === "admin"
                ? adminReason
                : source === "rider"
                  ? "骑手凭收货码完成核销"
                  : "用户主动确认收货",
        },
      });
      if (source === "admin") {
        await tx.adminOperationLog.create({
          data: {
            accountId: userId, action: "CONFIRM_ERRAND_RECEIPT", module: "errand",
            targetId: orderId, targetType: "errand_order",
            detail: { orderNo: order.orderNo, reason: adminReason, source, fromStatus: "arrived", toStatus: "completed" },
          },
        });
      }
      if (order.type === "purchase") {
        await purchaseEvent(tx, orderId, source === "system" ? "system" : userId, "receipt_confirmed", {
          source, ...(source === "admin" ? { reason: adminReason } : {}),
          receiptConfirmedAt: now.toISOString(),
        });
      }
      if (shouldHold && order.riderId) {
        await tx.errandSettlementHold.upsert({
          where: { orderId },
          create: {
            orderId,
            riderId: order.riderId,
            status: rejected ? "rejected" : "holding",
            reasonCode: holdReason,
            releaseAt,
          },
          update: {
            riderId: order.riderId,
            status: rejected ? "rejected" : "holding",
            reasonCode: holdReason,
            releaseAt,
          },
        });
      } else {
        if (legacyMarketingHold) {
          const released = await tx.errandSettlementHold.updateMany({
            where: { id: existingHold.id, status: 'holding', reasonCode: existingHold.reasonCode },
            data: { status: 'released', releaseAt: now, resolvedAt: now,
              resolvedBy: 'system:receipt', reasonCode: 'receipt_risk_check_passed' },
          });
          if (released.count !== 1) throw new BadRequestException('结算状态已变化，请刷新后重试');
        }
        await this.creditConfirmedRiderIncome(tx, { ...order, platformFee }, now);
      }
      confirmed = true;
      return tx.errandOrder.findUniqueOrThrow({ where: { id: orderId } });
    }, initialOrder.type === "purchase" ? PURCHASE_TRANSACTION_OPTIONS : undefined);
    if (blockedReason) throw new BadRequestException(blockedReason);
    if (!confirmed) return updated;
    this.riderPayout?.kick();
    // Income that could not be sent to WeChat is announced now; transfers announce themselves when they settle.
    await this.riderPayout?.announceKept(orderId).catch(() => undefined);
    await this.dispatchLifecycleNotification(updated, "errand_delivered");
    return updated;
  }

  /**
   * 收货确认是跑腿基础配送费真正可结算的唯一业务节点。
   * 在同一事务内把明细并入骑手当日的已入账结算单，同时增加钱包余额，
   * 避免“订单已完成但余额仍为 0”，也避免财务列表每单产生一张结算单。
   * 后续退款仍由既有结算冲正/骑手负债流程处理。
   */
  private async creditConfirmedRiderIncome(tx: any, order: any, now: Date) {
    return creditConfirmedRiderIncome(tx, {
      orderType: "errand",
      orderId: order.id,
      orderNo: order.orderNo,
      riderId: order.riderId,
      ownerUserId: order.userId,
      regionId: order.regionId,
      deliveryFeeAmount: Number(order.price || 0),
      tipAmount: Number(order.tip || 0),
      platformFeeAmount: Number(order.platformFee || 0),
      reserveAutoPayout: this.riderPayout ? (tx, amount) => this.riderPayout!.reserve(tx, order, amount) : undefined,
      now,
    });
  }

  private async transitionRiderOrder(
    orderId: string,
    riderId: string,
    fromStatus: string,
    toStatus: string,
    timeData: Record<string, Date>,
    evidence: any,
    existingOrder?: any,
  ) {
    const order =
      existingOrder ||
      (await this.requireRiderOrder(orderId, riderId, fromStatus));
    const proofImages = this.proofImages(evidence);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (order.type === 'purchase') {
        const purchase = await lockPurchase(tx, orderId);
        if (toStatus === 'in_progress') await assertPurchaseReadyForDelivery(tx, purchase.order);
      }
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id: orderId,
          riderId,
          status: fromStatus,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: { status: toStatus, ...timeData },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      }
      await tx.deliveryOrderNode.create({
        data: {
          orderId,
          orderType: "errand",
          nodeType: toStatus,
          nodeLabel:
            toStatus === "arrived" ? "骑手已送达，等待用户确认" : "骑手已取货",
          operatorId: riderId,
          operatorType: "rider",
          riderType: "part_time",
          displayMode: order.deliveryDisplayMode || "status_nodes",
          lat: this.coordinate(evidence?.lat ?? evidence?.latitude),
          lng: this.coordinate(evidence?.lng ?? evidence?.longitude),
          address: evidence?.address || null,
          proofImages: proofImages.length ? proofImages : undefined,
          remark: evidence?.remark || null,
        },
      });
      return tx.errandOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
    if (toStatus === "in_progress") {
      await this.dispatchLifecycleNotification(updated, "errand_picked");
    } else if (toStatus === "arrived") {
      await this.dispatchLifecycleNotification(updated, "errand_arrived");
    }
    return updated;
  }

  private async dispatchLifecycleNotification(
    order: any,
    scene: "errand_picked" | "errand_arrived" | "errand_delivered",
  ) {
    if (!this.notifyService || !order?.userId) return;

    const rider = order.riderId
      ? await this.prisma.regionRider
          .findUnique({
            where: { userId: order.riderId },
            select: { realName: true },
          })
          .catch(() => null)
      : null;
    const isPicked = scene === "errand_picked";
    const isArrived = scene === "errand_arrived";
    const occurredAt = isPicked
      ? order.pickupTime || new Date()
      : isArrived
        ? order.deliverTime || new Date()
        : order.completeTime || new Date();

    try {
      await this.notifyService.createAndDispatch({
        userId: order.userId,
        regionId: order.regionId || undefined,
        type: "delivery",
        scene,
        title: isPicked
          ? "骑手已取件"
          : isArrived
            ? "骑手已送达，请确认收货"
            : "订单已完成",
        content: isPicked
          ? `您的跑腿订单 ${order.orderNo || ""} 已由骑手取件，正在配送中。`
          : isArrived
            ? `您的跑腿订单 ${order.orderNo || ""} 已送达，请确认收货。`
            : `您的跑腿订单 ${order.orderNo || ""} 已完成，感谢您的使用。`,
        data: {
          orderId: order.id,
          orderNo: order.orderNo || "",
          riderName: rider?.realName || "骑手",
          pickupAddress: order.pickupAddress || "",
          deliveryAddress: order.deliverAddress || "",
          estimatedTime: this.formatWechatTime(occurredAt),
          pickedAt: this.formatWechatTime(occurredAt),
          finishedAt: this.formatWechatTime(occurredAt),
          remark: isPicked
            ? "骑手已取件，正在配送中"
            : isArrived
              ? "已送达，请确认收货"
              : "订单已完成",
        },
        linkType: "page",
        linkValue: `/pagesA/order/errand-detail/errand-detail?order_id=${order.id}`,
        channelMask: {
          inApp: true,
          websocket: true,
          push: false,
          // 一次性订阅额度留给最终 completed；arrived 复用服务号模板。
          wechatSubscribe: !isArrived,
          officialAccount: true,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `跑腿微信通知失败 order=${order.id} scene=${scene}: ${error?.message || error}`,
      );
    }
  }

  private formatWechatTime(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return safeDate.toLocaleString("zh-CN", {
      hour12: false,
      timeZone: "Asia/Shanghai",
    });
  }

  private async requireRiderOrder(
    orderId: string,
    riderId: string,
    status: string,
  ) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.riderId !== riderId)
      throw new BadRequestException("无权操作该订单");
    if (
      ["refunding", "refunded"].includes(String(order.refundStatus || "none"))
    ) {
      throw new BadRequestException("订单退款处理中，不能继续配送");
    }
    if (order.status !== status)
      throw new BadRequestException("当前订单状态不允许这样操作");
    return order;
  }

  private assertRequiredDeliveryProof(order: any, evidence: any) {
    const remark = this.parseRemark(order?.remark);
    const required = remark?.risk_assessment?.required_evidence;
    if (
      Array.isArray(required) &&
      required.length > 0 &&
      this.proofImages(evidence).length === 0
    ) {
      throw new BadRequestException("请上传送达凭证");
    }
  }

  private async releaseRiderAfterDelivery(orderId: string, riderId: string) {
    const receiverLookup =
      typeof (this.prisma.regionRider as any).findUnique === "function"
        ? this.prisma.regionRider
            .findUnique({
              where: { userId: riderId },
              select: { verifyStatus: true, riderType: true },
            })
            .catch(() => null)
        : Promise.resolve({ verifyStatus: "approved", riderType: "part_time" });
    const [activeErrandCount, activeShopCount, receiver] = await Promise.all([
      this.prisma.errandOrder.count({
        where: {
          id: { not: orderId },
          riderId,
          status: { in: ["accepted", "in_progress"] },
        },
      }),
      this.prisma.order.count({ where: { riderId, status: "SHIPPED" as any } }),
      receiverLookup,
    ]);
    const hasActiveOrders = activeErrandCount + activeShopCount > 0;
    if (
      !receiver ||
      (!["approved", "ordinary_user"].includes(receiver.verifyStatus) &&
        receiver.riderType !== "ordinary_user")
    ) {
      return;
    }
    await this.prisma.regionRider
      .updateMany({
        where: { userId: riderId },
        data: {
          status:
            receiver?.verifyStatus === "approved"
              ? hasActiveOrders
                ? "busy"
                : "online"
              : hasActiveOrders
                ? "busy"
                : "offline",
        },
      })
      .catch(() => undefined);
  }

  private normalizeRiderStatus(value: unknown) {
    const status = String(value || "").trim();
    const map: Record<string, string> = {
      picked_up: "in_progress",
      delivering: "in_progress",
      delivered: "arrived",
    };
    return map[status] || status;
  }

  private proofImages(evidence: any) {
    const images = evidence?.proof_images ?? evidence?.proofImages;
    return Array.isArray(images) ? images.filter(Boolean).slice(0, 9) : [];
  }

  private parseRemark(value: unknown): any {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  }

  private coordinate(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
