import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { AuditAction, RoleType, UserStatus } from "@prisma/client";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { PaymentService } from "../payment/payment.service";
import { MembershipService } from "../membership/membership.service";
import { WsNativeGateway } from "../websocket/ws-native.gateway";
import { UserSessionRevocationService } from "../websocket/user-session-revocation.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { NotifyService } from "../notify/notify.service";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { checkPasswordStrength } from "../../common/utils/password-policy";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminDataScope: AdminDataScopeService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService?: PaymentService,
    private readonly membershipService?: MembershipService,
    @Optional()
    private readonly wsNative?: WsNativeGateway,
    @Optional()
    private readonly userSessionRevocation?: UserSessionRevocationService,
    @Optional()
    private readonly notifyService?: NotifyService,
  ) {}

  private normalizeUserStatus(status: any): UserStatus {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();
    if (["active", "enabled", "enable", "normal", "ok"].includes(normalized))
      return UserStatus.ACTIVE;
    if (["inactive", "disabled", "disable", "frozen"].includes(normalized))
      return UserStatus.INACTIVE;
    if (["banned", "ban", "blacklist", "blocked"].includes(normalized))
      return UserStatus.BANNED;
    if (["deleted", "delete"].includes(normalized)) return UserStatus.DELETED;
    const upper = String(status || "")
      .trim()
      .toUpperCase();
    if (["ACTIVE", "INACTIVE", "BANNED", "DELETED"].includes(upper))
      return upper as UserStatus;
    throw new BadRequestException("不支持的用户状态");
  }

  private async revokeUserAccess(userId: string) {
    if (this.userSessionRevocation) {
      await this.userSessionRevocation.revoke(userId);
      return;
    }
    await this.redis.del(`refresh:${userId}`).catch(() => undefined);
    this.wsNative?.disconnectUser(userId);
  }

  private moneyToCents(value: any) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }

  private async safeAdminRead<T>(
    reader: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await reader();
    } catch (e) {
      return fallback;
    }
  }

  private userRegionScopeWhere(regionIds: string[]) {
    return {
      OR: [
        { profile: { is: { regionId: { in: regionIds } } } },
        { addresses: { some: { regionId: { in: regionIds } } } },
        { posts: { some: { regionId: { in: regionIds } } } },
        { botAccount: { is: { regionId: { in: regionIds } } } },
      ],
    };
  }

  /** User-owned financial records have no region column, so resolve scope from durable user-region relations. */
  private async assertUserRegionAccess(
    operatorId: string | undefined,
    userId: string,
  ) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!scope.regionIds.length)
      throw new ForbiddenException("当前管理员未绑定区域数据范围");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profile: { select: { regionId: true } },
        addresses: { select: { regionId: true } },
        posts: { select: { regionId: true } },
        botAccount: { select: { regionId: true } },
      },
    });
    if (!user) throw new NotFoundException("用户不存在");

    const userRegionIds = new Set<string>();
    if (user.profile?.regionId) userRegionIds.add(user.profile.regionId);
    user.addresses.forEach(
      (item) => item.regionId && userRegionIds.add(item.regionId),
    );
    user.posts.forEach(
      (item) => item.regionId && userRegionIds.add(item.regionId),
    );
    if (user.botAccount?.regionId) userRegionIds.add(user.botAccount.regionId);
    if (!scope.regionIds.some((regionId) => userRegionIds.has(regionId))) {
      throw new ForbiddenException("无权访问该区域数据");
    }
  }

  private async assertOrderRegionAccess(
    operatorId: string | undefined,
    orderId: string,
    knownRegionId?: string | null,
  ) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    const regionId =
      knownRegionId === undefined
        ? (
            await this.prisma.order.findUnique({
              where: { id: orderId },
              select: { merchant: { select: { regionId: true } } },
            })
          )?.merchant?.regionId
        : knownRegionId;
    if (!regionId || !scope.regionIds.includes(regionId))
      throw new ForbiddenException("无权处理该区域外卖订单");
  }

  private async paymentRefundRegionWhere(operatorId?: string) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return {};
    if (!scope.regionIds.length) return { id: { in: [] } };
    const [orders, errandOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { merchant: { regionId: { in: scope.regionIds } } },
        select: { id: true },
      }),
      this.prisma.errandOrder.findMany({
        where: { regionId: { in: scope.regionIds } },
        select: { id: true },
      }),
    ]);
    const branches = [
      ...(orders.length
        ? [{ bizType: "order", bizId: { in: orders.map((item) => item.id) } }]
        : []),
      ...(errandOrders.length
        ? [
            {
              bizType: "errand_order",
              bizId: { in: errandOrders.map((item) => item.id) },
            },
          ]
        : []),
    ];
    return branches.length
      ? { payment: { is: { OR: branches } } }
      : { id: { in: [] } };
  }

  private async assertPaymentRefundRegionAccess(
    operatorId: string | undefined,
    refund: any,
  ) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    const payment = refund?.payment;
    let regionId: string | null | undefined;
    if (payment?.bizType === "order" && payment.bizId) {
      regionId = (
        await this.prisma.order.findUnique({
          where: { id: payment.bizId },
          select: { merchant: { select: { regionId: true } } },
        })
      )?.merchant?.regionId;
    } else if (payment?.bizType === "errand_order" && payment.bizId) {
      regionId = (
        await this.prisma.errandOrder.findUnique({
          where: { id: payment.bizId },
          select: { regionId: true },
        })
      )?.regionId;
    }
    if (!regionId || !scope.regionIds.includes(regionId))
      throw new ForbiddenException("无权处理该区域退款");
  }

  private async assertReviewRegionAccess(
    operatorId: string | undefined,
    review: any,
  ) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    const merchant = review?.merchantId
      ? await this.prisma.merchant.findUnique({
          where: { id: review.merchantId },
          select: { regionId: true },
        })
      : null;
    if (!merchant?.regionId || !scope.regionIds.includes(merchant.regionId)) {
      throw new ForbiddenException("无权处理该区域商家评价");
    }
  }

  private async assertMerchantSettlementRegionAccess(
    operatorId: string | undefined,
    merchant: any,
  ) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!merchant?.regionId || !scope.regionIds.includes(merchant.regionId)) {
      throw new ForbiddenException("无权操作该区域商家结算");
    }
  }

  private compactText(value: any, length = 48) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > length ? `${text.slice(0, length)}...` : text;
  }

  private parseShareList(value: any) {
    if (Array.isArray(value))
      return value.map((item) => String(item).trim()).filter(Boolean);
    if (!value) return [];
    return String(value)
      .split(/[\n,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeShareSettingsPayload(dto: any) {
    const data = { ...(dto || {}) };
    for (const key of [
      "inviterWhitelist",
      "inviterBlacklist",
      "inviteeBlacklist",
      "blockedPhonePrefixes",
    ]) {
      if (key in data) data[key] = this.parseShareList(data[key]);
    }
    if (data.rewardReleaseMode !== undefined) {
      const mode = String(data.rewardReleaseMode || "")
        .trim()
        .toLowerCase();
      data.rewardReleaseMode = [
        "immediate",
        "manual",
        "delayed",
        "qualified",
      ].includes(mode)
        ? mode
        : "immediate";
    }
    return data;
  }

  private isCountedComment(comment: any) {
    return (
      !!comment &&
      !comment.deletedAt &&
      comment.status === "active" &&
      comment.auditStatus === "approved"
    );
  }

  private isPublishedPost(post: any) {
    return (
      !!post &&
      !post.deletedAt &&
      post.status === "PUBLISHED" &&
      post.auditStatus === "approved"
    );
  }

  private async clearPostFeedCache(regionId?: string | null) {
    if (!regionId) return;
    await this.redis
      .delPattern(`post:feed:${regionId}:*`)
      .catch(() => undefined);
  }

  private async syncTopicPostCounts(
    oldTopicIds: string[] = [],
    newTopicIds: string[] = [],
  ) {
    const decIds = oldTopicIds.filter((id) => id && !newTopicIds.includes(id));
    const incIds = newTopicIds.filter((id) => id && !oldTopicIds.includes(id));
    await Promise.all([
      ...decIds.map((id) =>
        this.prisma.topic.updateMany({
          where: { id, postCount: { gt: 0 } },
          data: { postCount: { decrement: 1 } },
        }),
      ),
      ...incIds.map((id) =>
        this.prisma.topic
          .update({ where: { id }, data: { postCount: { increment: 1 } } })
          .catch(() => undefined),
      ),
    ]);
  }

  private async recountCirclePostCount(circleId?: string | null) {
    if (!circleId) return;
    const postCount = await this.prisma.post.count({
      where: {
        circleId,
        status: "PUBLISHED",
        auditStatus: "approved",
        deletedAt: null,
      },
    });
    await this.prisma.circle
      .update({ where: { id: circleId }, data: { postCount } })
      .catch(() => undefined);
  }

  private async clearPostFeedCacheByPostId(postId?: string | null) {
    if (!postId) return;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { regionId: true },
    });
    await this.clearPostFeedCache(post?.regionId);
  }

  private async updateCommentWithCounter(id: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.comment.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("评论不存在");
      const after = await tx.comment.update({ where: { id }, data });
      const beforeCounted = this.isCountedComment(before);
      const afterCounted = this.isCountedComment(after);
      if (beforeCounted !== afterCounted) {
        if (afterCounted) {
          await tx.post.update({
            where: { id: before.postId },
            data: { commentCount: { increment: 1 } },
          });
        } else {
          await tx.post.updateMany({
            where: { id: before.postId, commentCount: { gt: 0 } },
            data: { commentCount: { decrement: 1 } },
          });
        }
      }
      return after;
    });
  }

  private normalizeReportStatus(status: any) {
    const value = String(status || "resolved")
      .trim()
      .toLowerCase();
    if (["resolved", "handled", "approved", "pass", "done"].includes(value))
      return "resolved";
    if (["rejected", "reject", "false", "invalid"].includes(value))
      return "rejected";
    if (["processing", "process"].includes(value)) return "processing";
    if (["pending", "wait"].includes(value)) return "pending";
    throw new BadRequestException("不支持的举报状态");
  }

  private normalizeReportAction(action: any) {
    const value = String(action || "none")
      .trim()
      .toLowerCase();
    if (
      [
        "none",
        "noop",
        "only_record",
        "warn",
        "warn_user",
        "仅记录",
        "警告",
      ].includes(value)
    )
      return "none";
    if (
      ["hide", "hide_content", "hidden", "屏蔽内容", "隐藏内容"].includes(value)
    )
      return "hide_content";
    if (["delete", "remove", "delete_content", "删除内容"].includes(value))
      return "delete_content";
    if (["mute", "mute_user", "禁言", "禁言用户"].includes(value))
      return "mute_user";
    if (["ban", "ban_user", "block_user", "封禁", "封禁用户"].includes(value))
      return "ban_user";
    throw new BadRequestException("不支持的举报处置动作");
  }

  private async applyReportAction(
    report: any,
    action: string,
    result?: string,
    muteDays?: number,
  ) {
    const reason = result || "举报处理";
    const effects: string[] = [];
    const commentTargetId = () => {
      const images =
        report.images && typeof report.images === "object" ? report.images : {};
      const fromImages = (images as any).commentId;
      const fromDetail = String(report.detail || "").match(
        /\[comment:([^\]]+)\]/,
      )?.[1];
      return fromImages || fromDetail || report.targetId;
    };

    if (action === "hide_content" || action === "delete_content") {
      if (report.targetType === "post") {
        const data =
          action === "delete_content"
            ? {
                status: "DELETED",
                deletedAt: new Date(),
                auditStatus: "rejected",
                auditReason: reason,
                isTop: false,
                topExpireAt: null,
              }
            : {
                status: "REJECTED",
                auditStatus: "rejected",
                auditReason: reason,
                isTop: false,
                topExpireAt: null,
              };
        const updated = await this.prisma.post.updateMany({
          where: { id: report.targetId },
          data: data as any,
        });
        if (updated.count)
          effects.push(
            action === "delete_content" ? "帖子已删除" : "帖子已隐藏",
          );
      } else if (report.targetType === "comment") {
        await this.updateCommentWithCounter(
          commentTargetId(),
          action === "delete_content"
            ? {
                status: "deleted",
                deletedAt: new Date(),
                auditStatus: "approved",
                auditReason: reason,
                isTop: false,
              }
            : {
                status: "hidden",
                auditStatus: "approved",
                auditReason: reason,
                isTop: false,
              },
        );
        effects.push(action === "delete_content" ? "评论已删除" : "评论已隐藏");
      } else if (
        ["second_hand", "secondHand", "secondhand"].includes(report.targetType)
      ) {
        const data =
          action === "delete_content"
            ? { status: "REJECTED", auditReason: reason }
            : { status: "OFFLINE", auditReason: reason };
        const updated = await this.prisma.secondHand.updateMany({
          where: { id: report.targetId },
          data: data as any,
        });
        if (updated.count)
          effects.push(
            action === "delete_content" ? "二手商品已驳回" : "二手商品已下架",
          );
      }
    }

    if (action === "mute_user" && report.reportedId) {
      const days = Math.max(
        1,
        Math.min(365, Math.floor(Number(muteDays) || 7)),
      );
      const muteEndAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: report.reportedId },
        data: { muteEndAt, muteReason: reason },
      });
      effects.push(`被举报用户已禁言 ${days} 天`);
    }

    if (action === "ban_user" && report.reportedId) {
      await this.prisma.user.update({
        where: { id: report.reportedId },
        data: { status: UserStatus.BANNED, muteReason: reason },
      });
      await this.revokeUserAccess(report.reportedId);
      effects.push("被举报用户已封禁");
    }

    return effects;
  }

  private getHomeTabId(tab: any, index = 0) {
    if (tab?.id !== undefined && tab?.id !== null && tab?.id !== "") {
      const parsed = Number(tab.id);
      if (Number.isFinite(parsed)) return String(parsed);
    }
    const key = String(
      tab?.type || tab?.pageType || tab?.name || "",
    ).toLowerCase();
    const map: Record<string, string> = {
      note: "0",
      post: "0",
      笔记: "0",
      takeout: "1",
      delivery: "1",
      merchant: "1",
      mall: "1",
      外卖: "1",
      商家: "1",
      secondhand: "2",
      second_hand: "2",
      二手: "2",
      activity: "3",
      activities: "3",
      活动: "3",
      rating: "4",
      vote: "4",
      photo_vote: "4",
      评分: "4",
      punch: "5",
      checkin: "5",
      checkin_map: "5",
      打卡: "5",
      打卡地点: "5",
    };
    return map[key] || String(index);
  }

  private normalizeRegionTabs(tabs: any) {
    if (!Array.isArray(tabs)) return [];
    const defaultIconMap: Record<string, string> = {
      note: "/static/logo.jpg",
      takeout: "/static/yw.png",
      secondhand: "/static/yhq.png",
      activity: "/static/tj.png",
      rating: "/static/v.png",
      checkin: "/static/icon-weizhi.png",
    };
    return tabs.map((tab, index) => ({
      ...tab,
      id: this.getHomeTabId(tab, index),
      icon:
        tab?.icon ||
        tab?.iconUrl ||
        defaultIconMap[String(tab?.type || "").toLowerCase()] ||
        "/static/logo.jpg",
      image:
        tab?.image ||
        tab?.imageUrl ||
        tab?.icon ||
        defaultIconMap[String(tab?.type || "").toLowerCase()] ||
        "/static/logo.jpg",
      enabled: tab?.enabled !== false,
      sortOrder: tab?.sortOrder ?? tab?.sort_order ?? index,
    }));
  }

  // ==================== 操作日志 ====================
  private async logOperation(
    accountId: string,
    action: string,
    module: string,
    targetId?: string,
    targetType?: string,
    detail?: any,
    ip?: string,
  ) {
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId,
          action,
          module,
          targetId: targetId || null,
          targetType: targetType || null,
          detail: detail
            ? typeof detail === "string"
              ? { message: detail }
              : detail
            : null,
          ip: ip || null,
        },
      });
    } catch (e: any) {
      // 日志写入失败不影响主流程
    }
  }

  private async assertDtoRegionAccess(dto: any, operatorId?: string) {
    const regionId = dto?.regionId || dto?.region_id;
    if (regionId)
      await this.adminDataScope.assertRegionAccess(
        operatorId,
        String(regionId),
      );
  }

  private async assertRecordRegionAccess(
    modelName: string,
    id: string,
    operatorId?: string,
  ) {
    if (!operatorId) return;
    const delegate = (this.prisma as any)[modelName];
    if (!delegate?.findUnique) return;
    const record = await delegate.findUnique({
      where: { id },
      select: { regionId: true },
    });
    if (record?.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, record.regionId);
  }

  // ==================== 仪表盘 ====================
  async dashboard() {
    const today = this.getTodayStart();
    const yesterday = this.getYesterdayStart();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [
      userCount,
      todayUsers,
      yesterdayUsers,
      postCount,
      todayPosts,
      commentCount,
      todayComments,
      pendingPosts,
      merchantCount,
      activeMerchantCount,
      pendingMerchants,
      pendingWithdraws,
      pendingReports,
      pendingRefunds,
      pendingCerts,
      todayOrders,
      yesterdayOrders,
      totalOrders,
      todayPaidAmount,
      yesterdayPaidAmount,
      totalGmv,
      regionCount,
      dauEstimate,
      todayActiveUsers,
      systemErrorCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { createdAt: { gte: today } } }),
      this.prisma.comment.count({ where: { deletedAt: null } }),
      this.prisma.comment.count({ where: { createdAt: { gte: today } } }),
      this.prisma.post.count({ where: { auditStatus: "pending" } }),
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: "approved" } }),
      this.prisma.merchant.count({ where: { status: "pending" } }),
      this.prisma.withdraw.count({ where: { status: "PENDING" } }),
      this.prisma.report.count({ where: { status: "pending" } }),
      this.prisma.refund.count({ where: { status: "pending" } }),
      this.prisma.studentVerify.count({ where: { status: "PENDING" } }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
      this.prisma.order.count(),
      this.prisma.paymentOrder.aggregate({
        where: { createdAt: { gte: today }, status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.aggregate({
        where: { createdAt: { gte: yesterday, lt: today }, status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.aggregate({
        where: { status: "paid" },
        _sum: { amount: true },
      }),
      this.prisma.region.count(),
      this.prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
      // 今日活跃用户（今天有登录行为的用户）
      this.prisma.user.count({ where: { lastLoginAt: { gte: today } } }),
      // 系统异常数（今日 ServerLog 中 5xx 错误）
      this.prisma.serverLog.count({
        where: { createdAt: { gte: today }, level: "error" },
      }),
    ]);

    const todayGmv = Number(todayPaidAmount._sum.amount || 0);
    const yesterdayGmv = Number(yesterdayPaidAmount._sum.amount || 0);
    const gmvGrowth =
      yesterdayGmv > 0
        ? Math.round(((todayGmv - yesterdayGmv) / yesterdayGmv) * 10000) / 100
        : 0;
    const totalGmvVal = Number(totalGmv._sum.amount || 0);

    return {
      todayGmv: Math.round(todayGmv * 100),
      yesterdayGmv: Math.round(yesterdayGmv * 100),
      gmvGrowth,
      totalGmv: Math.round(totalGmvVal * 100),
      todayOrders,
      yesterdayOrders,
      totalOrders,
      orderGrowth:
        yesterdayOrders > 0
          ? Math.round(
              ((todayOrders - yesterdayOrders) / yesterdayOrders) * 100,
            )
          : 0,
      totalUsers: userCount,
      todayNewUsers: todayUsers,
      todayActiveUsers,
      userGrowth:
        yesterdayUsers > 0
          ? Math.round(((todayUsers - yesterdayUsers) / yesterdayUsers) * 100)
          : 0,
      dauEstimate,
      postCount,
      todayPosts,
      commentCount,
      todayComments,
      merchantCount,
      activeMerchantCount,
      regionCount,
      pendingPosts,
      pendingMerchants,
      pendingWithdraws,
      pendingReports,
      pendingRefunds,
      pendingCerts,
      systemErrorCount,
    };
  }

  /** 平台仪表盘近7天趋势 */
  async dashboardTrends() {
    const days = 7;
    const result = [] as Array<{
      date: string;
      users: number;
      orders: number;
      gmv: number;
      posts: number;
    }>;

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const dateLabel = `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}`;

      const [users, orders, gmvAgg, posts] = await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
        this.prisma.paymentOrder.aggregate({
          where: { createdAt: { gte: start, lt: end }, status: "paid" },
          _sum: { amount: true },
        }),
        this.prisma.post.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
      ]);

      result.push({
        date: dateLabel,
        users,
        orders,
        gmv: Math.round(Number(gmvAgg._sum.amount || 0) * 100),
        posts,
      });
    }

    return result;
  }

  /** 平台各区域/学校数据概览 */
  async dashboardRegions() {
    const regions = await this.prisma.region.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const list = await Promise.all(
      regions.map(async (r) => {
        const [userCount, postCount, merchantCount, orderCount] =
          await Promise.all([
            this.prisma.user.count({
              where: { addresses: { some: { regionId: r.id } } },
            }),
            this.prisma.post.count({ where: { regionId: r.id } }),
            this.prisma.merchant.count({ where: { regionId: r.id } }),
            this.prisma.order.count({
              where: { merchant: { regionId: r.id } },
            }),
          ]);
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          isOpen: r.isOpen,
          userCount,
          postCount,
          merchantCount,
          orderCount,
          createdAt: r.createdAt,
        };
      }),
    );

    return { list };
  }

  /** 仪表盘实时动态（最近用户、帖子、订单、管理操作） */
  async dashboardRecent() {
    const [recentUsers, recentPosts, recentOrders, recentOps] =
      await Promise.all([
        this.prisma.user.findMany({
          select: { id: true, nickname: true, avatar: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        this.prisma.post.findMany({
          select: {
            id: true,
            title: true,
            user: { select: { nickname: true } },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        this.prisma.order.findMany({
          select: {
            id: true,
            orderNo: true,
            payAmount: true,
            status: true,
            createdAt: true,
          },
          where: { status: { not: "CANCELLED" } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        this.prisma.adminOperationLog.findMany({
          select: {
            id: true,
            action: true,
            module: true,
            targetId: true,
            createdAt: true,
            account: { select: { username: true, realName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    return {
      recentUsers: recentUsers.map((u) => ({
        ...u,
        type: "user" as const,
        desc: `${u.nickname || "新用户"} 注册`,
      })),
      recentPosts: recentPosts.map((p) => ({
        ...p,
        type: "post" as const,
        desc: `${p.user?.nickname || "用户"} 发布了 ${(p.title || "").slice(0, 20)}`,
      })),
      recentOrders: recentOrders.map((o) => ({
        ...o,
        type: "order" as const,
        payAmount: Number(o.payAmount || 0),
        desc: `订单 ${o.orderNo} ${o.status}`,
      })),
      recentOps: recentOps.map((op) => ({
        ...op,
        type: "operation" as const,
        desc: `${op.account?.realName || op.account?.username || "管理员"} ${op.action} ${op.module}`,
      })),
    };
  }

  // ==================== 区域运营工作台 ====================
  async regionOpsOverview() {
    try {
      const regions = await this.prisma.region.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          logo: true,
          isOpen: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const today = this.getTodayStart();
      const overview = await Promise.all(
        regions.map(async (region) => {
          try {
            const [
              userCount,
              merchantCount,
              postCount,
              todayOrders,
              tabbarConfig,
              shareSettings,
            ] = await Promise.all([
              this.prisma.user
                .count({
                  where: { addresses: { some: { regionId: region.id } } },
                })
                .catch(
                  (e: any) => (
                    console.warn("Stats query failed:", e?.message),
                    0
                  ),
                ),
              this.prisma.merchant
                .count({
                  where: { regionId: region.id },
                })
                .catch(
                  (e: any) => (
                    console.warn("Stats query failed:", e?.message),
                    0
                  ),
                ),
              this.prisma.post
                .count({
                  where: { regionId: region.id },
                })
                .catch(
                  (e: any) => (
                    console.warn("Stats query failed:", e?.message),
                    0
                  ),
                ),
              this.prisma.order
                .count({
                  where: {
                    merchant: { regionId: region.id },
                    createdAt: { gte: today },
                  },
                })
                .catch(
                  (e: any) => (
                    console.warn("Stats query failed:", e?.message),
                    0
                  ),
                ),
              this.prisma.regionTabBar
                .findUnique({
                  where: { regionId: region.id },
                })
                .catch(() => null),
              this.prisma.shareSettings
                .findUnique({
                  where: { regionId: region.id },
                })
                .catch(() => null),
            ]);

            let status:
              | "unconfigured"
              | "pending"
              | "running"
              | "warning"
              | "stopped" = "running";
            if (!region.isOpen) status = "stopped";
            else if (!tabbarConfig || !shareSettings) status = "pending";
            else if (merchantCount < 3 || postCount < 20) status = "warning";

            return {
              id: region.id,
              name: region.name,
              code: region.code,
              logo: region.logo,
              status,
              userCount,
              merchantCount,
              postCount,
              todayOrders,
              hasTabbar: !!tabbarConfig,
              hasShareSettings: !!shareSettings,
            };
          } catch {
            return {
              id: region.id,
              name: region.name,
              code: region.code,
              logo: region.logo,
              status: "unconfigured" as const,
              userCount: 0,
              merchantCount: 0,
              postCount: 0,
              todayOrders: 0,
              hasTabbar: false,
              hasShareSettings: false,
            };
          }
        }),
      );

      return { regions: overview };
    } catch {
      return { regions: [] };
    }
  }

  async regionLaunchChecklist(regionId: string) {
    try {
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
      });
      if (!region) throw new NotFoundException("区域不存在");

      const [
        tabbarConfig,
        shareSettings,
        merchantCount,
        productCount,
        postCount,
      ] = await Promise.all([
        this.prisma.regionTabBar
          .findUnique({ where: { regionId } })
          .catch(() => null),
        this.prisma.shareSettings
          .findUnique({ where: { regionId } })
          .catch(() => null),
        this.prisma.merchant
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.product
          .count({
            where: { merchant: { regionId } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.post
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);

      const checklist = [
        {
          id: "basic_info",
          title: "区域基础信息完整",
          status: region.name && region.code ? "completed" : "incomplete",
          description:
            region.name && region.code
              ? "区域名称和编码已配置"
              : "缺少区域名称或编码",
          actionRoute: "/region/config",
          actionText: "去配置",
        },
        {
          id: "logo_cover",
          title: "区域 Logo / 封面已配置",
          status: region.logo ? "completed" : "incomplete",
          description: region.logo ? "Logo 已上传" : "未上传区域 Logo",
          actionRoute: "/region/config",
          actionText: "去配置",
        },
        {
          id: "tabbar",
          title: "底部导航已配置",
          status: tabbarConfig ? "completed" : "incomplete",
          description: tabbarConfig ? "底部导航已配置" : "未配置底部导航",
          actionRoute: "/region/tabbar",
          actionText: "去配置",
        },
        {
          id: "share",
          title: "分享卡片已配置",
          status: shareSettings ? "completed" : "incomplete",
          description: shareSettings ? "分享设置已配置" : "未配置分享卡片",
          actionRoute: "/region/share-settings",
          actionText: "去配置",
        },
        {
          id: "merchant_count",
          title: "商家入驻至少 3 个",
          status:
            merchantCount >= 3
              ? "completed"
              : merchantCount > 0
                ? "warning"
                : "incomplete",
          description: `当前 ${merchantCount} 个商家`,
          actionRoute: "/merchant/list",
          actionText: "去管理",
        },
        {
          id: "product_count",
          title: "商品数量至少 10 个",
          status:
            productCount >= 10
              ? "completed"
              : productCount > 0
                ? "warning"
                : "incomplete",
          description: `当前 ${productCount} 个商品`,
          actionRoute: "/merchant/products",
          actionText: "去管理",
        },
        {
          id: "post_count",
          title: "首批内容至少 20 条",
          status:
            postCount >= 20
              ? "completed"
              : postCount > 0
                ? "warning"
                : "incomplete",
          description: `当前 ${postCount} 条内容`,
          actionRoute: "/content/posts",
          actionText: "去管理",
        },
      ];

      const completedCount = checklist.filter(
        (c) => c.status === "completed",
      ).length;
      const completionRate = Math.round(
        (completedCount / checklist.length) * 100,
      );

      return {
        regionId,
        regionName: region.name,
        checklist,
        completionRate,
        completedCount,
        totalCount: checklist.length,
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return {
        regionId,
        regionName: "",
        checklist: [],
        completionRate: 0,
        completedCount: 0,
        totalCount: 0,
      };
    }
  }

  async regionHealthScore(regionId: string) {
    try {
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
      });
      if (!region) throw new NotFoundException("区域不存在");

      const today = this.getTodayStart();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        todayUsers,
        totalUsers,
        todayPosts,
        totalPosts,
        todayOrders,
        totalOrders,
        merchantCount,
        activeMerchantCount,
        reportCount,
      ] = await Promise.all([
        this.prisma.user
          .count({
            where: {
              addresses: { some: { regionId } },
              createdAt: { gte: today },
            },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.user
          .count({
            where: { addresses: { some: { regionId } } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.post
          .count({
            where: { regionId, createdAt: { gte: today } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.post
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.order
          .count({
            where: { merchant: { regionId }, createdAt: { gte: today } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.order
          .count({
            where: { merchant: { regionId } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.merchant
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.merchant
          .count({
            where: { regionId, status: "approved" },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.report
          .count({
            where: { createdAt: { gte: weekAgo } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);

      const userScore = Math.min(
        100,
        Math.round((todayUsers / Math.max(1, totalUsers * 0.01)) * 100),
      );
      const contentScore = Math.min(100, todayPosts * 5);
      const transactionScore = Math.min(100, todayOrders * 3);
      const merchantScore =
        merchantCount > 0
          ? Math.round((activeMerchantCount / merchantCount) * 100)
          : 0;
      const riskScore = Math.max(0, 100 - reportCount * 5);

      const dimensions = [
        {
          key: "users",
          name: "用户活跃",
          score: userScore,
          trend: todayUsers > 0 ? "up" : "stable",
        },
        {
          key: "content",
          name: "内容活跃",
          score: contentScore,
          trend: todayPosts > 0 ? "up" : "stable",
        },
        {
          key: "transaction",
          name: "交易活跃",
          score: transactionScore,
          trend: todayOrders > 0 ? "up" : "stable",
        },
        {
          key: "merchant",
          name: "商家活跃",
          score: merchantScore,
          trend: activeMerchantCount > 0 ? "up" : "stable",
        },
        {
          key: "risk",
          name: "风险健康",
          score: riskScore,
          trend: reportCount > 5 ? "down" : "stable",
        },
      ];

      const totalScore = Math.round(
        dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
      );

      let level: "excellent" | "healthy" | "warning" | "critical" = "healthy";
      if (totalScore >= 90) level = "excellent";
      else if (totalScore >= 70) level = "healthy";
      else if (totalScore >= 50) level = "warning";
      else level = "critical";

      let summary = "区域运营健康";
      if (totalScore < 50) summary = "区域运营存在较大问题，需要重点关注";
      else if (totalScore < 70) summary = "区域运营部分指标偏低，建议优化";
      else if (merchantCount < 3) summary = "区域运营健康，但商家数量偏少";

      return {
        regionId,
        regionName: region.name,
        score: totalScore,
        level,
        summary,
        dimensions,
        metrics: {
          todayUsers,
          totalUsers,
          todayPosts,
          totalPosts,
          todayOrders,
          totalOrders,
          merchantCount,
          activeMerchantCount,
          reportCount,
        },
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return {
        regionId,
        regionName: "",
        score: 0,
        level: "critical" as const,
        summary: "无法获取健康数据",
        dimensions: [],
        metrics: {},
      };
    }
  }

  async regionOpsTasks(regionId: string) {
    try {
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
      });
      if (!region) throw new NotFoundException("区域不存在");

      const cached = await this.redis.get(`ops:tasks:${regionId}`);
      if (cached) {
        try {
          return { tasks: JSON.parse(cached) };
        } catch {}
      }

      return { tasks: [] };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return { tasks: [] };
    }
  }

  async completeRegionOpsTask(regionId: string, taskId: string) {
    try {
      const cached = await this.redis.get(`ops:tasks:${regionId}`);
      if (cached) {
        try {
          const tasks = JSON.parse(cached);
          const updated = tasks.map((t: any) =>
            t.id === taskId
              ? {
                  ...t,
                  status: "completed",
                  completedAt: new Date().toISOString(),
                }
              : t,
          );
          await this.redis.set(
            `ops:tasks:${regionId}`,
            JSON.stringify(updated),
            86400,
          );
        } catch {}
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async generateRegionOpsTasks(regionId: string) {
    try {
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
      });
      if (!region) throw new NotFoundException("区域不存在");

      const today = this.getTodayStart();
      const [
        merchantCount,
        postCount,
        tabbarConfig,
        shareSettings,
        todayOrders,
      ] = await Promise.all([
        this.prisma.merchant
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.post
          .count({ where: { regionId } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.regionTabBar
          .findUnique({ where: { regionId } })
          .catch(() => null),
        this.prisma.shareSettings
          .findUnique({ where: { regionId } })
          .catch(() => null),
        this.prisma.order
          .count({
            where: { merchant: { regionId }, createdAt: { gte: today } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);

      const tasks: any[] = [];
      let taskId = 1;

      if (postCount < 20) {
        tasks.push({
          id: `task_${taskId++}`,
          regionId,
          title: "内容补给",
          description: `${region.name}内容不足，建议补充 ${20 - postCount} 条校园生活笔记`,
          type: "content",
          priority: "high",
          status: "pending",
          actionText: "去内容审核",
          actionRoute: "/content/posts",
          createdAt: new Date().toISOString(),
        });
      }

      if (merchantCount < 3) {
        tasks.push({
          id: `task_${taskId++}`,
          regionId,
          title: "商家运营",
          description: `${region.name}商家数少于 3 个，建议补充商家或开启招商活动`,
          type: "merchant",
          priority: "high",
          status: "pending",
          actionText: "去商家管理",
          actionRoute: "/merchant/list",
          createdAt: new Date().toISOString(),
        });
      }

      if (!tabbarConfig) {
        tasks.push({
          id: `task_${taskId++}`,
          regionId,
          title: "配置补全",
          description: `${region.name}底部导航未配置，建议进入底部导航管理`,
          type: "config",
          priority: "medium",
          status: "pending",
          actionText: "去底部导航管理",
          actionRoute: "/region/tabbar",
          createdAt: new Date().toISOString(),
        });
      }

      if (!shareSettings) {
        tasks.push({
          id: `task_${taskId++}`,
          regionId,
          title: "配置补全",
          description: `${region.name}分享卡片未配置，建议进入分享设置`,
          type: "config",
          priority: "medium",
          status: "pending",
          actionText: "去分享设置",
          actionRoute: "/region/share-settings",
          createdAt: new Date().toISOString(),
        });
      }

      if (todayOrders === 0) {
        tasks.push({
          id: `task_${taskId++}`,
          regionId,
          title: "交易活跃",
          description: `${region.name}今日无订单，建议检查商家状态或开展营销活动`,
          type: "transaction",
          priority: "low",
          status: "pending",
          actionText: "去营销活动",
          actionRoute: "/marketing/center",
          createdAt: new Date().toISOString(),
        });
      }

      await this.redis.set(
        `ops:tasks:${regionId}`,
        JSON.stringify(tasks),
        86400,
      );
      return { tasks };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      return { tasks: [] };
    }
  }

  // ==================== 用户管理 ====================
  async users(query: any, operatorId?: string) {
    const {
      keyword,
      userId,
      status,
      studentCertStatus,
      regionId,
      userType,
      startDate,
      endDate,
      lastLoginStart,
      lastLoginEnd,
      loginIp,
      loginDevice,
      balanceSort,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    const and: any[] = [];
    const normalizedKeyword = String(keyword || "").trim();
    if (userId) {
      const normalizedUserId = String(userId).trim();
      const numericUid = Number(normalizedUserId);
      if (/^\d+$/.test(normalizedUserId) && Number.isSafeInteger(numericUid)) {
        and.push({
          OR: [
            { id: normalizedUserId },
            { uid: numericUid },
            { publicUid: numericUid },
          ],
        });
      } else {
        where.id = normalizedUserId;
      }
    }
    if (normalizedKeyword) {
      const numericUid = Number(normalizedKeyword);
      const keywordOr: any[] = [
        { nickname: { contains: normalizedKeyword } },
        { phone: { contains: normalizedKeyword } },
        { openid: { contains: normalizedKeyword } },
        { id: { contains: normalizedKeyword } },
        { studentVerify: { realName: { contains: normalizedKeyword } } },
        { studentVerify: { schoolName: { contains: normalizedKeyword } } },
      ];
      if (/^\d+$/.test(normalizedKeyword) && Number.isSafeInteger(numericUid)) {
        keywordOr.push({ uid: numericUid });
        keywordOr.push({ publicUid: numericUid });
      }
      and.push({
        OR: keywordOr,
      });
    }
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (regionId && !scope.isSuperAdmin) {
      await this.adminDataScope.assertRegionAccess(
        operatorId,
        String(regionId),
      );
    }
    const userRegionIds = scope.isSuperAdmin
      ? regionId
        ? [String(regionId)]
        : []
      : regionId
        ? [String(regionId)]
        : scope.regionIds;
    if (userRegionIds.length) {
      and.push({
        OR: [
          { profile: { is: { regionId: { in: userRegionIds } } } },
          { addresses: { some: { regionId: { in: userRegionIds } } } },
          { posts: { some: { regionId: { in: userRegionIds } } } },
          { botAccount: { regionId: { in: userRegionIds } } },
        ],
      });
    } else if (!scope.isSuperAdmin) {
      and.push({ id: { in: [] } });
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    if (lastLoginStart || lastLoginEnd) {
      where.lastLoginAt = {};
      if (lastLoginStart) where.lastLoginAt.gte = new Date(lastLoginStart);
      if (lastLoginEnd)
        where.lastLoginAt.lte = new Date(`${lastLoginEnd}T23:59:59.999Z`);
    }
    if (loginIp) {
      where.lastLoginIp = { contains: String(loginIp).trim() };
    }
    if (loginDevice) {
      where.lastLoginDevice = { contains: String(loginDevice).trim() };
    }
    if (status) {
      const normalizedStatus = String(status).toLowerCase();
      if (["punished", "blacklist", "penalty"].includes(normalizedStatus)) {
        and.push({ OR: [{ status: "BANNED" }, { status: "INACTIVE" }] });
      } else {
        where.status = this.normalizeUserStatus(status);
      }
    }
    if (userType) {
      if (userType === "robot" || userType === "4") {
        where.userType = 4;
      } else if (userType === "merchant") {
        const merchants = await this.prisma.merchant.findMany({
          select: { userId: true },
        });
        and.push({
          id: {
            in: [
              ...new Set(merchants.map((item) => item.userId).filter(Boolean)),
            ],
          },
        });
      } else if (userType === "rider") {
        and.push({ regionRiders: { some: {} } });
      } else if (userType === "agent") {
        and.push({ cityAgent: { isNot: null } });
      } else {
        where.userType = 1;
      }
    }
    if (studentCertStatus) {
      where.studentVerify =
        studentCertStatus === "none"
          ? null
          : { status: studentCertStatus.toUpperCase() };
    }
    if (and.length) where.AND = and;

    const orderBy =
      balanceSort === "asc"
        ? { wallet: { balance: "asc" as const } }
        : balanceSort === "desc"
          ? { wallet: { balance: "desc" as const } }
          : { createdAt: "desc" as const };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      list,
      total,
      totalUsers,
      realUsers,
      robotUsers,
      todayNewUsers,
      verifiedUsers,
      disabledUsers,
      activeUsers,
      memberUsers,
      riskUsers,
      regions,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          studentVerify: true,
          wallet: true,
          botAccount: true,
          memberships: {
            where: { status: "active", expiredAt: { gt: new Date() } },
            orderBy: { expiredAt: "desc" },
            take: 1,
          },
          tags: true,
          addresses: {
            select: { regionId: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          posts: {
            select: { regionId: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              posts: true,
              comments: true,
              orders: true,
              reports: true,
              reported: true,
            },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userType: { not: 4 } } }),
      this.prisma.user.count({ where: { userType: 4 } }),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.studentVerify.count({ where: { status: "APPROVED" } }),
      this.prisma.user.count({
        where: { OR: [{ status: "BANNED" }, { status: "INACTIVE" }] },
      }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: activeSince } } }),
      this.prisma.userMembership.count({
        where: { status: "active", expiredAt: { gt: new Date() } },
      }),
      this.prisma.user.count({
        where: {
          OR: [
            { status: "BANNED" },
            { status: "INACTIVE" },
            {
              reported: { some: { status: { in: ["pending", "processing"] } } },
            },
          ],
        },
      }),
      this.prisma.region.findMany({ select: { id: true, name: true } }),
    ]);
    const regionNameMap = new Map(regions.map((r) => [r.id, r.name]));

    return {
      list: list.map((u) => {
        const formalRegionId = (u.profile as any)?.regionId || "";
        const botRegionId = u.botAccount?.regionId || "";
        const addressRegionId = u.addresses?.[0]?.regionId || "";
        const postRegionId = u.posts?.[0]?.regionId || "";
        const inferredRegionId =
          botRegionId || addressRegionId || postRegionId || "";
        const formalRegionName = formalRegionId
          ? regionNameMap.get(formalRegionId) || u.profile?.region || ""
          : "";
        const currentRegionId = inferredRegionId || formalRegionId || "";
        const currentRegionSource = botRegionId
          ? "robot"
          : addressRegionId
            ? "address"
            : postRegionId
              ? "post"
              : u.profile?.region
                ? "profile_text"
                : formalRegionId
                  ? "profile"
                  : "none";
        const currentRegionName =
          regionNameMap.get(currentRegionId) ||
          (!currentRegionId ? u.profile?.region || "" : "");
        const displayUid = (u as any).publicUid || u.uid || null;
        return {
          id: u.id,
          uid: displayUid,
          openid: u.openid,
          nickname: u.nickname,
          avatar: u.avatar,
          phone: u.phone,
          phoneBound: !!u.phone,
          wxBound: !String(u.openid || "").startsWith("phone_login_"),
          loginIdentifierType: String(u.openid || "").startsWith("phone_login_")
            ? "phone"
            : "wechat",
          bindingSummary: [
            u.phone ? "已绑手机号" : "未绑手机号",
            String(u.openid || "").startsWith("phone_login_")
              ? "待绑定微信"
              : "已绑微信",
          ].join(" / "),
          userType: u.userType === 4 ? "robot" : "miniapp",
          typeLabel: u.userType === 4 ? "机器人" : "小程序用户",
          regionId: formalRegionId,
          regionName: formalRegionName,
          regionSource: formalRegionId ? "profile" : "none",
          ownedRegionId: formalRegionId,
          ownedRegionName: formalRegionName,
          ownedRegionLocked: !!formalRegionId,
          currentRegionId,
          currentRegionName,
          currentRegionSource,
          gender: u.profile?.gender,
          school: u.studentVerify?.schoolName || u.profile?.school,
          realName: u.studentVerify?.realName,
          studentId: u.studentVerify?.studentId,
          studentCertStatus: u.studentVerify?.status?.toLowerCase() || "none",
          balance: Math.round(Number(u.wallet?.balance || 0) * 100),
          freezeAmount: Math.round(Number(u.wallet?.freeze || 0) * 100),
          status:
            u.status === "ACTIVE"
              ? "active"
              : u.status === "BANNED"
                ? "banned"
                : "disabled",
          membershipLabel: (u as any).memberships?.[0]?.planName || "",
          membershipExpiredAt: (u as any).memberships?.[0]?.expiredAt || null,
          tags: (u as any).tags || [],
          postCount: u._count.posts,
          commentCount: u._count.comments,
          reportCount: u._count.reports,
          reportedCount: (u._count as any).reported || 0,
          orderCount: u._count.orders,
          registerIp: "",
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          lastLoginIp: u.lastLoginIp,
          lastLoginCountry: (u as any).lastLoginCountry,
          lastLoginProvince: (u as any).lastLoginProvince,
          lastLoginCity: (u as any).lastLoginCity,
          lastLoginDistrict: (u as any).lastLoginDistrict,
          lastLoginDevice: (u as any).lastLoginDevice,
          lastLoginUserAgent: (u as any).lastLoginUserAgent,
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
      stats: {
        totalUsers,
        realUsers,
        robotUsers,
        todayNewUsers,
        verifiedUsers,
        disabledUsers,
        activeUsers,
        memberUsers,
        riskUsers,
      },
    };
  }

  async userStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      realUsers,
      robotUsers,
      todayNewUsers,
      verifiedUsers,
      disabledUsers,
      activeUsers,
      memberUsers,
      riskUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userType: { not: 4 } } }),
      this.prisma.user.count({ where: { userType: 4 } }),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.studentVerify.count({ where: { status: "APPROVED" } }),
      this.prisma.user.count({
        where: { OR: [{ status: "BANNED" }, { status: "INACTIVE" }] },
      }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: activeSince } } }),
      this.prisma.userMembership.count({
        where: { status: "active", expiredAt: { gt: new Date() } },
      }),
      this.prisma.user.count({
        where: {
          OR: [
            { status: "BANNED" },
            { status: "INACTIVE" },
            {
              reported: { some: { status: { in: ["pending", "processing"] } } },
            },
          ],
        },
      }),
    ]);

    return {
      totalUsers,
      realUsers,
      robotUsers,
      todayNewUsers,
      verifiedUsers,
      disabledUsers,
      activeUsers,
      memberUsers,
      riskUsers,
    };
  }

  async createRobots(dto: any, operatorId?: string, ip?: string) {
    const {
      regionId,
      count = 1,
      nicknamePrefix = "萌友",
      gender = "random",
      avatarMode = "random",
      enabled = true,
      remark = "",
    } = dto;

    if (!regionId) throw new BadRequestException("请选择所属区域");
    if (count < 1 || count > 500)
      throw new BadRequestException("机器人数量需在 1-500 之间");

    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
    });
    if (!region) throw new NotFoundException("区域不存在");

    const genders = ["MALE", "FEMALE", "UNKNOWN"];
    let created = 0;
    let failed = 0;

    const avatars = [
      "https://api.dicebear.com/7.x/avataaars/svg?seed=",
      "https://api.dicebear.com/7.x/bottts/svg?seed=",
      "https://api.dicebear.com/7.x/lorelei/svg?seed=",
    ];

    for (let i = 0; i < count; i++) {
      try {
        const suffix =
          String(Date.now()).slice(-6) + String(i).padStart(3, "0");
        const nickname = `${nicknamePrefix}${suffix}`;
        const openid = `bot_${regionId}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
        const selectedGender =
          gender === "random"
            ? genders[Math.floor(Math.random() * 3)]
            : gender.toUpperCase();
        const avatarUrl =
          avatarMode === "random"
            ? avatars[Math.floor(Math.random() * avatars.length)] + openid
            : "";

        const user = await this.prisma.user.create({
          data: {
            openid,
            nickname,
            avatar: avatarUrl,
            status: enabled ? "ACTIVE" : "INACTIVE",
            userType: 4,
            profile: {
              create: {
                gender: selectedGender as any,
                region: region.name,
              },
            },
            wallet: {
              create: { balance: 0, freeze: 0, totalIn: 0, totalOut: 0 },
            },
            botAccount: {
              create: {
                regionId,
                status: enabled ? "active" : "disabled",
                dailyLimit: 10,
              },
            },
            addresses: {
              create: {
                regionId,
                name: "默认地址",
                phone: "",
                detail: region.name,
                isDefault: true,
              },
            },
          },
        });
        created++;
      } catch (e) {
        failed++;
      }
    }

    if (operatorId) {
      await this.logOperation(
        operatorId,
        "create_robots",
        "user",
        regionId,
        "region",
        { count: created, failed, regionId, nicknamePrefix },
        ip,
      );
    }

    return { success: true, created, failed };
  }

  async userDetail(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        studentVerify: true,
        wallet: true,
        botAccount: true,
        addresses: {
          select: { regionId: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        posts: {
          select: { regionId: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            posts: true,
            comments: true,
            likes: true,
            favorites: true,
            reports: true,
            reported: true,
            orders: true,
            follows: true,
            followers: true,
            secondHands: true,
            errandOrders: true,
          },
        },
      },
    });
    if (!u) throw new NotFoundException("用户不存在");

    const regions = await this.prisma.region.findMany({
      select: { id: true, name: true },
    });
    const regionNameMap = new Map(regions.map((r) => [r.id, r.name]));
    const formalRegionId = (u.profile as any)?.regionId || "";
    const botRegionId = (u as any).botAccount?.regionId || "";
    const addressRegionId = u.addresses?.[0]?.regionId || "";
    const inferredRegionId = botRegionId || addressRegionId || "";
    const postRegionId = u.posts?.[0]?.regionId || "";
    const regionId = formalRegionId;
    const formalRegionName = formalRegionId
      ? regionNameMap.get(formalRegionId) || u.profile?.region || ""
      : "";
    const currentRegionId = inferredRegionId || postRegionId || formalRegionId;
    const currentRegionSource = botRegionId
      ? "robot"
      : addressRegionId
        ? "address"
        : postRegionId
          ? "post"
          : u.profile?.region
            ? "profile_text"
            : formalRegionId
              ? "profile"
              : "none";
    const currentRegionName =
      regionNameMap.get(currentRegionId) ||
      (!currentRegionId ? u.profile?.region || "" : "");
    const now = new Date();

    const [
      tags,
      activeMembership,
      membershipOrders,
      benefitGrants,
      benefitUsages,
      latestPosts,
      latestComments,
      reportsAgainst,
      walletLogs,
      operationLogs,
      auditLogs,
      messageSummary,
      tradeSummary,
      subsidySummary,
      coupons,
    ] = await Promise.all([
      this.safeAdminRead(
        () =>
          this.prisma.userTag.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.userMembership.findFirst({
            where: { userId: id, status: "active", expiredAt: { gt: now } },
            orderBy: { expiredAt: "desc" },
          }),
        null as any,
      ),
      this.safeAdminRead(
        () =>
          this.prisma.membershipOrder.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              orderNo: true,
              planName: true,
              amount: true,
              status: true,
              payTime: true,
              createdAt: true,
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.membershipBenefitGrant.findMany({
            where: { userId: id, status: "active", expiredAt: { gt: now } },
            orderBy: [{ category: "asc" }, { createdAt: "desc" }],
            take: 12,
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.membershipBenefitUsage.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.post.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              content: true,
              status: true,
              auditStatus: true,
              viewCount: true,
              likeCount: true,
              commentCount: true,
              createdAt: true,
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.comment.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              postId: true,
              content: true,
              status: true,
              auditStatus: true,
              likeCount: true,
              createdAt: true,
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.report.findMany({
            where: { reportedId: id },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              targetType: true,
              targetId: true,
              reason: true,
              status: true,
              result: true,
              createdAt: true,
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.walletTransaction.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              type: true,
              amount: true,
              balance: true,
              channel: true,
              orderNo: true,
              description: true,
              status: true,
              createdAt: true,
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.adminOperationLog.findMany({
            where: { targetId: id },
            orderBy: { createdAt: "desc" },
            take: 8,
            include: {
              account: { select: { username: true, realName: true } },
            },
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        () =>
          this.prisma.auditLog.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        [] as any[],
      ),
      this.safeAdminRead(
        async () => {
          const [conversationCount, unreadCount, sentCount, latestMessages] =
            await Promise.all([
              this.prisma.conversationMember.count({ where: { userId: id } }),
              this.prisma.conversationMember.aggregate({
                where: { userId: id },
                _sum: { unreadCount: true },
              }),
              this.prisma.message.count({ where: { senderId: id } }),
              this.prisma.message.findMany({
                where: { senderId: id },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                  id: true,
                  conversationId: true,
                  type: true,
                  content: true,
                  isRecalled: true,
                  readCount: true,
                  createdAt: true,
                },
              }),
            ]);
          return {
            conversationCount,
            unreadCount: unreadCount._sum.unreadCount || 0,
            sentCount,
            latestMessages,
          };
        },
        {
          conversationCount: 0,
          unreadCount: 0,
          sentCount: 0,
          latestMessages: [] as any[],
        },
      ),
      this.safeAdminRead(
        async () => {
          const orderPaidStatuses = [
            "PAID",
            "SHIPPED",
            "DELIVERED",
            "RECEIVED",
            "COMPLETED",
          ];
          const paidStatuses = ["paid", "shipped", "received", "completed"];
          const [
            orderPay,
            mallPay,
            errandPay,
            activityPay,
            secondHandBuyPay,
            secondHandSellPay,
            orderRefunds,
            mallRefunds,
            errandRefunds,
            activityRefunds,
          ] = await Promise.all([
            this.prisma.order.aggregate({
              where: { userId: id, status: { in: orderPaidStatuses as any } },
              _sum: { payAmount: true },
              _count: { id: true },
            }),
            this.prisma.mallOrder.aggregate({
              where: { userId: id, status: { in: paidStatuses as any } },
              _sum: { payAmount: true },
              _count: { id: true },
            }),
            this.prisma.errandOrder.aggregate({
              where: { userId: id, status: { in: paidStatuses as any } },
              _sum: { payAmount: true },
              _count: { id: true },
            }),
            this.prisma.activityOrder.aggregate({
              where: { userId: id, payStatus: "paid" },
              _sum: { amount: true },
              _count: { id: true },
            }),
            this.prisma.secondHandOrder.aggregate({
              where: {
                OR: [{ buyerId: id }, { userId: id }],
                status: { in: ["paid", "shipped", "completed"] },
              },
              _sum: { price: true },
              _count: { id: true },
            }),
            this.prisma.secondHandOrder.aggregate({
              where: {
                sellerId: id,
                status: { in: ["paid", "shipped", "completed"] },
              },
              _sum: { price: true },
              _count: { id: true },
            }),
            this.prisma.order.count({
              where: { userId: id, refundStatus: { not: "none" } },
            }),
            this.prisma.mallOrder.count({
              where: { userId: id, refundStatus: { not: "none" } },
            }),
            this.prisma.errandOrder.count({
              where: { userId: id, refundStatus: { not: "none" } },
            }),
            this.prisma.activityOrder.count({
              where: { userId: id, refundStatus: { not: null } },
            }),
          ]);
          const totalPaidCents =
            this.moneyToCents(orderPay._sum.payAmount) +
            this.moneyToCents(mallPay._sum.payAmount) +
            this.moneyToCents(errandPay._sum.payAmount) +
            this.moneyToCents(activityPay._sum.amount) +
            this.moneyToCents(secondHandBuyPay._sum.price);
          return {
            totalPaidCents,
            refundCount:
              orderRefunds + mallRefunds + errandRefunds + activityRefunds,
            modules: [
              {
                key: "takeaway",
                label: "外卖/商家订单",
                count: orderPay._count.id,
                amount: this.moneyToCents(orderPay._sum.payAmount),
              },
              {
                key: "mall",
                label: "商城订单",
                count: mallPay._count.id,
                amount: this.moneyToCents(mallPay._sum.payAmount),
              },
              {
                key: "errand",
                label: "跑腿订单",
                count: errandPay._count.id,
                amount: this.moneyToCents(errandPay._sum.payAmount),
              },
              {
                key: "activity",
                label: "活动订单",
                count: activityPay._count.id,
                amount: this.moneyToCents(activityPay._sum.amount),
              },
              {
                key: "secondHandBuy",
                label: "二手买入",
                count: secondHandBuyPay._count.id,
                amount: this.moneyToCents(secondHandBuyPay._sum.price),
              },
              {
                key: "secondHandSell",
                label: "二手卖出",
                count: secondHandSellPay._count.id,
                amount: this.moneyToCents(secondHandSellPay._sum.price),
              },
            ],
          };
        },
        { totalPaidCents: 0, refundCount: 0, modules: [] as any[] },
      ),
      this.safeAdminRead(
        async () => {
          const summary = await (this.prisma as any).subsidyLedger.aggregate({
            where: { userId: id },
            _sum: { amount: true },
            _count: { id: true },
          });
          const latest = await (this.prisma as any).subsidyLedger.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 6,
          });
          return {
            count: summary._count.id,
            amount: this.moneyToCents(summary._sum.amount),
            latest,
          };
        },
        { count: 0, amount: 0, latest: [] as any[] },
      ),
      this.safeAdminRead(
        () =>
          this.prisma.couponReceive.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { coupon: true },
          }),
        [] as any[],
      ),
    ]);

    const pendingReportCount = reportsAgainst.filter((item: any) =>
      ["pending", "processing"].includes(
        String(item.status || "").toLowerCase(),
      ),
    ).length;
    const isMuted = !!u.muteEndAt && new Date(u.muteEndAt) > now;
    const riskLabels = [
      u.status === UserStatus.BANNED ? "已封禁" : "",
      u.status === UserStatus.INACTIVE ? "已禁用" : "",
      isMuted ? "禁言中" : "",
      pendingReportCount > 0 ? `${pendingReportCount} 条待处理举报` : "",
      tradeSummary.refundCount >= 2 ? "退款偏高" : "",
      !u.phone ? "未绑定手机号" : "",
    ].filter(Boolean);
    const valueLabels = [
      activeMembership ? activeMembership.planName || "有效会员" : "",
      u.studentVerify?.status === "APPROVED" ? "学生认证" : "",
      tradeSummary.totalPaidCents >= 10000 ? "高消费用户" : "",
      u._count.posts >= 5 ? "活跃创作者" : "",
      u._count.followers >= 20 ? "有粉丝基础" : "",
    ].filter(Boolean);

    return {
      id: u.id,
      uid: (u as any).publicUid || u.uid || null,
      openid: u.openid,
      unionid: u.unionid,
      nickname: u.nickname,
      avatar: u.avatar,
      phone: u.phone,
      phoneBound: !!u.phone,
      wxBound: !String(u.openid || "").startsWith("phone_login_"),
      loginIdentifierType: String(u.openid || "").startsWith("phone_login_")
        ? "phone"
        : "wechat",
      bindingSummary: [
        u.phone ? "已绑手机号" : "未绑手机号",
        String(u.openid || "").startsWith("phone_login_")
          ? "待绑定微信"
          : "已绑微信",
      ].join(" / "),
      userType: u.userType === 4 ? "robot" : "miniapp",
      typeLabel: u.userType === 4 ? "机器人" : "小程序用户",
      regionId,
      regionName: formalRegionName,
      regionSource: formalRegionId ? "profile" : "none",
      ownedRegionId: formalRegionId,
      ownedRegionName: formalRegionName,
      ownedRegionLocked: !!formalRegionId,
      currentRegionId,
      currentRegionName,
      currentRegionSource,
      gender: u.profile?.gender,
      school: u.studentVerify?.schoolName || u.profile?.school,
      realName: u.studentVerify?.realName,
      studentId: u.studentVerify?.studentId,
      studentCertStatus: u.studentVerify?.status?.toLowerCase() || "none",
      studentCardImage: u.studentVerify?.cardImage,
      balance: Math.round(Number(u.wallet?.balance || 0) * 100),
      freezeAmount: Math.round(Number(u.wallet?.freeze || 0) * 100),
      totalIn: Math.round(Number(u.wallet?.totalIn || 0) * 100),
      totalOut: Math.round(Number(u.wallet?.totalOut || 0) * 100),
      status:
        u.status === "ACTIVE"
          ? "active"
          : u.status === "BANNED"
            ? "banned"
            : "disabled",
      muteEndAt: u.muteEndAt,
      muteReason: u.muteReason,
      bio: u.profile?.bio,
      postCount: u._count.posts,
      commentCount: u._count.comments,
      likeCount: u._count.likes,
      favoriteCount: u._count.favorites,
      reportCount: u._count.reports,
      reportedCount: (u._count as any).reported || reportsAgainst.length,
      orderCount: u._count.orders,
      followCount: u._count.follows,
      fansCount: u._count.followers,
      secondHandCount: u._count.secondHands,
      errandOrderCount: u._count.errandOrders,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      lastLoginCountry: (u as any).lastLoginCountry,
      lastLoginProvince: (u as any).lastLoginProvince,
      lastLoginCity: (u as any).lastLoginCity,
      lastLoginDistrict: (u as any).lastLoginDistrict,
      lastLoginDevice: (u as any).lastLoginDevice,
      lastLoginUserAgent: (u as any).lastLoginUserAgent,
      botInfo: (u as any).botAccount
        ? {
            status: (u as any).botAccount.status,
            dailyLimit: (u as any).botAccount.dailyLimit,
            createdAt: (u as any).botAccount.createdAt,
          }
        : null,
      tags,
      riskLabels,
      valueLabels,
      activeMembership,
      membership: {
        active: activeMembership,
        orders: membershipOrders.map((item: any) => ({
          ...item,
          amount: this.moneyToCents(item.amount),
        })),
        grants: benefitGrants.map((item: any) => ({
          ...item,
          amount: this.moneyToCents(item.amount),
          remainingQuota: item.unlimited
            ? null
            : Math.max(
                0,
                Number(item.totalQuota || 0) - Number(item.usedQuota || 0),
              ),
        })),
        usages: benefitUsages.map((item: any) => ({
          ...item,
          amount: this.moneyToCents(item.amount),
        })),
      },
      contentOverview: {
        latestPosts: latestPosts.map((item: any) => ({
          ...item,
          summary: item.title || this.compactText(item.content),
        })),
        latestComments: latestComments.map((item: any) => ({
          ...item,
          summary: this.compactText(item.content),
        })),
        reportsAgainst,
      },
      tradeOverview: {
        ...tradeSummary,
        subsidy: subsidySummary,
      },
      coupons: coupons.map((item: any) => ({
        id: item.id,
        status: item.status,
        usedAt: item.usedAt,
        orderNo: item.orderNo,
        createdAt: item.createdAt,
        coupon: item.coupon
          ? {
              id: item.coupon.id,
              name: item.coupon.name,
              type: item.coupon.type,
              businessScope: item.coupon.businessScope || "all",
              value: this.moneyToCents(item.coupon.value),
              minAmount: this.moneyToCents(item.coupon.minAmount),
              endAt: item.coupon.endAt,
            }
          : null,
      })),
      walletLogs: walletLogs.map((item: any) => ({
        ...item,
        amount: this.moneyToCents(item.amount),
        balance: this.moneyToCents(item.balance),
      })),
      messageOverview: {
        ...messageSummary,
        latestMessages: (messageSummary.latestMessages || []).map(
          (item: any) => ({ ...item, summary: this.compactText(item.content) }),
        ),
      },
      operationLogs: operationLogs.map((item: any) => ({
        id: item.id,
        action: item.action,
        module: item.module,
        operator: item.account?.realName || item.account?.username || "-",
        detail: item.detail,
        ip: item.ip,
        createdAt: item.createdAt,
      })),
      auditLogs,
    };
  }

  async banUser(
    id: string,
    dto: { banned: boolean; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");
    await this.prisma.user.update({
      where: { id },
      data: { status: dto.banned ? "BANNED" : "ACTIVE" },
    });
    // 账号不可用后必须同时撤销 refresh 和两类实时连接。
    if (dto.banned) {
      await this.revokeUserAccess(id);
    }
    await this.logOperation(
      operatorId || "",
      dto.banned ? "ban" : "unban",
      "user",
      id,
      "user",
      { reason: dto.reason },
      ip,
    );
    await this.prisma.auditLog.create({
      data: {
        userId: id,
        action: dto.banned ? "BAN" : "UNBAN",
        module: "user",
        targetId: id,
        detail: { reason: dto.reason, operatorId },
      },
    });
    return { success: true };
  }

  async setUserStatus(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const status = this.normalizeUserStatus(dto.status);
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");

    // AUD-P1-181: DELETED 状态必须同时设置 deletedAt，脱敏可公开资料
    const updateData: any = { status };
    if (status === "DELETED") {
      updateData.deletedAt = new Date();
      updateData.nickname = "已注销用户";
      updateData.avatar = null;
      updateData.phone = null;
    }

    await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    // AUD-P1-181: DELETED 时脱敏用户档案资料
    if (status === "DELETED") {
      await this.prisma.userProfile
        .updateMany({
          where: { userId: id },
          data: {
            bio: null,
            wechat: null,
            qq: null,
            email: null,
            realName: null,
            idCard: null,
            school: null,
            major: null,
            grade: null,
            dormitory: null,
            birthday: null,
          },
        })
        .catch(() => undefined);
    }
    // 非 ACTIVE 用户不能保留 refresh 或实时会话。
    if (status !== "ACTIVE") {
      await this.revokeUserAccess(id);
    }
    await this.logOperation(
      operatorId || "",
      "status",
      "user",
      id,
      "user",
      { status, reason: dto.reason },
      ip,
    );
    await this.prisma.auditLog.create({
      data: {
        userId: id,
        action: AuditAction.UPDATE,
        module: "user",
        targetId: id,
        detail: { status, reason: dto.reason, operatorId },
      },
    });
    return { success: true, status };
  }

  async auditCert(
    userId: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const status = dto.status === "approved" ? "APPROVED" : "REJECTED";
    const existing = await this.prisma.studentVerify.findUnique({
      where: { userId },
    });
    if (!existing)
      throw new BadRequestException("该用户还没有提交学生认证资料");
    await this.prisma.studentVerify.update({
      where: { userId },
      data: {
        status,
        remark: dto.reason,
        verifiedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await this.logOperation(
      operatorId || "",
      "audit_cert",
      "user",
      userId,
      "student_verify",
      { status: dto.status, reason: dto.reason },
      ip,
    );
    return { success: true };
  }

  // ==================== 区域管理 ====================
  async regions(query: any, operatorId?: string) {
    const { keyword, status, page = 1, pageSize = 20, regionId } = query;
    const where: any = {
      code: { not: "default" },
      ...(await this.adminDataScope.regionModelWhere(operatorId, regionId)),
    };
    if (keyword)
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    if (status !== undefined && status !== "")
      where.isOpen = status === "1" || status === 1 || status === true;

    const [list, total] = await Promise.all([
      this.prisma.region.findMany({
        where,
        include: {
          managerAccount: {
            select: {
              id: true,
              username: true,
              realName: true,
              phone: true,
              email: true,
              status: true,
            },
          },
          managerUser: {
            select: {
              id: true,
              uid: true,
              nickname: true,
              avatar: true,
              phone: true,
              status: true,
            },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.region.count({ where }),
    ]);
    return {
      list: list.map((r) => this.toAdminRegion(r)),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async regionDetail(id: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, id);
    const r = await this.prisma.region.findUnique({
      where: { id },
      include: {
        banners: true,
        notices: true,
        navs: true,
        tabBar: true,
        managerAccount: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            email: true,
            status: true,
          },
        },
        managerUser: {
          select: {
            id: true,
            uid: true,
            nickname: true,
            avatar: true,
            phone: true,
            status: true,
          },
        },
      },
    });
    if (!r) throw new NotFoundException("区域不存在");
    return this.toAdminRegion(r);
  }

  async createRegion(dto: any, operatorId?: string) {
    if (
      operatorId &&
      !(await this.adminDataScope.canAccessAllRegions(operatorId))
    ) {
      throw new ForbiddenException("区域管理员不能创建新区域");
    }
    const name = String(dto.name || "").trim();
    if (!name) throw new BadRequestException("区域名称不能为空");

    const code = this.normalizeRegionCode(
      dto.code || this.generateRegionCode(name),
    );
    const exists = await this.prisma.region.findUnique({ where: { code } });
    if (exists) {
      throw new ConflictException(`区域编码「${code}」已存在，请换一个编码`);
    }
    const managerData = await this.buildRegionManagerData(dto);
    try {
      const region = await this.prisma.region.create({
        data: {
          name,
          code,
          description: this.nullableString(dto.description),
          cover: this.nullableString(dto.coverImage),
          address: this.buildRegionAddress(dto),
          latitude: this.toFloatOrNull(dto.latitude),
          longitude: this.toFloatOrNull(dto.longitude),
          radius: this.toPositiveInt(dto.serviceRadius, 5000),
          studentOnly: Boolean(dto.studentOnly),
          isOpen:
            dto.isOpen !== undefined
              ? Boolean(dto.isOpen)
              : dto.status !== undefined
                ? Boolean(dto.status)
                : true,
          sortOrder: this.toInt(dto.sort, 0),
          settings: dto.settings ?? undefined,
          ...managerData,
          // 新增字段
          logo: this.nullableString(dto.logo),
          distanceLimit: this.toPositiveInt(dto.distanceLimit, 0),
          regionType: this.nullableString(dto.regionType) || "other",
          isHot: Boolean(dto.isHot),
          regionCoverMode: this.nullableString(dto.regionCoverMode) || "cover",
          balance: this.toDecimalOrNull(dto.balance),
          minWithdraw: this.toDecimalOrNull(dto.minWithdraw),
          maxWithdraw: this.toDecimalOrNull(dto.maxWithdraw),
          withdrawFee: this.toDecimalOrNull(dto.withdrawFee),
          withdrawRate: this.toDecimalOrNull(dto.withdrawRate),
          commissionRate: this.toDecimalOrNull(dto.commissionRate),
          selfUnbanFee: this.toDecimalOrNull(dto.selfUnbanFee),
          showHotList: Boolean(dto.showHotList),
          hotFeaturedDisplay:
            this.nullableString(dto.hotFeaturedDisplay) || "none",
          regionSwitchSupported:
            dto.regionSwitchSupported !== undefined ||
            dto.region_switch_supported !== undefined
              ? this.toBooleanInput(
                  dto.regionSwitchSupported ?? dto.region_switch_supported,
                  true,
                )
              : true,
          privateMessageEnabled:
            dto.privateMessageEnabled !== undefined
              ? Boolean(dto.privateMessageEnabled)
              : true,
          contactsRequireStudentAuth: Boolean(dto.contactsRequireStudentAuth),
          onlyStudentAuthUsers: Boolean(dto.onlyStudentAuthUsers),
          groupChatEnabled: Boolean(dto.groupChatEnabled),
          enableQrcodeFilter: Boolean(dto.enableQrcodeFilter),
          showCarousel:
            dto.showCarousel !== undefined ? Boolean(dto.showCarousel) : true,
          showAnnouncement:
            dto.showAnnouncement !== undefined
              ? Boolean(dto.showAnnouncement)
              : true,
          showKingkong:
            dto.showKingkong !== undefined ? Boolean(dto.showKingkong) : true,
          homeFeatureStyle:
            this.nullableString(dto.homeFeatureStyle) || "default",
          homeNavLayout: this.toPositiveInt(dto.homeNavLayout, 1),
          messagePageLayout:
            this.nullableString(dto.messagePageLayout) || "default",
          profilePageLayout:
            this.nullableString(dto.profilePageLayout) || "default",
          carouselImages: dto.carouselImages ?? undefined,
          regionTabs:
            dto.regionTabs !== undefined
              ? this.normalizeRegionTabs(dto.regionTabs)
              : undefined,
          homeLeaderboard: dto.homeLeaderboard ?? undefined,
          messageIcons: dto.messageIcons ?? undefined,
          messageNavigation: dto.messageNavigation ?? undefined,
          profileLayoutItems: dto.profileLayoutItems ?? undefined,
          homeNavLayoutConfig: dto.homeNavLayoutConfig ?? undefined,
        },
      });
      await this.syncRegionManagerRole(
        region.id,
        (region as any).managerAccountId,
      );
      await this.syncRegionManagerUserRole(
        region.id,
        (region as any).managerUserId,
      );
      await this.generateRegionDefaults(region.id);
      return this.toAdminRegion(region);
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException("区域编码已存在，请换一个编码后再保存");
      }
      throw error;
    }
  }

  private async generateRegionDefaults(regionId: string) {
    try {
      const defaultBottomTabs = [
        {
          id: "home",
          name: "首页",
          pagePath: "pages/tabbar/index/index",
          action: "",
          iconPath: "/static/tabbar/home.png",
          selectedIconPath: "/static/tabbar/home-active.png",
          color: "#8A8A8A",
          selectedColor: "#1677ff",
          width: 24,
          height: 24,
          fontSize: 12,
          avatarMode: false,
          hideText: false,
          enabled: true,
          sortOrder: 0,
          navType: "bottom",
        },
        {
          id: "circle",
          name: "圈子",
          pagePath: "pages/tabbar/containers/containers",
          action: "",
          iconPath: "/static/tabbar/circle.png",
          selectedIconPath: "/static/tabbar/circle-active.png",
          color: "#8A8A8A",
          selectedColor: "#1677ff",
          width: 24,
          height: 24,
          fontSize: 12,
          avatarMode: false,
          hideText: false,
          enabled: true,
          sortOrder: 1,
          navType: "bottom",
        },
        {
          id: "publish",
          name: "发布",
          pagePath: "",
          action: "publish",
          iconPath: "/static/tabbar/publish.png",
          selectedIconPath: "/static/tabbar/publish-active.png",
          color: "#8A8A8A",
          selectedColor: "#1677ff",
          width: 24,
          height: 24,
          fontSize: 12,
          avatarMode: false,
          hideText: false,
          enabled: true,
          sortOrder: 2,
          navType: "bottom",
        },
        {
          id: "message",
          name: "消息",
          pagePath: "pages/tabbar/news/news",
          action: "",
          iconPath: "/static/tabbar/message.png",
          selectedIconPath: "/static/tabbar/message-active.png",
          color: "#8A8A8A",
          selectedColor: "#1677ff",
          width: 24,
          height: 24,
          fontSize: 12,
          avatarMode: false,
          hideText: false,
          enabled: true,
          sortOrder: 3,
          navType: "bottom",
        },
        {
          id: "mine",
          name: "我的",
          pagePath: "pages/tabbar/auth/PersonalHomepage",
          action: "",
          iconPath: "/static/tabbar/mine.png",
          selectedIconPath: "/static/tabbar/mine-active.png",
          color: "#8A8A8A",
          selectedColor: "#1677ff",
          width: 24,
          height: 24,
          fontSize: 12,
          avatarMode: false,
          hideText: false,
          enabled: true,
          sortOrder: 4,
          navType: "bottom",
        },
      ];
      const defaultHomeTabs = this.normalizeRegionTabs([
        {
          name: "笔记",
          type: "note",
          enabled: true,
          icon: "/static/logo.jpg",
          image: "/static/logo.jpg",
          linkType: "filter",
          path: "pagesB/post/post",
          appId: "",
          query: "",
          remark: "",
        },
        {
          name: "外卖",
          type: "takeout",
          enabled: true,
          icon: "/static/yw.png",
          image: "/static/yw.png",
          linkType: "filter",
          path: "pagesA/merchant/merchant",
          appId: "",
          query: "",
          remark: "",
        },
        {
          name: "二手",
          type: "secondhand",
          enabled: true,
          icon: "/static/yhq.png",
          image: "/static/yhq.png",
          linkType: "filter",
          path: "",
          appId: "",
          query: "",
          remark: "",
        },
        {
          name: "活动",
          type: "activity",
          enabled: true,
          icon: "/static/tj.png",
          image: "/static/tj.png",
          linkType: "filter",
          path: "pagesA/selection/list/list?tabIndex=0",
          appId: "",
          query: "",
          remark: "",
        },
      ]);
      const defaultHomeNav = [
        {
          name: "笔记",
          subtitle: "",
          icon: "/static/logo.jpg",
          page: "pagesB/post/post",
          path: "pagesB/post/post",
          linkType: "internal",
          appId: "",
          query: "",
          remark: "",
          enabled: true,
          sortOrder: 0,
        },
        {
          name: "外卖",
          subtitle: "",
          icon: "/static/yw.png",
          page: "pagesA/merchant/merchant",
          path: "pagesA/merchant/merchant",
          linkType: "internal",
          appId: "",
          query: "",
          remark: "",
          enabled: true,
          sortOrder: 1,
        },
        {
          name: "二手",
          subtitle: "",
          icon: "/static/yhq.png",
          page: "pages/tabbar/index/index?tab=secondhand",
          path: "pages/tabbar/index/index?tab=secondhand",
          linkType: "internal",
          appId: "",
          query: "",
          remark: "",
          enabled: true,
          sortOrder: 2,
        },
        {
          name: "活动",
          subtitle: "",
          icon: "/static/tj.png",
          page: "pagesA/selection/list/list?tabIndex=0",
          path: "pagesA/selection/list/list?tabIndex=0",
          linkType: "internal",
          appId: "",
          query: "",
          remark: "",
          enabled: true,
          sortOrder: 3,
        },
      ];
      const defaultProfileItems = [
        {
          id: "orders",
          title: "我的订单",
          description: "查看订单、配送和售后",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pagesA/order/order",
          query: "",
          type: "internal_jump",
          navigation_permission: "unlimited",
          enabled: true,
          sortOrder: 0,
          requireLogin: true,
        },
        {
          id: "wallet",
          title: "我的钱包",
          description: "余额、提现和交易流水",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pagesA/withdraw/withdraw",
          query: "",
          type: "internal_jump",
          navigation_permission: "unlimited",
          enabled: true,
          sortOrder: 1,
          requireLogin: true,
        },
        {
          id: "share",
          title: "分享有礼",
          description: "邀请同学加入本地生活圈",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pagesA/news/SharingCourtesy/SharingCourtesy",
          query: "",
          type: "internal_jump",
          navigation_permission: "unlimited",
          enabled: true,
          sortOrder: 2,
          requireLogin: true,
        },
        {
          id: "merchant",
          title: "商家中心",
          description: "商家入驻与店铺管理",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pagesA/MerchantManagement/managerial",
          query: "",
          type: "internal_jump",
          navigation_permission: "merchant",
          enabled: true,
          sortOrder: 3,
          requireLogin: true,
        },
        {
          id: "dorm_shop_owner",
          title: "宿舍小店",
          description: "商品、订单和营业设置",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pagesA/DormShopOwner/DormShopOwner",
          query: "",
          type: "internal_jump",
          navigation_permission: "dorm_shop_owner",
          enabled: true,
          sortOrder: 4,
          requireLogin: true,
        },
        {
          id: "settings",
          title: "账号设置",
          description: "资料、隐私和系统设置",
          icon: "",
          main_image: "/static/logo.jpg",
          path: "/pages/auth/settings/settings",
          query: "",
          type: "internal_jump",
          navigation_permission: "unlimited",
          enabled: true,
          sortOrder: 5,
          requireLogin: false,
        },
      ];
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
        select: {
          regionTabs: true,
          homeNavLayoutConfig: true,
          profileLayoutItems: true,
        },
      });
      const regionUpdate: any = {};
      if (!Array.isArray(region?.regionTabs) || !region.regionTabs.length) {
        regionUpdate.regionTabs = defaultHomeTabs;
      }
      if (
        !Array.isArray(region?.homeNavLayoutConfig) ||
        !region.homeNavLayoutConfig.length
      ) {
        regionUpdate.homeNavLayoutConfig = defaultHomeNav;
      }
      if (
        !Array.isArray(region?.profileLayoutItems) ||
        !region.profileLayoutItems.length
      ) {
        regionUpdate.profileLayoutItems = defaultProfileItems;
      }

      const operations: any[] = [
        this.prisma.regionTabBar.upsert({
          where: { regionId },
          update: {},
          create: {
            regionId,
            config: {
              color: "#8A8A8A",
              selectedColor: "#1677ff",
              backgroundColor: "#ffffff",
              borderStyle: "black",
              list: defaultBottomTabs,
              tabs: defaultBottomTabs,
            },
          },
        }),
        this.prisma.shareSettings.upsert({
          where: { regionId },
          update: {},
          create: {
            regionId,
            activityTitle: "校园生活，尽在这里",
            activityImage: "",
            isEnabled: true,
            inviterReward: 0,
            inviteeReward: 0,
            dailyInviteLimit: 100,
          },
        }),
      ];
      if (Object.keys(regionUpdate).length) {
        operations.push(
          this.prisma.region.update({
            where: { id: regionId },
            data: regionUpdate,
          }),
        );
      }
      await this.prisma.$transaction(operations);
    } catch (err) {
      console.error(`为区域 ${regionId} 生成默认配置失败:`, err);
    }
  }

  async updateRegion(id: string, dto: any, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, id);
    const exists = await this.prisma.region.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("区域不存在");

    const data: any = {};
    if (dto.name !== undefined) {
      const name = String(dto.name || "").trim();
      if (!name) throw new BadRequestException("区域名称不能为空");
      data.name = name;
    }
    if (dto.code !== undefined && String(dto.code || "").trim()) {
      const code = this.normalizeRegionCode(dto.code);
      const sameCode = await this.prisma.region.findUnique({ where: { code } });
      if (sameCode && sameCode.id !== id) {
        throw new ConflictException(`区域编码「${code}」已存在，请换一个编码`);
      }
      data.code = code;
    }
    if (dto.description !== undefined)
      data.description = this.nullableString(dto.description);
    if (dto.coverImage !== undefined)
      data.cover = this.nullableString(dto.coverImage);
    if (
      dto.province !== undefined ||
      dto.city !== undefined ||
      dto.district !== undefined ||
      dto.address !== undefined
    ) {
      data.address = this.buildRegionAddress(dto);
    }
    if (dto.serviceRadius !== undefined)
      data.radius = this.toPositiveInt(dto.serviceRadius, 5000);
    if (dto.isOpen !== undefined) data.isOpen = Boolean(dto.isOpen);
    if (dto.studentOnly !== undefined)
      data.studentOnly = Boolean(dto.studentOnly);
    if (dto.sort !== undefined) data.sortOrder = this.toInt(dto.sort, 0);
    if (dto.settings !== undefined) data.settings = dto.settings;
    const managerTouch = await this.applyRegionManagerUpdates(data, dto);
    if (dto.latitude !== undefined)
      data.latitude = this.toFloatOrNull(dto.latitude);
    if (dto.longitude !== undefined)
      data.longitude = this.toFloatOrNull(dto.longitude);
    // 新增字段
    if (dto.logo !== undefined) data.logo = this.nullableString(dto.logo);
    if (dto.distanceLimit !== undefined)
      data.distanceLimit = this.toPositiveInt(dto.distanceLimit, 0);
    if (dto.regionType !== undefined)
      data.regionType = this.nullableString(dto.regionType) || "other";
    if (dto.isHot !== undefined) data.isHot = Boolean(dto.isHot);
    if (dto.regionCoverMode !== undefined)
      data.regionCoverMode =
        this.nullableString(dto.regionCoverMode) || "cover";
    if (dto.balance !== undefined)
      data.balance = this.toDecimalOrNull(dto.balance);
    if (dto.minWithdraw !== undefined)
      data.minWithdraw = this.toDecimalOrNull(dto.minWithdraw);
    if (dto.maxWithdraw !== undefined)
      data.maxWithdraw = this.toDecimalOrNull(dto.maxWithdraw);
    if (dto.withdrawFee !== undefined)
      data.withdrawFee = this.toDecimalOrNull(dto.withdrawFee);
    if (dto.withdrawRate !== undefined)
      data.withdrawRate = this.toDecimalOrNull(dto.withdrawRate);
    if (dto.commissionRate !== undefined)
      data.commissionRate = this.toDecimalOrNull(dto.commissionRate);
    if (dto.selfUnbanFee !== undefined)
      data.selfUnbanFee = this.toDecimalOrNull(dto.selfUnbanFee);
    if (dto.showHotList !== undefined || dto.show_hot_list !== undefined)
      data.showHotList = Boolean(dto.showHotList ?? dto.show_hot_list);
    if (
      dto.hotFeaturedDisplay !== undefined ||
      dto.hot_featured_display !== undefined
    )
      data.hotFeaturedDisplay =
        this.nullableString(
          dto.hotFeaturedDisplay ?? dto.hot_featured_display,
        ) || "none";
    if (
      dto.regionSwitchSupported !== undefined ||
      dto.region_switch_supported !== undefined
    )
      data.regionSwitchSupported = this.toBooleanInput(
        dto.regionSwitchSupported ?? dto.region_switch_supported,
        true,
      );
    if (
      dto.privateMessageEnabled !== undefined ||
      dto.private_message_enabled !== undefined
    )
      data.privateMessageEnabled = Boolean(
        dto.privateMessageEnabled ?? dto.private_message_enabled,
      );
    if (dto.contactsRequireStudentAuth !== undefined)
      data.contactsRequireStudentAuth = Boolean(dto.contactsRequireStudentAuth);
    if (dto.onlyStudentAuthUsers !== undefined)
      data.onlyStudentAuthUsers = Boolean(dto.onlyStudentAuthUsers);
    if (dto.groupChatEnabled !== undefined)
      data.groupChatEnabled = Boolean(dto.groupChatEnabled);
    if (dto.enableQrcodeFilter !== undefined)
      data.enableQrcodeFilter = Boolean(dto.enableQrcodeFilter);
    // 页面装修配置
    if (dto.showCarousel !== undefined || dto.show_carousel !== undefined)
      data.showCarousel = Boolean(dto.showCarousel ?? dto.show_carousel);
    if (
      dto.showAnnouncement !== undefined ||
      dto.show_announcement !== undefined
    )
      data.showAnnouncement = Boolean(
        dto.showAnnouncement ?? dto.show_announcement,
      );
    if (dto.showKingkong !== undefined || dto.show_kingkong !== undefined)
      data.showKingkong = Boolean(dto.showKingkong ?? dto.show_kingkong);
    if (
      dto.home_feature_style !== undefined ||
      dto.homeFeatureStyle !== undefined
    )
      data.homeFeatureStyle =
        this.nullableString(dto.homeFeatureStyle ?? dto.home_feature_style) ||
        "default";
    if (dto.homeNavLayout !== undefined || dto.home_nav_layout !== undefined)
      data.homeNavLayout = this.toPositiveInt(
        dto.homeNavLayout ?? dto.home_nav_layout,
        1,
      );
    if (
      dto.messagePageLayout !== undefined ||
      dto.message_page_layout !== undefined
    )
      data.messagePageLayout =
        this.nullableString(dto.messagePageLayout ?? dto.message_page_layout) ||
        "default";
    if (
      dto.profilePageLayout !== undefined ||
      dto.profile_page_layout !== undefined
    )
      data.profilePageLayout =
        this.nullableString(dto.profilePageLayout ?? dto.profile_page_layout) ||
        "default";
    if (dto.carouselImages !== undefined || dto.carousel_images !== undefined)
      data.carouselImages = dto.carouselImages ?? dto.carousel_images ?? null;
    if (dto.regionTabs !== undefined || dto.region_tabs !== undefined)
      data.regionTabs = this.normalizeRegionTabs(
        dto.regionTabs ?? dto.region_tabs,
      );
    if (dto.homeLeaderboard !== undefined || dto.home_leaderboard !== undefined)
      data.homeLeaderboard =
        dto.homeLeaderboard ?? dto.home_leaderboard ?? null;
    if (dto.messageIcons !== undefined || dto.message_icons !== undefined)
      data.messageIcons = dto.messageIcons ?? dto.message_icons ?? null;
    if (
      dto.messageNavigation !== undefined ||
      dto.message_navigation !== undefined
    )
      data.messageNavigation =
        dto.messageNavigation ?? dto.message_navigation ?? null;
    if (
      dto.profileLayoutItems !== undefined ||
      dto.profile_layout_items !== undefined
    )
      data.profileLayoutItems =
        dto.profileLayoutItems ?? dto.profile_layout_items ?? null;
    if (
      dto.homeNavLayoutConfig !== undefined ||
      dto.home_nav_layout_config !== undefined
    )
      data.homeNavLayoutConfig =
        dto.homeNavLayoutConfig ?? dto.home_nav_layout_config ?? null;

    const region = await this.prisma.region.update({ where: { id }, data });
    if (managerTouch.accountTouched) {
      await this.syncRegionManagerRole(
        id,
        data.managerAccountId,
        (exists as any).managerAccountId,
      );
    }
    if (managerTouch.userTouched) {
      await this.syncRegionManagerUserRole(
        id,
        data.managerUserId,
        (exists as any).managerUserId,
      );
    }
    return this.toAdminRegion(region);
  }

  private toAdminRegion(r: any) {
    const { province, city, district } = this.parseRegionAddress(r.address);
    const managerUser = r.managerUser || null;
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description || "",
      coverImage: r.cover || "",
      background_url: r.cover || "",
      province,
      city,
      district,
      address: r.address || "",
      latitude: r.latitude,
      longitude: r.longitude,
      serviceRadius: r.radius,
      studentOnly: r.studentOnly,
      isOpen: r.isOpen,
      status: r.isOpen ? 1 : 0,
      sort: r.sortOrder,
      settings: r.settings || {},
      managerName: r.managerName || r.settings?.operator?.managerName || "",
      managerPhone: r.managerPhone || r.settings?.operator?.contactPhone || "",
      managerWechat: r.managerWechat || "",
      managerAccountId: r.managerAccountId || "",
      managerAccount: r.managerAccount
        ? {
            id: r.managerAccount.id,
            username: r.managerAccount.username,
            realName: r.managerAccount.realName,
            phone: r.managerAccount.phone,
            email: r.managerAccount.email,
            status: r.managerAccount.status,
          }
        : null,
      managerUserId: r.managerUserId || "",
      manager_user_id: r.managerUserId || "",
      managerId: r.managerUserId || "",
      manager_id: r.managerUserId || "",
      managerUser: managerUser
        ? {
            id: managerUser.id,
            uid: managerUser.uid,
            nickname: managerUser.nickname,
            avatar: managerUser.avatar,
            phone: managerUser.phone,
            status: managerUser.status,
          }
        : null,
      managerNickname: managerUser?.nickname || "",
      managerAvatar: managerUser?.avatar || "",
      adminName:
        r.managerName ||
        managerUser?.nickname ||
        r.managerAccount?.realName ||
        r.managerAccount?.username ||
        r.settings?.operator?.managerName ||
        "",
      adminPhone:
        r.managerPhone ||
        managerUser?.phone ||
        r.managerAccount?.phone ||
        r.settings?.operator?.contactPhone ||
        "",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // 新增字段
      logo: r.logo || r.cover || "",
      distanceLimit: r.distanceLimit ?? 0,
      regionType: r.regionType || "other",
      isHot: r.isHot ?? false,
      regionCoverMode: r.regionCoverMode || "cover",
      balance: r.balance ? Number(r.balance) : 0,
      minWithdraw: r.minWithdraw ? Number(r.minWithdraw) : 0,
      maxWithdraw: r.maxWithdraw ? Number(r.maxWithdraw) : 0,
      withdrawFee: r.withdrawFee ? Number(r.withdrawFee) : 0,
      withdrawRate: r.withdrawRate ? Number(r.withdrawRate) : 0,
      commissionRate: r.commissionRate ? Number(r.commissionRate) : 0,
      selfUnbanFee: r.selfUnbanFee ? Number(r.selfUnbanFee) : 0,
      showHotList: r.showHotList ?? false,
      show_hot_list: r.showHotList ?? false,
      showCarousel: r.showCarousel ?? true,
      show_carousel: r.showCarousel ?? true,
      showAnnouncement: r.showAnnouncement ?? true,
      show_announcement: r.showAnnouncement ?? true,
      showKingkong: r.showKingkong ?? true,
      show_kingkong: r.showKingkong ?? true,
      hotFeaturedDisplay: r.hotFeaturedDisplay || "none",
      hot_featured_display: r.hotFeaturedDisplay || "none",
      regionSwitchSupported: r.regionSwitchSupported ?? true,
      region_switch_supported: r.regionSwitchSupported ?? true,
      region_switch_notice_required: true,
      region_switch_ad_unit_id: "",
      privateMessageEnabled: r.privateMessageEnabled ?? true,
      private_message_enabled: r.privateMessageEnabled ?? true,
      contactsRequireStudentAuth: r.contactsRequireStudentAuth ?? false,
      onlyStudentAuthUsers: r.onlyStudentAuthUsers ?? false,
      groupChatEnabled: r.groupChatEnabled ?? false,
      enableQrcodeFilter: r.enableQrcodeFilter ?? false,
      homeNavLayout: r.homeNavLayout ?? 1,
      home_nav_layout: r.homeNavLayout ?? 1,
      messagePageLayout: r.messagePageLayout || "default",
      message_page_layout: r.messagePageLayout || "default",
      profilePageLayout: r.profilePageLayout || "default",
      profile_page_layout: r.profilePageLayout || "default",
      carouselImages: r.carouselImages ?? [],
      carousel_images: r.carouselImages ?? [],
      regionTabs: this.normalizeRegionTabs(r.regionTabs),
      region_tabs: this.normalizeRegionTabs(r.regionTabs),
      homeLeaderboard: r.homeLeaderboard ?? { enabled: false, items: [] },
      home_leaderboard: r.homeLeaderboard ?? { enabled: false, items: [] },
      messageIcons: r.messageIcons ?? {},
      message_icons: r.messageIcons ?? {},
      messageNavigation: r.messageNavigation ?? { cards: [] },
      message_navigation: r.messageNavigation ?? { cards: [] },
      profileLayoutItems: r.profileLayoutItems ?? [],
      profile_layout_items: r.profileLayoutItems ?? [],
      homeNavLayoutConfig: r.homeNavLayoutConfig ?? {
        title: {
          show: false,
          text: "",
          color: "#333333",
          fontSize: 16,
          fontWeight: "bold",
        },
        showLayoutSwitch: false,
      },
      home_nav_layout_config: r.homeNavLayoutConfig ?? {
        title: {
          show: false,
          text: "",
          color: "#333333",
          fontSize: 16,
          fontWeight: "bold",
        },
        showLayoutSwitch: false,
      },
    };
  }

  private normalizeRegionCode(value: any) {
    const code = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    if (!code)
      return `region_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (code.length > 48) return code.slice(0, 48);
    return code;
  }

  private generateRegionCode(name: string) {
    const ascii = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    return (
      ascii || `region_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
  }

  private nullableString(value: any) {
    const text = String(value ?? "").trim();
    return text || null;
  }

  private toBooleanInput(value: any, defaultValue = false) {
    if (value === undefined || value === null || value === "")
      return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(text)) return false;
    if (["true", "1", "yes", "on"].includes(text)) return true;
    return Boolean(value);
  }

  private settingsOperator(dto: any) {
    const operator = dto?.settings?.operator;
    return operator && typeof operator === "object" ? operator : {};
  }

  private firstDefined(...values: any[]) {
    return values.find((value) => value !== undefined);
  }

  private hasDefined(...values: any[]) {
    return values.some((value) => value !== undefined);
  }

  private managerNameInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.firstDefined(
      dto.managerName,
      dto.manager_name,
      operator.managerName,
      operator.name,
    );
  }

  private managerPhoneInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.firstDefined(
      dto.managerPhone,
      dto.manager_phone,
      dto.contactPhone,
      dto.contact_phone,
      operator.managerPhone,
      operator.contactPhone,
      operator.phone,
    );
  }

  private managerWechatInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.firstDefined(
      dto.managerWechat,
      dto.manager_wechat,
      operator.managerWechat,
      operator.wechat,
    );
  }

  private managerAccountInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.firstDefined(
      dto.managerAccountId,
      dto.manager_account_id,
      operator.managerAccountId,
      operator.accountId,
    );
  }

  private managerUserInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.firstDefined(
      dto.managerUserId,
      dto.manager_user_id,
      dto.managerId,
      dto.manager_id,
      operator.managerUserId,
      operator.manager_user_id,
      operator.managerId,
      operator.manager_id,
    );
  }

  private hasManagerAccountInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.hasDefined(
      dto.managerAccountId,
      dto.manager_account_id,
      operator.managerAccountId,
      operator.accountId,
    );
  }

  private hasManagerUserInput(dto: any) {
    const operator = this.settingsOperator(dto);
    return this.hasDefined(
      dto.managerUserId,
      dto.manager_user_id,
      dto.managerId,
      dto.manager_id,
      operator.managerUserId,
      operator.manager_user_id,
      operator.managerId,
      operator.manager_id,
    );
  }

  private async buildRegionManagerData(dto: any) {
    return {
      managerName: this.nullableString(this.managerNameInput(dto)),
      managerPhone: this.nullableString(this.managerPhoneInput(dto)),
      managerWechat: this.nullableString(this.managerWechatInput(dto)),
      managerAccountId: await this.normalizeRegionManagerAccountId(
        this.managerAccountInput(dto),
      ),
      managerUserId: await this.normalizeRegionManagerUserId(
        this.managerUserInput(dto),
      ),
    };
  }

  private async applyRegionManagerUpdates(data: Record<string, any>, dto: any) {
    const operator = this.settingsOperator(dto);
    let accountTouched = false;
    let userTouched = false;
    if (
      this.hasDefined(
        dto.managerName,
        dto.manager_name,
        operator.managerName,
        operator.name,
      )
    ) {
      data.managerName = this.nullableString(this.managerNameInput(dto));
    }
    if (
      this.hasDefined(
        dto.managerPhone,
        dto.manager_phone,
        dto.contactPhone,
        dto.contact_phone,
        operator.managerPhone,
        operator.contactPhone,
        operator.phone,
      )
    ) {
      data.managerPhone = this.nullableString(this.managerPhoneInput(dto));
    }
    if (
      this.hasDefined(
        dto.managerWechat,
        dto.manager_wechat,
        operator.managerWechat,
        operator.wechat,
      )
    ) {
      data.managerWechat = this.nullableString(this.managerWechatInput(dto));
    }
    if (this.hasManagerAccountInput(dto)) {
      data.managerAccountId = await this.normalizeRegionManagerAccountId(
        this.managerAccountInput(dto),
      );
      accountTouched = true;
    }
    if (this.hasManagerUserInput(dto)) {
      data.managerUserId = await this.normalizeRegionManagerUserId(
        this.managerUserInput(dto),
      );
      userTouched = true;
    }
    return { accountTouched, userTouched };
  }

  private async normalizeRegionManagerAccountId(value: any) {
    const accountId = this.nullableString(value);
    if (!accountId) return null;
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new BadRequestException("负责人后台账号不存在");
    return accountId;
  }

  private async normalizeRegionManagerUserId(value: any) {
    const userId = this.nullableString(value);
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new BadRequestException("区域负责人小程序用户不存在");
    if (user.status !== UserStatus.ACTIVE)
      throw new BadRequestException("区域负责人小程序用户不是正常状态");
    return userId;
  }

  private merchantOwnerInput(dto: any) {
    return this.firstDefined(
      dto.userId,
      dto.user_id,
      dto.ownerUserId,
      dto.owner_user_id,
      dto.merchantUserId,
      dto.merchant_user_id,
      dto.shopOwnerUserId,
      dto.shop_owner_user_id,
    );
  }

  private hasMerchantOwnerInput(dto: any) {
    return this.hasDefined(
      dto.userId,
      dto.user_id,
      dto.ownerUserId,
      dto.owner_user_id,
      dto.merchantUserId,
      dto.merchant_user_id,
      dto.shopOwnerUserId,
      dto.shop_owner_user_id,
    );
  }

  private async normalizeMerchantOwnerUserId(value: any, fallbackPhone?: any) {
    const directUser = this.nullableString(value);
    const phone = this.nullableString(fallbackPhone);
    let user: { id: string; status: UserStatus } | null = null;

    if (directUser) {
      user = /^\d+$/.test(directUser)
        ? await this.prisma.user.findUnique({
            where: { uid: Number(directUser) },
            select: { id: true, status: true },
          })
        : await this.prisma.user.findUnique({
            where: { id: directUser },
            select: { id: true, status: true },
          });
      if (!user) throw new BadRequestException("选择的小程序用户不存在");
    } else if (phone) {
      user = await this.prisma.user.findFirst({
        where: { phone, status: { not: UserStatus.DELETED } },
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!user) throw new BadRequestException("请选择对应的小程序用户");
    if (user.status !== UserStatus.ACTIVE)
      throw new BadRequestException("选择的小程序用户不是正常状态");
    return user.id;
  }

  private formatMiniUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      uid: user.uid,
      nickname: user.nickname || "",
      avatar: user.avatar || "",
      phone: user.phone || "",
      status: user.status,
    };
  }

  private async ensureMiniRegionManagerRole() {
    let role = await this.prisma.role.findFirst({
      where: {
        OR: [{ name: "区域负责人" }, { type: RoleType.REGION_ADMIN }],
      },
    });
    if (!role) {
      role = await this.prisma.role.create({
        data: {
          name: "区域负责人",
          type: RoleType.REGION_ADMIN,
          description: "小程序区域负责人，可识别区域运营权限",
        },
      });
    }
    return role;
  }

  private async syncRegionManagerUserRole(
    regionId: string,
    nextUserId?: string | null,
    previousUserId?: string | null,
  ) {
    if (!nextUserId && !previousUserId) return;
    const role = await this.ensureMiniRegionManagerRole();
    if (previousUserId && previousUserId !== nextUserId) {
      await this.prisma.userRole.deleteMany({
        where: { userId: previousUserId, roleId: role.id, regionId },
      });
    }
    if (!nextUserId) return;
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: nextUserId, roleId: role.id, regionId },
    });
    if (!existing) {
      await this.prisma.userRole.create({
        data: { userId: nextUserId, roleId: role.id, regionId },
      });
    }
  }

  private async ensureRegionManagerRole() {
    let role = await this.prisma.adminRole.findFirst({
      where: {
        OR: [
          { code: "region_manager" },
          { code: "region_admin" },
          { code: "REGION_ADMIN" },
          { name: "区域负责人" },
          { name: "区域管理员" },
        ],
      },
    });
    if (!role) {
      role = await this.prisma.adminRole.create({
        data: {
          name: "区域负责人",
          code: "region_manager",
          description: "管理指定区域的小程序后台账号",
          sortOrder: 30,
          isSystem: true,
        },
      });
    }

    const permissionCodes = [
      "dashboard:view",
      "region:view",
      "region:edit",
      "user:view",
      "post:view",
      "post:audit",
      "comment:view",
      "merchant:view",
      "merchant:audit",
      "product:view",
      "order:view",
      "delivery:view",
      "errand:view",
      "errand:config:view",
      "coupon:view",
      "activity:view",
      "message:view",
      "notification:view",
      "notification:send",
      "system:upload",
    ];
    const permissions = await this.prisma.adminPermission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true },
    });
    for (const permission of permissions) {
      await this.prisma.adminRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    return role;
  }

  private isRegionManagerRoleRef(roleRef: any) {
    return [
      "region_manager",
      "region_admin",
      "REGION_ADMIN",
      "区域负责人",
      "区域管理员",
    ].includes(String(roleRef || ""));
  }

  private async syncRegionManagerRole(
    regionId: string,
    nextAccountId?: string | null,
    previousAccountId?: string | null,
  ) {
    if (!nextAccountId && !previousAccountId) return;
    const role = await this.ensureRegionManagerRole();
    if (previousAccountId && previousAccountId !== nextAccountId) {
      await this.prisma.adminAccountRole.deleteMany({
        where: { accountId: previousAccountId, roleId: role.id, regionId },
      });
    }
    if (!nextAccountId) return;
    const existing = await this.prisma.adminAccountRole.findFirst({
      where: { accountId: nextAccountId, roleId: role.id, regionId },
    });
    if (!existing) {
      await this.prisma.adminAccountRole.create({
        data: { accountId: nextAccountId, roleId: role.id, regionId },
      });
    }
  }

  private toInt(value: any, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private toPositiveInt(value: any, fallback: number) {
    const n = this.toInt(value, fallback);
    return n > 0 ? n : fallback;
  }

  private getZodiac(birthday?: Date | string | null) {
    if (!birthday) return "";
    const date = birthday instanceof Date ? birthday : new Date(birthday);
    if (Number.isNaN(date.getTime())) return "";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const signs = [
      ["摩羯座", 20],
      ["水瓶座", 19],
      ["双鱼座", 21],
      ["白羊座", 20],
      ["金牛座", 21],
      ["双子座", 22],
      ["巨蟹座", 23],
      ["狮子座", 23],
      ["处女座", 23],
      ["天秤座", 24],
      ["天蝎座", 23],
      ["射手座", 22],
      ["摩羯座", 32],
    ] as const;
    return day < signs[month - 1][1] ? signs[month - 1][0] : signs[month][0];
  }

  private toFloatOrNull(value: any) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toOptionalStringOrNull(value: any) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  private toDecimalOrNull(value: any) {
    if (value === undefined || value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private buildRegionAddress(dto: any) {
    const parts = [dto.province, dto.city, dto.district]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    return this.nullableString(dto.address) || parts.join(" ") || null;
  }

  private parseRegionAddress(address?: string | null) {
    const parts = String(address || "")
      .split(/\s+/)
      .filter(Boolean);
    return {
      province: parts[0] || "",
      city: parts[1] || "",
      district: parts.slice(2).join(" ") || "",
    };
  }

  // ==================== 内容管理 ====================
  async posts(query: any, operatorId?: string) {
    const {
      id,
      userId,
      keyword,
      auditStatus,
      type,
      isTop,
      regionId,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (id) where.id = String(id).trim();
    if (userId) where.userId = String(userId).trim();
    if (keyword)
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    if (auditStatus) where.auditStatus = auditStatus;
    if (type) where.type = type.toUpperCase();
    if (isTop === "true") where.isTop = true;
    Object.assign(
      where,
      await this.adminDataScope.regionFieldWhere(
        "regionId",
        operatorId,
        regionId,
      ),
    );
    if (status) {
      if (status.includes(",")) {
        where.status = { in: status.split(",") };
      } else {
        where.status = status;
      }
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          media: true,
          region: { select: { id: true, name: true } },
          _count: {
            select: {
              comments: true,
              likes: true,
              favorites: true,
              reports: true,
            },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.post.count({ where }),
    ]);
    const visibleCommentCounts = list.length
      ? await this.prisma.comment
          .groupBy({
            by: ["postId"],
            where: {
              postId: { in: list.map((p) => p.id) },
              deletedAt: null,
              status: "active",
              auditStatus: "approved",
            },
            _count: { _all: true },
          })
          .catch(() => [])
      : [];
    const visibleCommentCountMap = new Map(
      visibleCommentCounts.map((item: any) => [
        item.postId,
        item._count?._all || 0,
      ]),
    );
    return {
      list: list.map((p) => {
        const visibleCommentCount = visibleCommentCountMap.get(p.id) || 0;
        const imageMedia = (p.media || []).filter((m) => m.type === "IMAGE");
        return {
          id: p.id,
          userId: p.userId,
          userNickname: p.user.nickname,
          userAvatar: p.user.avatar,
          isAnonymous: p.isAnonymous,
          anonymousName: p.anonymousName || null,
          anonymousAvatar: p.anonymousAvatar || null,
          type: p.type?.toLowerCase(),
          title: p.title,
          content: p.content?.slice(0, 200),
          images: imageMedia.map((m) => m.url),
          isTop: p.isTop,
          isHot: false,
          isEssence: p.isEssence,
          auditStatus: p.auditStatus,
          status: p.status,
          regionId: p.regionId,
          regionName: p.region?.name || null,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          commentRecordCount: visibleCommentCount,
          allCommentRecordCount: p._count.comments,
          reportCount: p._count.reports,
          favoriteCount: p.favoriteCount,
          favoriteRecordCount: p._count.favorites,
          counterDiff: {
            likes: p.likeCount - p._count.likes,
            comments: p.commentCount - visibleCommentCount,
            favorites: p.favoriteCount - p._count.favorites,
          },
          shareCount: p.shareCount,
          createdAt: p.createdAt,
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async postDetail(id: string, operatorId?: string) {
    const p = await this.prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        media: true,
        votes: true,
        topics: { include: { topic: true } },
        collaborators: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        reports: {
          include: {
            reporter: { select: { id: true, nickname: true, avatar: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            comments: true,
            likes: true,
            favorites: true,
            reports: true,
          },
        },
      },
    });
    if (!p) throw new NotFoundException("帖子不存在");
    await this.adminDataScope.assertRegionAccess(operatorId, p.regionId);
    const [
      vote,
      voteRecords,
      recentLikes,
      visibleCommentCount,
      likeRecordCount,
      favoriteRecordCount,
      squatCount,
      dislikeCount,
    ] = await Promise.all([
      this.prisma.postVote
        .findUnique({
          where: { postId: id },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        })
        .catch(() => null),
      this.prisma.postVote
        .findUnique({ where: { postId: id }, select: { id: true } })
        .then((item) =>
          item
            ? this.prisma.postVoteRecord.findMany({
                where: { voteId: item.id },
                select: { optionIds: true },
              })
            : [],
        )
        .catch(() => []),
      this.prisma.like
        .findMany({
          where: { targetType: "post", targetId: id },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
                createdAt: true,
                status: true,
                userType: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
        .catch(() => []),
      this.prisma.comment
        .count({
          where: {
            postId: id,
            status: "active",
            auditStatus: "approved",
            deletedAt: null,
          },
        })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
      this.prisma.like
        .count({ where: { targetType: "post", targetId: id } })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
      this.prisma.favorite
        .count({ where: { targetType: "post", targetId: id } })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
      this.prisma.postSquat
        .count({ where: { postId: id } })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
      this.prisma.postDislike
        .count({ where: { targetType: "post", targetId: id } })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
    ]);
    const optionCounts: Record<string, number> = {};
    if (vote) {
      for (const option of vote.options || []) optionCounts[option.id] = 0;
      for (const record of voteRecords) {
        const ids = Array.isArray(record.optionIds) ? record.optionIds : [];
        for (const optionId of ids) {
          if (optionCounts[String(optionId)] !== undefined)
            optionCounts[String(optionId)] += 1;
        }
      }
    }
    const voteSummary = vote
      ? {
          id: vote.id,
          title: vote.title,
          maxSelect: vote.maxSelect,
          allowAdd: vote.allowAdd,
          endAt: vote.endAt,
          totalVotes: voteRecords.length,
          options: (vote.options || []).map((option) => ({
            id: option.id,
            text: option.text,
            sortOrder: option.sortOrder,
            count: optionCounts[option.id] || 0,
          })),
        }
      : null;
    return {
      ...p,
      images: (p.media || [])
        .filter((m) => m.type === "IMAGE")
        .map((m) => m.url),
      commentCount: p.commentCount,
      commentRecordCount: p._count.comments,
      visibleCommentCount,
      likeCount: p.likeCount,
      likeRecordCount,
      favoriteCount: p.favoriteCount,
      favoriteRecordCount,
      reportCount: p._count.reports,
      topics: p.topics?.map((t) => t.topic.name) || [],
      votes: voteSummary ? [voteSummary] : p.votes,
      collaborators: (p.collaborators || []).map((item) => ({
        id: item.id,
        userId: item.userId,
        user: item.user,
        status: "accepted",
        inviteMessage: "",
        inviterId: "",
        acceptedAt: item.createdAt,
        rejectedAt: null,
        createdAt: item.createdAt,
      })),
      reports: p.reports || [],
      recentLikes: recentLikes.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: item.user,
        createdAt: item.createdAt,
      })),
      interaction: {
        squatCount,
        dislikeCount,
      },
      counterCheck: {
        likes: {
          stored: p.likeCount,
          real: likeRecordCount,
          diff: p.likeCount - likeRecordCount,
        },
        comments: {
          stored: p.commentCount,
          real: visibleCommentCount,
          diff: p.commentCount - visibleCommentCount,
        },
        favorites: {
          stored: p.favoriteCount,
          real: favoriteRecordCount,
          diff: p.favoriteCount - favoriteRecordCount,
        },
      },
      mediaHealth: {
        total: p.media?.length || 0,
        missingUrl: (p.media || []).filter((m) => !m.url).length,
        videoWithoutCover: (p.media || []).filter(
          (m) => m.type === "VIDEO" && !m.thumb,
        ).length,
        audioCount: (p.media || []).filter((m) => m.type === "AUDIO").length,
      },
    };
  }

  async auditPost(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const newStatus = dto.status === "approved" ? "approved" : "rejected";
    const postStatus = dto.status === "approved" ? "PUBLISHED" : "REJECTED";
    const before = await this.prisma.post.findUnique({
      where: { id },
      include: { topics: true },
    });
    if (!before) throw new NotFoundException("帖子不存在");
    const updated = await this.prisma.post.update({
      where: { id },
      data: {
        auditStatus: newStatus,
        auditReason: dto.reason,
        status: postStatus,
      },
      include: { topics: true },
    });
    const beforePublished = this.isPublishedPost(before);
    const afterPublished = this.isPublishedPost(updated);
    if (beforePublished !== afterPublished) {
      await this.syncTopicPostCounts(
        beforePublished ? before.topics.map((item: any) => item.topicId) : [],
        afterPublished ? updated.topics.map((item: any) => item.topicId) : [],
      );
      await this.recountCirclePostCount(updated.circleId || before.circleId);
    }
    await this.clearPostFeedCache(updated.regionId || before.regionId);
    await this.logOperation(
      operatorId || "",
      dto.status === "approved" ? "approve_post" : "reject_post",
      "post",
      id,
      "post",
      { reason: dto.reason },
      ip,
    );
    await this.prisma.auditLog.create({
      data: {
        action: dto.status === "approved" ? "APPROVE" : "REJECT",
        module: "post",
        targetId: id,
        detail: { reason: dto.reason, operatorId },
      },
    });
    return { success: true };
  }

  async deletePost(id: string, operatorId?: string, ip?: string) {
    const before = await this.prisma.post.findUnique({
      where: { id },
      include: { topics: true },
    });
    if (!before) throw new NotFoundException("帖子不存在");
    await this.prisma.post.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (this.isPublishedPost(before)) {
      await this.syncTopicPostCounts(
        before.topics.map((item: any) => item.topicId),
        [],
      );
      await this.recountCirclePostCount(before.circleId);
    }
    await this.clearPostFeedCache(before.regionId);
    // AUD-P1-148: 被删除帖子如果正在置顶，取消相关置顶订单
    if (before.isTop) {
      await this.prisma.topupOrder
        .updateMany({
          where: {
            postId: id,
            status: { in: ["pending", "paying", "success"] },
          },
          data: { status: "cancelled" },
        })
        .catch(() => undefined);
    }
    await this.logOperation(
      operatorId || "",
      "delete",
      "post",
      id,
      "post",
      null,
      ip,
    );
    return { success: true };
  }

  async toggleTop(id: string, operatorId?: string, ip?: string) {
    const p = await this.prisma.post.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("帖子不存在");
    await this.prisma.post.update({ where: { id }, data: { isTop: !p.isTop } });
    await this.clearPostFeedCache(p.regionId);
    // AUD-P1-150: 置顶操作记录操作者日志
    await this.logOperation(
      operatorId || "",
      "update",
      "post",
      id,
      "post",
      { isTop: !p.isTop },
      ip,
    );
    return { success: true };
  }

  async comments(query: any) {
    const {
      postId,
      userId,
      keyword,
      auditStatus,
      regionId,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (postId) where.postId = postId;
    if (userId) where.userId = String(userId).trim();
    if (keyword)
      where.OR = [
        { content: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
      ];
    if (auditStatus) where.auditStatus = auditStatus;
    if (status !== undefined && status !== "") {
      const normalizedStatus = String(status).toLowerCase();
      if (["pending", "approved", "rejected"].includes(normalizedStatus)) {
        where.auditStatus = normalizedStatus;
      } else {
        where.status = String(status);
      }
    }
    if (regionId) {
      where.post = { regionId };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }
    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              uid: true,
              nickname: true,
              avatar: true,
              status: true,
              muteEndAt: true,
              muteReason: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
              content: true,
              regionId: true,
              userId: true,
              commentCount: true,
              user: { select: { id: true, nickname: true, avatar: true } },
              region: { select: { name: true } },
            },
          },
          parent: {
            select: {
              id: true,
              content: true,
              userId: true,
              status: true,
              auditStatus: true,
              deletedAt: true,
              user: { select: { id: true, nickname: true, avatar: true } },
            },
          },
          replies: {
            take: 3,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              content: true,
              userId: true,
              status: true,
              auditStatus: true,
              deletedAt: true,
              createdAt: true,
              user: { select: { id: true, nickname: true, avatar: true } },
            },
          },
          _count: { select: { replies: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.comment.count({ where }),
    ]);
    const reportCounts = list.length
      ? await this.prisma.report
          .groupBy({
            by: ["targetId"],
            where: {
              targetType: "comment",
              targetId: { in: list.map((item) => item.id) },
            },
            _count: { _all: true },
          })
          .catch(() => [])
      : [];
    const reportCountMap = new Map(
      reportCounts.map((item: any) => [item.targetId, item._count?._all || 0]),
    );

    return {
      list: list.map((c) => ({
        id: c.id,
        postId: c.postId,
        postTitle: c.post?.title,
        postContent: c.post?.content,
        postAuthorId: c.post?.userId,
        postAuthorName: c.post?.user?.nickname || null,
        postCommentCount: c.post?.commentCount ?? 0,
        regionId: c.post?.regionId,
        regionName: c.post?.region?.name || null,
        userId: c.userId,
        userUid: c.user.uid,
        userName: c.user.nickname,
        userAvatar: c.user.avatar,
        isAnonymous: c.isAnonymous,
        anonymousName: c.anonymousName || null,
        anonymousAvatar: c.anonymousAvatar || null,
        userStatus: c.user.status,
        userMuteEndAt: c.user.muteEndAt,
        userMuteReason: c.user.muteReason,
        parentId: c.parentId,
        parent: c.parent
          ? {
              id: c.parent.id,
              content: c.parent.content,
              userId: c.parent.userId,
              userName: c.parent.user?.nickname || null,
              userAvatar: c.parent.user?.avatar || null,
              status: c.parent.status,
              auditStatus: c.parent.auditStatus,
              deletedAt: c.parent.deletedAt,
            }
          : null,
        content: c.content,
        likeCount: c.likeCount,
        replyCount: c._count.replies,
        replyPreview: c.replies.map((reply) => ({
          id: reply.id,
          content: reply.content,
          userId: reply.userId,
          userName: reply.user?.nickname || null,
          userAvatar: reply.user?.avatar || null,
          status: reply.status,
          auditStatus: reply.auditStatus,
          deletedAt: reply.deletedAt,
          createdAt: reply.createdAt,
        })),
        reportCount: reportCountMap.get(c.id) || 0,
        countedInPost: this.isCountedComment(c),
        auditStatus: c.auditStatus,
        auditReason: c.auditReason,
        status: c.status,
        isTop: c.isTop,
        deletedAt: c.deletedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async commentDetail(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            uid: true,
            nickname: true,
            avatar: true,
            status: true,
            muteEndAt: true,
            muteReason: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                posts: true,
                comments: true,
                reports: true,
                reported: true,
              },
            },
          },
        },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            userId: true,
            status: true,
            auditStatus: true,
            commentCount: true,
            createdAt: true,
            user: { select: { id: true, nickname: true, avatar: true } },
            region: { select: { id: true, name: true } },
          },
        },
        parent: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
        replies: {
          take: 20,
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });
    if (!comment) throw new NotFoundException("评论不存在");

    const [likeCount, reports, lottery] = await Promise.all([
      this.prisma.like
        .count({ where: { targetType: "comment", targetId: id } })
        .catch(
          (e: any) => (console.warn("Stats query failed:", e?.message), 0),
        ),
      this.prisma.report
        .findMany({
          where: { targetType: "comment", targetId: id },
          include: {
            reporter: { select: { id: true, nickname: true, avatar: true } },
            reported: { select: { id: true, nickname: true, avatar: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
        .catch(() => []),
      this.prisma.commentLottery
        .findUnique({
          where: { postId: comment.postId },
          include: { prizes: true, winners: true },
        })
        .catch(() => null),
    ]);

    return {
      baseInfo: {
        id: comment.id,
        content: comment.content,
        isAnonymous: comment.isAnonymous,
        anonymousName: comment.anonymousName || null,
        anonymousAvatar: comment.anonymousAvatar || null,
        status: comment.status,
        auditStatus: comment.auditStatus,
        auditReason: comment.auditReason,
        isTop: comment.isTop,
        likeCount: comment.likeCount,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        deletedAt: comment.deletedAt,
      },
      author: {
        ...comment.user,
        risk: {
          muted:
            !!comment.user?.muteEndAt &&
            new Date(comment.user.muteEndAt).getTime() > Date.now(),
          reportCount: comment.user?._count?.reported || 0,
          commentCount: comment.user?._count?.comments || 0,
          postCount: comment.user?._count?.posts || 0,
        },
      },
      post: comment.post,
      parent: comment.parent,
      replies: comment.replies,
      counterImpact: {
        countedInPost: this.isCountedComment(comment),
        postCommentCount: comment.post?.commentCount ?? 0,
      },
      likes: {
        storedCount: comment.likeCount,
        realCount: likeCount,
        drift: comment.likeCount - likeCount,
      },
      reports: {
        total: reports.length,
        list: reports,
      },
      lottery: lottery
        ? {
            id: lottery.id,
            title: lottery.title,
            status: lottery.status,
            drawAt: lottery.drawAt,
            prizeCount: lottery.prizes.length,
            winnerCount: lottery.winners.length,
          }
        : null,
      timeline: [
        { action: "created", title: "创建评论", at: comment.createdAt },
        ...(comment.auditStatus !== "pending"
          ? [
              {
                action: "audit",
                title: "审核处理",
                at: comment.updatedAt,
                reason: comment.auditReason,
              },
            ]
          : []),
        ...(comment.isTop
          ? [{ action: "pin", title: "评论置顶", at: comment.updatedAt }]
          : []),
        ...(comment.deletedAt
          ? [{ action: "delete", title: "评论删除", at: comment.deletedAt }]
          : []),
      ],
    };
  }

  async getCommentsStats() {
    try {
      const today = this.getTodayStart();
      const [total, todayCount, pending, deleted] = await Promise.all([
        this.prisma.comment
          .count()
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.comment
          .count({ where: { createdAt: { gte: today } } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.comment
          .count({
            where: { auditStatus: "pending", status: { not: "deleted" } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.comment
          .count({
            where: {
              OR: [{ status: "deleted" }, { deletedAt: { not: null } }],
            },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);
      return { total, today: todayCount, pending, deleted };
    } catch {
      return { total: 0, today: 0, pending: 0, deleted: 0 };
    }
  }

  async deleteComment(id: string, operatorId?: string, ip?: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("评论不存在");
    if (!comment.deletedAt && comment.status !== "deleted") {
      const updated = await this.updateCommentWithCounter(id, {
        status: "deleted",
        deletedAt: new Date(),
        isTop: false,
      });
      await this.clearPostFeedCacheByPostId(updated.postId);
    }
    await this.logOperation(
      operatorId || "",
      "delete",
      "comment",
      id,
      "comment",
      null,
      ip,
    );
    return { success: true };
  }

  async auditComment(id: string, dto: { status: string; reason?: string }) {
    const updateData: any = {};
    if (dto.status === "active" || dto.status === "approved") {
      updateData.status = "active";
      updateData.auditStatus = "approved";
      updateData.deletedAt = null;
    } else if (dto.status === "hidden") {
      updateData.status = "hidden";
      updateData.auditStatus = "approved";
    } else if (dto.status === "deleted" || dto.status === "rejected") {
      updateData.status = "deleted";
      updateData.auditStatus =
        dto.status === "rejected" ? "rejected" : "approved";
      updateData.deletedAt = new Date();
      updateData.isTop = false;
    } else if (dto.status === "pending") {
      updateData.status = "hidden";
      updateData.auditStatus = "pending";
    } else {
      throw new BadRequestException("不支持的评论状态");
    }
    if (dto.reason) updateData.auditReason = dto.reason;
    const comment = await this.updateCommentWithCounter(id, updateData);
    await this.clearPostFeedCacheByPostId(comment.postId);
    return { success: true };
  }

  async circles(query: any) {
    const { keyword, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.circle.count({ where }),
    ]);
    return {
      list: list.map((c) => ({
        id: c.id,
        name: c.name,
        cover: c.cover,
        description: c.description,
        postCount: c.postCount,
        memberCount: c.memberCount,
        isOfficial: c.isOfficial,
        status: c.status === "active" ? 1 : 0,
        createdAt: c.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async circleDetail(id: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle) throw new NotFoundException("圈子不存在");
    return {
      success: true,
      data: {
        id: circle.id,
        name: circle.name,
        icon: circle.icon,
        cover: circle.cover,
        description: circle.description,
        regionId: circle.regionId,
        joinType: circle.joinType,
        maxMembers: circle.maxMembers,
        tags: circle.tags,
        postCount: circle.postCount,
        memberCount: circle.memberCount,
        isOfficial: circle.isOfficial,
        status: circle.status,
        createdAt: circle.createdAt,
      },
    };
  }

  async reports(query: any) {
    const { status, targetType, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, nickname: true } },
          reported: { select: { id: true, nickname: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterName: r.reporter?.nickname,
        reportedName: r.reported?.nickname,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        description: r.detail,
        status: r.status,
        result: r.result,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async handleReport(
    id: string,
    dto: {
      status: string;
      result?: string;
      action?: string;
      muteDays?: number;
    },
    handlerId?: string,
    ip?: string,
  ) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("举报记录不存在");
    const status = this.normalizeReportStatus(dto.status);
    const action =
      status === "resolved" ? this.normalizeReportAction(dto.action) : "none";
    const effects =
      status === "resolved"
        ? await this.applyReportAction(report, action, dto.result, dto.muteDays)
        : [];

    await this.prisma.report.update({
      where: { id },
      data: {
        status,
        result: dto.result,
        handlerId,
        handledAt: ["resolved", "rejected"].includes(status)
          ? new Date()
          : null,
      },
    });
    await this.logOperation(
      handlerId || "",
      "handle_report",
      "report",
      id,
      "report",
      { status, action, result: dto.result, effects },
      ip,
    );
    return { success: true, status, action, effects };
  }

  async repairContentCounters(operatorId?: string, ip?: string) {
    const posts = await this.prisma.post.findMany({
      select: {
        id: true,
        likeCount: true,
        favoriteCount: true,
        commentCount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const diffs: any[] = [];
    for (const post of posts) {
      const [likeCount, favoriteCount, commentCount] = await Promise.all([
        this.prisma.like.count({
          where: { targetType: "post", targetId: post.id },
        }),
        this.prisma.favorite.count({
          where: { targetType: "post", targetId: post.id },
        }),
        this.prisma.comment.count({
          where: {
            postId: post.id,
            deletedAt: null,
            status: "active",
            auditStatus: "approved",
          },
        }),
      ]);
      const changed =
        post.likeCount !== likeCount ||
        post.favoriteCount !== favoriteCount ||
        post.commentCount !== commentCount;
      if (!changed) continue;
      await this.prisma.post.update({
        where: { id: post.id },
        data: { likeCount, favoriteCount, commentCount },
      });
      diffs.push({
        postId: post.id,
        before: {
          likeCount: post.likeCount,
          favoriteCount: post.favoriteCount,
          commentCount: post.commentCount,
        },
        after: { likeCount, favoriteCount, commentCount },
      });
    }

    await this.logOperation(
      operatorId || "",
      "repair_content_counters",
      "content",
      "content_counters",
      "content_counters",
      { checked: posts.length, repaired: diffs.length },
      ip,
    );
    return {
      success: true,
      checked: posts.length,
      repaired: diffs.length,
      diffs: diffs.slice(0, 50),
    };
  }

  private quoteTextCoverColumn(column: string) {
    const provider = String(
      process.env.DB_PROVIDER || process.env.DATABASE_PROVIDER || "",
    ).toLowerCase();
    const databaseUrl = String(process.env.DATABASE_URL || "").toLowerCase();
    const mysql =
      provider.includes("mysql") || databaseUrl.startsWith("mysql://");
    return mysql ? `\`${column}\`` : `"${column}"`;
  }

  private textCoverBool(value: any, fallback = false) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    return ["1", "true", "yes", "on", "enabled"].includes(text);
  }

  private textCoverInt(value: any, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  }

  private textCoverColor(value: any, fallback: string) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(text) ? text : fallback;
  }

  private normalizeTextCoverTemplatePayload(dto: any) {
    const data = dto || {};
    const backgroundType = ["color", "gradient", "image"].includes(
      String(data.backgroundType || "").trim(),
    )
      ? String(data.backgroundType).trim()
      : "color";
    return {
      regionId: String(data.regionId || data.region_id || "").trim() || null,
      name: this.compactText(data.name || "文字封面模板", 40) || "文字封面模板",
      enabled: this.textCoverBool(data.enabled, true),
      isDefault: this.textCoverBool(data.isDefault ?? data.is_default, false),
      backgroundType,
      backgroundColor: this.textCoverColor(
        data.backgroundColor ?? data.background_color,
        "#F7F3EA",
      ),
      gradientStart: this.textCoverColor(
        data.gradientStart ?? data.gradient_start,
        "#FFF6E8",
      ),
      gradientEnd: this.textCoverColor(
        data.gradientEnd ?? data.gradient_end,
        "#F8E7FF",
      ),
      backgroundImage:
        String(data.backgroundImage || data.background_image || "").trim() ||
        null,
      textColor: this.textCoverColor(
        data.textColor ?? data.text_color,
        "#222222",
      ),
      accentColor: this.textCoverColor(
        data.accentColor ?? data.accent_color,
        "#FF4D5A",
      ),
      titleFontSize: this.textCoverInt(
        data.titleFontSize ?? data.title_font_size,
        30,
        20,
        44,
      ),
      bodyFontSize: this.textCoverInt(
        data.bodyFontSize ?? data.body_font_size,
        24,
        18,
        34,
      ),
      maxTitleChars: this.textCoverInt(
        data.maxTitleChars ?? data.max_title_chars,
        24,
        8,
        60,
      ),
      maxSummaryChars: this.textCoverInt(
        data.maxSummaryChars ?? data.max_summary_chars,
        72,
        24,
        180,
      ),
      maxLines: this.textCoverInt(data.maxLines ?? data.max_lines, 6, 3, 10),
      coverHeight: this.textCoverInt(
        data.coverHeight ?? data.cover_height,
        350,
        240,
        520,
      ),
      showTopic: this.textCoverBool(data.showTopic ?? data.show_topic, true),
      showCircle: this.textCoverBool(data.showCircle ?? data.show_circle, true),
      priority: this.textCoverInt(data.priority, 0, -999, 999),
    };
  }

  private normalizeTextCoverTemplate(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      regionId: row.regionId || null,
      name: row.name || "文字封面模板",
      enabled: this.textCoverBool(row.enabled, true),
      isDefault: this.textCoverBool(row.isDefault, false),
      backgroundType: row.backgroundType || "color",
      backgroundColor: row.backgroundColor || "#F7F3EA",
      gradientStart: row.gradientStart || "#FFF6E8",
      gradientEnd: row.gradientEnd || "#F8E7FF",
      backgroundImage: row.backgroundImage || "",
      textColor: row.textColor || "#222222",
      accentColor: row.accentColor || "#FF4D5A",
      titleFontSize: Number(row.titleFontSize || 30),
      bodyFontSize: Number(row.bodyFontSize || 24),
      maxTitleChars: Number(row.maxTitleChars || 24),
      maxSummaryChars: Number(row.maxSummaryChars || 72),
      maxLines: Number(row.maxLines || 6),
      coverHeight: Number(row.coverHeight || 350),
      showTopic: this.textCoverBool(row.showTopic, true),
      showCircle: this.textCoverBool(row.showCircle, true),
      priority: Number(row.priority || 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async applyTextCoverDefaultRule(
    regionId: string | null,
    templateId: string,
  ) {
    const q = (column: string) => this.quoteTextCoverColumn(column);
    if (regionId) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE post_text_cover_templates SET ${q("isDefault")} = false WHERE ${q("regionId")} = ? AND ${q("id")} <> ?`,
        regionId,
        templateId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE post_text_cover_templates SET ${q("isDefault")} = false WHERE ${q("regionId")} IS NULL AND ${q("id")} <> ?`,
        templateId,
      );
    }
  }

  async textCoverTemplates(query: any) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.max(
      1,
      Math.min(100, Number(query.pageSize || query.limit || 20)),
    );
    const regionId = String(query.regionId || query.region_id || "").trim();
    const keyword = String(query.keyword || "").trim();
    const q = (column: string) => this.quoteTextCoverColumn(column);
    const where: string[] = [];
    const params: any[] = [];
    if (regionId) {
      where.push(`(${q("regionId")} = ? OR ${q("regionId")} IS NULL)`);
      params.push(regionId);
    }
    if (keyword) {
      where.push(`${q("name")} LIKE ?`);
      params.push(`%${keyword}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM post_text_cover_templates ${whereSql} ORDER BY ${q("isDefault")} DESC, ${q("priority")} DESC, ${q("createdAt")} DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    );
    const totalRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM post_text_cover_templates ${whereSql}`,
      ...params,
    );
    const total = Number(totalRows?.[0]?.total || 0);
    return {
      list: rows.map((item) => this.normalizeTextCoverTemplate(item)),
      total,
      page,
      pageSize,
    };
  }

  async createTextCoverTemplate(dto: any, operatorId?: string, ip?: string) {
    const data = this.normalizeTextCoverTemplatePayload(dto);
    const id = crypto.randomUUID();
    const q = (column: string) => this.quoteTextCoverColumn(column);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO post_text_cover_templates (${q("id")}, ${q("regionId")}, ${q("name")}, ${q("enabled")}, ${q("isDefault")}, ${q("backgroundType")}, ${q("backgroundColor")}, ${q("gradientStart")}, ${q("gradientEnd")}, ${q("backgroundImage")}, ${q("textColor")}, ${q("accentColor")}, ${q("titleFontSize")}, ${q("bodyFontSize")}, ${q("maxTitleChars")}, ${q("maxSummaryChars")}, ${q("maxLines")}, ${q("coverHeight")}, ${q("showTopic")}, ${q("showCircle")}, ${q("priority")}, ${q("createdAt")}, ${q("updatedAt")}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      data.regionId,
      data.name,
      data.enabled,
      data.isDefault,
      data.backgroundType,
      data.backgroundColor,
      data.gradientStart,
      data.gradientEnd,
      data.backgroundImage,
      data.textColor,
      data.accentColor,
      data.titleFontSize,
      data.bodyFontSize,
      data.maxTitleChars,
      data.maxSummaryChars,
      data.maxLines,
      data.coverHeight,
      data.showTopic,
      data.showCircle,
      data.priority,
    );
    if (data.isDefault) await this.applyTextCoverDefaultRule(data.regionId, id);
    await this.logOperation(
      operatorId || "",
      "create_text_cover_template",
      "post",
      id,
      "post_text_cover_template",
      data,
      ip,
    );
    return { success: true, id };
  }

  async updateTextCoverTemplate(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const data = this.normalizeTextCoverTemplatePayload(dto);
    const q = (column: string) => this.quoteTextCoverColumn(column);
    await this.prisma.$executeRawUnsafe(
      `UPDATE post_text_cover_templates SET ${q("regionId")} = ?, ${q("name")} = ?, ${q("enabled")} = ?, ${q("isDefault")} = ?, ${q("backgroundType")} = ?, ${q("backgroundColor")} = ?, ${q("gradientStart")} = ?, ${q("gradientEnd")} = ?, ${q("backgroundImage")} = ?, ${q("textColor")} = ?, ${q("accentColor")} = ?, ${q("titleFontSize")} = ?, ${q("bodyFontSize")} = ?, ${q("maxTitleChars")} = ?, ${q("maxSummaryChars")} = ?, ${q("maxLines")} = ?, ${q("coverHeight")} = ?, ${q("showTopic")} = ?, ${q("showCircle")} = ?, ${q("priority")} = ?, ${q("updatedAt")} = CURRENT_TIMESTAMP WHERE ${q("id")} = ?`,
      data.regionId,
      data.name,
      data.enabled,
      data.isDefault,
      data.backgroundType,
      data.backgroundColor,
      data.gradientStart,
      data.gradientEnd,
      data.backgroundImage,
      data.textColor,
      data.accentColor,
      data.titleFontSize,
      data.bodyFontSize,
      data.maxTitleChars,
      data.maxSummaryChars,
      data.maxLines,
      data.coverHeight,
      data.showTopic,
      data.showCircle,
      data.priority,
      id,
    );
    if (data.isDefault) await this.applyTextCoverDefaultRule(data.regionId, id);
    await this.logOperation(
      operatorId || "",
      "update_text_cover_template",
      "post",
      id,
      "post_text_cover_template",
      data,
      ip,
    );
    return { success: true, id };
  }

  async deleteTextCoverTemplate(id: string, operatorId?: string, ip?: string) {
    const q = (column: string) => this.quoteTextCoverColumn(column);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM post_text_cover_templates WHERE ${q("id")} = ?`,
      id,
    );
    await this.logOperation(
      operatorId || "",
      "delete_text_cover_template",
      "post",
      id,
      "post_text_cover_template",
      {},
      ip,
    );
    return { success: true };
  }

  // ==================== 商城：商家 ====================
  async merchants(query: any, operatorId?: string) {
    const {
      keyword,
      auditStatus,
      status,
      regionId,
      categoryId,
      businessType,
      deliveryMode,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (keyword) {
      const text = String(keyword).trim();
      where.OR = [
        { name: { contains: text } },
        { contactPerson: { contains: text } },
        { phone: { contains: text } },
        { userId: text },
        { user: { is: { nickname: { contains: text } } } },
        { user: { is: { phone: { contains: text } } } },
      ];
    }
    if (auditStatus || status) where.status = auditStatus || status;
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    if (businessType) where.businessType = businessType;
    if (deliveryMode && businessType !== "dorm_shop")
      where.deliveryMode = deliveryMode;
    Object.assign(
      where,
      await this.adminDataScope.regionFieldWhere(
        "regionId",
        operatorId,
        regionId,
      ),
    );
    const [list, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          region: { select: { name: true } },
          category: { select: { name: true } },
          user: {
            select: {
              id: true,
              uid: true,
              nickname: true,
              avatar: true,
              phone: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return {
      list: list.map((m) => {
        const rowBusinessType = (m as any).businessType || "takeaway";
        const rowDeliveryMode =
          rowBusinessType === "dorm_shop"
            ? "self_delivery"
            : (m as any).deliveryMode || "platform_rider";
        const ownerUser = this.formatMiniUser((m as any).user);
        return {
          id: m.id,
          userId: m.userId || "",
          ownerUserId: m.userId || "",
          user: ownerUser,
          ownerUser,
          ownerNickname: ownerUser?.nickname || "",
          ownerAvatar: ownerUser?.avatar || "",
          ownerPhone: ownerUser?.phone || "",
          ownerUid: ownerUser?.uid || null,
          name: m.name,
          businessType: rowBusinessType,
          deliveryMode: rowDeliveryMode,
          deliveryModeLabel: this.deliveryModeLabel(rowDeliveryMode),
          deliveryFee: Number((m as any).deliveryFee || 0),
          logo: m.logo,
          cover: m.cover,
          phone: m.phone,
          contactPerson: m.contactPerson || m.name,
          address: m.address,
          latitude: (m as any).latitude,
          longitude: (m as any).longitude,
          dormBuilding: (m as any).dormBuilding || "",
          dormRoom: (m as any).dormRoom || "",
          studentVerified: Boolean((m as any).studentVerified),
          regionId: m.regionId,
          regionName: (m as any).region?.name || "",
          categoryId: m.categoryId,
          categoryName: (m as any).category?.name || "",
          auditStatus: m.status,
          status: m.status === "approved" ? 1 : 0,
          score: m.rating,
          orderCount: m.saleCount,
          createdAt: m.createdAt,
          businessHours: m.businessHours,
          closedNotice: (m as any).closedNotice || "",
          description: m.description,
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async merchantDetail(id: string, operatorId?: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        products: true,
        region: { select: { name: true } },
        category: { select: { name: true } },
        user: {
          select: {
            id: true,
            uid: true,
            nickname: true,
            avatar: true,
            phone: true,
            status: true,
          },
        },
      },
    });
    if (!m) throw new NotFoundException("商家不存在");
    await this.adminDataScope.assertRegionAccess(operatorId, m.regionId);
    const ownerUser = this.formatMiniUser((m as any).user);
    return {
      ...m,
      user: ownerUser,
      ownerUser,
      ownerUserId: m.userId || "",
      ownerNickname: ownerUser?.nickname || "",
      ownerAvatar: ownerUser?.avatar || "",
      ownerPhone: ownerUser?.phone || "",
      ownerUid: ownerUser?.uid || null,
      regionName: (m as any).region?.name || "",
      categoryName: (m as any).category?.name || "",
    };
  }

  async auditMerchant(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商家不存在");
    await this.adminDataScope.assertRegionAccess(operatorId, merchant.regionId);
    if (dto.status === "approved" && merchant.businessType === "dorm_shop") {
      this.assertValidBusinessHours(
        merchant.businessHours,
        "宿舍小店通过审核前必须先配置营业时间",
      );
    }
    await this.prisma.merchant.update({
      where: { id },
      data: { status: dto.status, rejectReason: dto.remark },
    });
    await this.logOperation(
      operatorId || "",
      "audit_merchant",
      "merchant",
      id,
      "merchant",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async updateMerchantStatus(
    id: string,
    status: string,
    closedNotice?: string | null,
  ) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商家不存在");
    if (status === "approved" && merchant.businessType === "dorm_shop") {
      this.assertValidBusinessHours(
        merchant.businessHours,
        "宿舍小店启用前必须先配置营业时间",
      );
    }
    const notice = this.normalizeClosedNotice(closedNotice);
    if (
      status === "closed" &&
      merchant.businessType === "dorm_shop" &&
      !notice
    ) {
      throw new BadRequestException("关闭宿舍小店时必须填写小程序弹窗提示");
    }
    await this.prisma.merchant.update({
      where: { id },
      data: {
        status,
        closedNotice: status === "closed" ? notice : null,
      },
    });
    return { success: true };
  }

  async batchMerchants(
    dto: { ids: string[]; action: string; value?: any },
    operatorId?: string,
    ip?: string,
  ) {
    if (!dto.ids?.length) throw new BadRequestException("请选择商家");
    switch (dto.action) {
      case "approve":
        await this.assertBatchDormShopsReady(dto.ids);
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "approved" },
        });
        break;
      case "reject":
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "rejected", rejectReason: dto.value },
        });
        break;
      case "close":
        await this.assertBatchDormShopsClosedNotice(dto.ids, dto.value);
        await this.prisma.merchant.updateMany({
          where: { id: { in: dto.ids } },
          data: {
            status: "closed",
            closedNotice: this.normalizeClosedNotice(dto.value),
          },
        });
        break;
      default:
        throw new BadRequestException("不支持的操作类型");
    }
    await this.logOperation(
      operatorId || "",
      `batch_${dto.action}`,
      "merchant",
      dto.ids.join(","),
      "merchant",
      { count: dto.ids.length },
      ip,
    );
    return { success: true, count: dto.ids.length };
  }

  async createMerchant(dto: any, operatorId?: string, ip?: string) {
    const businessType = dto.businessType || "takeaway";
    const businessHours = dto.businessHours
      ? this.normalizeBusinessHours(dto.businessHours)
      : null;
    const closedNotice = this.normalizeClosedNotice(
      dto.closedNotice ?? dto.closed_notice,
    );
    if (businessType === "dorm_shop") {
      this.assertValidBusinessHours(businessHours, "宿舍小店必须配置营业时间");
      if ((dto.status || "pending") === "closed" && !closedNotice) {
        throw new BadRequestException("关闭宿舍小店时必须填写小程序弹窗提示");
      }
    }
    const data: any = {
      name: dto.name,
      logo: dto.logo,
      cover: dto.cover,
      phone: dto.phone,
      contactPerson: dto.contactPerson,
      address: dto.address,
      businessType,
      deliveryMode: this.resolveMerchantDeliveryMode(
        businessType,
        dto.deliveryMode || dto.delivery_mode,
      ),
      deliveryFee:
        businessType === "dorm_shop"
          ? this.normalizeDeliveryFee(
              dto.deliveryFee ?? dto.delivery_fee ?? dto.merchant_delivery_fee,
            )
          : 0,
      dormBuilding: dto.dormBuilding,
      dormRoom: dto.dormRoom,
      studentVerified:
        dto.studentVerified === true || dto.studentVerified === "true",
      latitude: this.toFloatOrNull(dto.latitude),
      longitude: this.toFloatOrNull(dto.longitude),
      businessHours,
      closedNotice:
        (dto.status || "pending") === "closed" ? closedNotice : null,
      description: dto.description,
      regionId: this.toOptionalStringOrNull(dto.regionId),
      categoryId: this.toOptionalStringOrNull(dto.categoryId),
      status: dto.status || "pending",
    };
    data.userId = await this.normalizeMerchantOwnerUserId(
      this.merchantOwnerInput(dto),
      dto.phone,
    );
    const merchant = await this.prisma.merchant.create({ data });
    await this.logOperation(
      operatorId || "",
      "create",
      "merchant",
      merchant.id,
      "merchant",
      { name: dto.name },
      ip,
    );
    return { success: true, data: merchant };
  }

  async updateMerchant(id: string, dto: any, operatorId?: string, ip?: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商家不存在");
    const data: any = {};
    const nextBusinessType =
      dto.businessType || merchant.businessType || "takeaway";
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.logo !== undefined) data.logo = dto.logo;
    if (dto.cover !== undefined) data.cover = dto.cover;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.businessType !== undefined) data.businessType = dto.businessType;
    if (
      dto.deliveryMode !== undefined ||
      dto.delivery_mode !== undefined ||
      dto.businessType !== undefined ||
      nextBusinessType === "dorm_shop"
    ) {
      data.deliveryMode = this.resolveMerchantDeliveryMode(
        dto.businessType || merchant.businessType || "takeaway",
        dto.deliveryMode || dto.delivery_mode || merchant.deliveryMode,
      );
    }
    if (
      dto.deliveryFee !== undefined ||
      dto.delivery_fee !== undefined ||
      dto.merchant_delivery_fee !== undefined
    ) {
      data.deliveryFee = this.normalizeDeliveryFee(
        dto.deliveryFee ?? dto.delivery_fee ?? dto.merchant_delivery_fee,
      );
    }
    if (dto.dormBuilding !== undefined) data.dormBuilding = dto.dormBuilding;
    if (dto.dormRoom !== undefined) data.dormRoom = dto.dormRoom;
    if (dto.studentVerified !== undefined)
      data.studentVerified =
        dto.studentVerified === true || dto.studentVerified === "true";
    if (dto.latitude !== undefined)
      data.latitude = this.toFloatOrNull(dto.latitude);
    if (dto.longitude !== undefined)
      data.longitude = this.toFloatOrNull(dto.longitude);
    if (dto.businessHours !== undefined)
      data.businessHours = dto.businessHours
        ? this.normalizeBusinessHours(dto.businessHours)
        : null;
    const hasClosedNotice =
      dto.closedNotice !== undefined || dto.closed_notice !== undefined;
    if (hasClosedNotice)
      data.closedNotice = this.normalizeClosedNotice(
        dto.closedNotice ?? dto.closed_notice,
      );
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.regionId !== undefined)
      data.regionId = this.toOptionalStringOrNull(dto.regionId);
    if (dto.categoryId !== undefined)
      data.categoryId = this.toOptionalStringOrNull(dto.categoryId);
    if (dto.status !== undefined) data.status = dto.status;
    if (this.hasMerchantOwnerInput(dto)) {
      data.userId = await this.normalizeMerchantOwnerUserId(
        this.merchantOwnerInput(dto),
        dto.phone ?? merchant.phone,
      );
    }
    if (
      nextBusinessType === "dorm_shop" &&
      (data.status === "approved" || merchant.status === "approved")
    ) {
      this.assertValidBusinessHours(
        data.businessHours ?? merchant.businessHours,
        "宿舍小店必须配置营业时间",
      );
    }
    const nextStatus = data.status ?? merchant.status;
    if (nextStatus === "closed" && nextBusinessType === "dorm_shop") {
      const nextNotice = hasClosedNotice
        ? data.closedNotice
        : (merchant as any).closedNotice;
      if (!this.normalizeClosedNotice(nextNotice)) {
        throw new BadRequestException("关闭宿舍小店时必须填写小程序弹窗提示");
      }
    }
    if (nextStatus !== "closed") data.closedNotice = null;
    const updated = await this.prisma.merchant.update({ where: { id }, data });
    await this.logOperation(
      operatorId || "",
      "update",
      "merchant",
      id,
      "merchant",
      { name: dto.name },
      ip,
    );
    return { success: true, data: updated };
  }

  async deleteMerchant(id: string, operatorId?: string, ip?: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("商家不存在");
    // 软删除：将状态改为 closed
    await this.prisma.merchant.update({
      where: { id },
      data: { status: "closed" },
    });
    await this.logOperation(
      operatorId || "",
      "delete",
      "merchant",
      id,
      "merchant",
      null,
      ip,
    );
    return { success: true };
  }

  // ==================== 商城：分类/商品 ====================
  async categories(query: any = {}) {
    const businessType =
      query.businessType || query.business_type || "takeaway";
    const type = query.type || "product";
    const where: any = {
      parentId: null,
      status: { not: "deleted" },
    };
    if (businessType) where.businessType = businessType;
    if (type) where.type = type;

    const list = await this.prisma.category.findMany({
      include: {
        children: {
          where: {
            status: { not: "deleted" },
            ...(businessType ? { businessType } : {}),
            ...(type ? { type } : {}),
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      where,
      orderBy: { sortOrder: "asc" },
    });
    return { list, total: list.length };
  }

  async products(query: any) {
    const {
      keyword,
      status,
      merchantId,
      categoryId,
      businessType,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (status) where.status = status === "on" ? "on_sale" : status;
    if (merchantId) where.merchantId = merchantId;
    if (categoryId) where.categoryId = categoryId;
    if (businessType) where.merchant = { businessType };
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          merchant: { select: { name: true, businessType: true } },
          category: { select: { name: true } },
          skus: true,
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        merchantId: p.merchantId,
        merchantName: p.merchant?.name,
        businessType: (p.merchant as any)?.businessType || "takeaway",
        categoryId: p.categoryId,
        categoryName: p.category?.name,
        name: p.name,
        coverImage: (p.images as any)?.[0] || "",
        images: p.images,
        minPrice: Math.round(Number(p.price) * 100),
        maxPrice: Math.round(Number(p.price) * 100),
        totalStock: p.stock,
        totalSales: p.saleCount,
        skus: p.skus,
        status: p.status === "on_sale" ? "on" : "off",
        createdAt: p.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async productDetail(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        skus: true,
        merchant: { select: { name: true, businessType: true } },
        category: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException("商品不存在");
    return {
      ...p,
      merchantName: p.merchant?.name,
      businessType: (p.merchant as any)?.businessType || "takeaway",
      categoryName: p.category?.name,
      coverImage: (p.images as any)?.[0],
      minPrice: Math.round(Number(p.price) * 100),
      maxPrice: Math.round(Number(p.price) * 100),
    };
  }

  async batchProducts(
    dto: { ids: string[]; action: string; value?: any },
    operatorId?: string,
    ip?: string,
  ) {
    if (!dto.ids?.length) throw new BadRequestException("请选择商品");
    switch (dto.action) {
      case "on":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "on_sale" },
        });
        break;
      case "off":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "off_sale" },
        });
        break;
      case "delete":
        await this.prisma.product.updateMany({
          where: { id: { in: dto.ids } },
          data: { status: "deleted" },
        });
        break;
      default:
        throw new BadRequestException("不支持的操作类型");
    }
    await this.logOperation(
      operatorId || "",
      `batch_${dto.action}`,
      "product",
      dto.ids.join(","),
      "product",
      { count: dto.ids.length },
      ip,
    );
    return { success: true, count: dto.ids.length };
  }

  // ==================== 评价管理 ====================
  async reviews(query: any, operatorId?: string) {
    const {
      keyword,
      rating,
      productId,
      orderId,
      merchantId,
      status,
      page = 1,
      pageSize = 20,
    } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) {
      const merchantIds = (
        await this.prisma.merchant.findMany({
          where: { regionId: { in: scope.regionIds } },
          select: { id: true },
        })
      ).map((merchant) => merchant.id);
      where.merchantId = {
        in: merchantId
          ? merchantIds.includes(merchantId)
            ? [merchantId]
            : []
          : merchantIds,
      };
    }
    if (keyword) where.content = { contains: keyword };
    if (rating) where.rating = +rating;
    if (productId) where.productId = productId;
    if (orderId) where.orderId = orderId;
    if (merchantId && scope.isSuperAdmin) where.merchantId = merchantId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          product: { select: { name: true } },
          order: { select: { orderNo: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        userId: r.userId,
        userNickname: r.user?.nickname,
        userAvatar: r.user?.avatar,
        productId: r.productId,
        productName: r.product?.name,
        orderId: r.orderId,
        orderNo: r.order?.orderNo,
        merchantId: r.merchantId,
        rating: r.rating,
        content: r.content,
        images: r.images,
        isAnonymous: r.isAnonymous,
        reply: r.reply,
        replyAt: r.replyAt,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async deleteReview(id: string, operatorId?: string, ip?: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("评价不存在");
    await this.assertReviewRegionAccess(operatorId, r);
    await this.prisma.review.update({
      where: { id },
      data: { status: "hidden" },
    });
    await this.logOperation(
      operatorId || "",
      "hide",
      "review",
      id,
      "review",
      null,
      ip,
    );
    return { success: true };
  }

  async replyReview(
    id: string,
    reply: string,
    operatorId?: string,
    ip?: string,
  ) {
    const content = String(reply || "").trim();
    if (!content) throw new BadRequestException("回复内容不能为空");
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("评价不存在");
    await this.assertReviewRegionAccess(operatorId, r);
    if (String(r.status || "active") !== "active")
      throw new BadRequestException("该评价已隐藏，无法回复");
    await this.prisma.review.update({
      where: { id },
      data: { reply: content, replyAt: new Date() },
    });
    await this.logOperation(
      operatorId || "",
      "reply",
      "review",
      id,
      "review",
      { reply: content },
      ip,
    );
    if (r.userId && r.orderId) {
      await this.notifyService
        ?.createAndDispatch({
          userId: r.userId,
          type: "order",
          scene: "shop_review_platform_reply",
          title: "你的订单评价有新回复",
          content: "平台已回复你的订单评价。",
          data: {
            orderId: r.orderId,
            merchantId: r.merchantId,
            reviewId: r.id,
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${r.orderId}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined);
    }
    return { success: true };
  }

  async updateReviewStatus(
    id: string,
    dto: { status: string },
    operatorId?: string,
    ip?: string,
  ) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("评价不存在");
    await this.assertReviewRegionAccess(operatorId, r);
    const status = String(dto?.status || "")
      .trim()
      .toLowerCase();
    if (!["active", "hidden"].includes(status))
      throw new BadRequestException("评价状态不正确");
    await this.prisma.review.update({
      where: { id },
      data: { status },
    });
    await this.logOperation(
      operatorId || "",
      "update_status",
      "review",
      id,
      "review",
      { status },
      ip,
    );
    return { success: true };
  }

  // ==================== 促销管理 ====================
  async promotions(query: any) {
    const { status, type, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: {
          products: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.promotion.count({ where }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        rules: p.rules,
        isGlobal: p.isGlobal,
        startAt: p.startAt,
        endAt: p.endAt,
        status: p.status,
        productCount: p.products?.length || 0,
        products: p.products?.map((pp) => ({
          id: pp.product.id,
          name: pp.product.name,
        })),
        createdAt: p.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createPromotion(dto: any, operatorId?: string, ip?: string) {
    const promotion = await this.prisma.promotion.create({
      data: {
        name: dto.name,
        type: dto.type,
        rules: dto.rules,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        isGlobal: dto.isGlobal || false,
        status: dto.status || "active",
      },
    });
    if (dto.productIds?.length) {
      await this.prisma.promotionProduct.createMany({
        data: dto.productIds.map((pid: string) => ({
          promotionId: promotion.id,
          productId: pid,
        })),
      });
    }
    await this.logOperation(
      operatorId || "",
      "create",
      "promotion",
      promotion.id,
      "promotion",
      dto,
      ip,
    );
    return { success: true, id: promotion.id };
  }

  async updatePromotion(id: string, dto: any) {
    await this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        rules: dto.rules,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        isGlobal: dto.isGlobal,
        status: dto.status,
      },
    });
    if (dto.productIds) {
      await this.prisma.promotionProduct.deleteMany({
        where: { promotionId: id },
      });
      if (dto.productIds.length) {
        await this.prisma.promotionProduct.createMany({
          data: dto.productIds.map((pid: string) => ({
            promotionId: id,
            productId: pid,
          })),
        });
      }
    }
    return { success: true };
  }

  async promotionDetail(id: string) {
    const p = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        products: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException("促销活动不存在");
    return p;
  }

  // ==================== 运费模板 ====================
  async freightTemplates(query: any) {
    const { merchantId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    const [list, total] = await Promise.all([
      this.prisma.freightTemplate.findMany({
        where,
        include: { merchant: { select: { name: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.freightTemplate.count({ where }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        merchantId: t.merchantId,
        merchantName: t.merchant?.name,
        name: t.name,
        rules: t.rules,
        isDefault: t.isDefault,
        createdAt: t.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createFreightTemplate(dto: any) {
    return this.prisma.freightTemplate.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        rules: dto.rules,
        isDefault: dto.isDefault || false,
      },
    });
  }

  async updateFreightTemplate(id: string, dto: any) {
    return this.prisma.freightTemplate.update({
      where: { id },
      data: { name: dto.name, rules: dto.rules, isDefault: dto.isDefault },
    });
  }

  async deleteFreightTemplate(id: string) {
    const tpl = await this.prisma.freightTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException("运费模板不存在");
    await this.prisma.freightTemplate.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 订单/退款 ====================
  async orders(query: any, operatorId?: string) {
    const {
      status,
      orderNo,
      merchantId,
      regionId,
      keyword,
      payStatus,
      startAt,
      endAt,
      page = 1,
      pageSize = 20,
    } = query;

    const where: any = {};
    const AND: any[] = [];

    if (status) {
      const statuses = (status as string)
        .split(",")
        .map((s) => s.trim().toUpperCase());
      where.status = { in: statuses as any };
    }
    if (orderNo) where.orderNo = { contains: orderNo };
    if (merchantId) where.merchantId = merchantId;
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (regionId && !scope.isSuperAdmin) {
      await this.adminDataScope.assertRegionAccess(
        operatorId,
        String(regionId),
      );
    }
    const orderRegionIds = scope.isSuperAdmin
      ? regionId
        ? [String(regionId)]
        : []
      : regionId
        ? [String(regionId)]
        : scope.regionIds;
    if (orderRegionIds.length) {
      AND.push({ merchant: { regionId: { in: orderRegionIds } } });
    } else if (!scope.isSuperAdmin) {
      AND.push({ id: { in: [] } });
    }

    if (keyword) {
      const trimmed = keyword.trim();
      if (/^[a-f0-9-]{20,}$/.test(trimmed)) {
        AND.push({
          OR: [{ orderNo: { contains: trimmed } }, { id: trimmed }],
        });
      } else {
        AND.push({
          OR: [
            { orderNo: { contains: trimmed } },
            { user: { nickname: { contains: trimmed } } },
            { user: { phone: { contains: trimmed } } },
            { receiverName: { contains: trimmed } },
            { receiverPhone: { contains: trimmed } },
          ],
        });
      }
    }

    if (startAt || endAt) {
      const createdAt: any = {};
      if (startAt) createdAt.gte = new Date(startAt);
      if (endAt) createdAt.lte = new Date(endAt + "T23:59:59.999Z");
      AND.push({ createdAt });
    }

    // 支付状态过滤：通过 PaymentOrder 的 bizType+bizId 关联
    if (payStatus) {
      const paymentOrders = await this.prisma.paymentOrder.findMany({
        where: { bizType: "order", status: payStatus },
        select: { bizId: true },
      });
      const bizIds = paymentOrders.map((p) => p.bizId);
      if (bizIds.length === 0) {
        return { list: [], total: 0, page: +page, pageSize: +pageSize };
      }
      AND.push({ id: { in: bizIds } });
    }

    if (AND.length > 0) where.AND = AND;

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, phone: true, avatar: true },
          },
          merchant: {
            select: {
              id: true,
              name: true,
              regionId: true,
              region: { select: { name: true } },
            },
          },
          items: { take: 3 },
          orderLogs: { take: 5, orderBy: { createdAt: "desc" } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.order.count({ where }),
    ]);

    // 批量获取支付信息
    const orderIds = list.map((o) => o.id);
    const payments =
      orderIds.length > 0
        ? await this.prisma.paymentOrder.findMany({
            where: { bizType: "order", bizId: { in: orderIds } },
            select: { bizId: true, status: true, channel: true, payTime: true },
          })
        : [];
    const payMap = new Map(payments.map((p) => [p.bizId, p]));

    return {
      list: list.map((o) => {
        const pay = payMap.get(o.id);
        return {
          id: o.id,
          orderNo: o.orderNo,
          userId: o.userId,
          userNickname: o.user?.nickname || "",
          userPhone: o.user?.phone || "",
          userAvatar: o.user?.avatar || "",
          merchantId: o.merchantId,
          merchantName: o.merchant?.name || "",
          regionId: o.merchant?.regionId || "",
          regionName: o.merchant?.region?.name || "",
          productName: o.items?.[0]?.productName || "",
          productImage: o.items?.[0]?.productImage || "",
          skuName: o.items?.[0]?.skuSpecs
            ? String((o.items[0].skuSpecs as any).specs || "")
            : "",
          quantity:
            o.items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0,
          totalAmount: Number(o.totalAmount || 0),
          discountAmount: Number(o.discountAmount || 0),
          freightAmount: Number(o.freightAmount || 0),
          payAmount: Number(o.payAmount || 0),
          status: o.status?.toLowerCase(),
          refundStatus: o.refundStatus || "none",
          payStatus: pay?.status || "pending",
          payChannel: pay?.channel || "",
          payTime: pay?.payTime || null,
          receiverName: o.receiverName,
          receiverPhone: o.receiverPhone,
          receiverAddress: o.receiverAddress,
          trackingNo: o.trackingNo,
          trackingCompany: o.trackingCompany,
          remark: o.remark,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          logs: o.orderLogs?.map((l) => ({
            action: l.action,
            remark: l.remark,
            operatorType: l.operatorType,
            createdAt: l.createdAt,
          })),
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async orderDetail(id: string, operatorId?: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            avatar: true,
            openid: true,
            profile: { select: { realName: true, school: true } },
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            logo: true,
            regionId: true,
            region: { select: { id: true, name: true } },
          },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, images: true } },
            sku: { select: { id: true, specs: true, price: true } },
          },
        },
        orderLogs: { orderBy: { createdAt: "asc" } },
        refunds: true,
      },
    });
    if (!o) throw new NotFoundException("订单不存在");
    await this.assertOrderRegionAccess(operatorId, id, o.merchant?.regionId);

    // 通过 PaymentOrder 查询支付信息
    const payments = await this.prisma.paymentOrder.findMany({
      where: { bizType: "order", bizId: id },
      select: {
        id: true,
        paymentNo: true,
        channel: true,
        status: true,
        amount: true,
        wxTransId: true,
        payTime: true,
        createdAt: true,
        refundedAmount: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 构建操作日志
    const opLogs = [
      ...(o.orderLogs || []).map((l) => ({
        action: l.action,
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        remark: l.remark,
        operatorType: l.operatorType || "system",
        createdAt: l.createdAt,
      })),
    ];

    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status?.toLowerCase(),
      refundStatus: o.refundStatus || "none",
      remark: o.remark,
      cancelReason: o.cancelReason,
      totalAmount: Number(o.totalAmount || 0),
      discountAmount: Number(o.discountAmount || 0),
      freightAmount: Number(o.freightAmount || 0),
      payAmount: Number(o.payAmount || 0),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      payTime: o.payTime,
      deliverTime: o.deliverTime,
      receiveTime: o.receiveTime,
      completeTime: o.completeTime,
      cancelTime: o.cancelTime,
      user: {
        id: o.user?.id,
        nickname: o.user?.nickname || "",
        phone: o.user?.phone || "",
        avatar: o.user?.avatar || "",
        openid: o.user?.openid || "",
        realName: o.user?.profile?.realName || "",
        school: o.user?.profile?.school || "",
      },
      merchant: {
        id: o.merchant?.id,
        name: o.merchant?.name || "",
        phone: o.merchant?.phone || "",
        address: o.merchant?.address || "",
        logo: o.merchant?.logo || "",
        regionId: o.merchant?.region?.id || "",
        regionName: o.merchant?.region?.name || "",
      },
      receiver: {
        name: o.receiverName,
        phone: o.receiverPhone,
        address: o.receiverAddress,
      },
      tracking: {
        no: o.trackingNo || "",
        company: o.trackingCompany || "",
      },
      items: o.items?.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        productImage: i.productImage,
        skuSpecs: i.skuSpecs,
        price: Number(i.price || 0),
        quantity: i.quantity,
        totalPrice: Number(i.totalPrice || 0),
      })),
      refunds: o.refunds?.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        amount: Number(r.amount || 0),
        reason: r.reason,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        refundTime: r.refundTime,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentNo: p.paymentNo,
        channel: p.channel,
        status: p.status,
        amount: Number(p.amount || 0),
        wxTransId: p.wxTransId,
        payTime: p.payTime,
        createdAt: p.createdAt,
        refundedAmount: Number(p.refundedAmount || 0),
      })),
      logs: opLogs,
    };
  }

  async refunds(query: any, operatorId?: string) {
    const { status, keyword, page = 1, pageSize = 20 } = query;
    const scopedWhere: any = await this.paymentRefundRegionWhere(operatorId);
    const search = String(keyword || "").trim();
    const where: any = search
      ? Object.keys(scopedWhere).length
        ? {
            AND: [
              scopedWhere,
              {
                OR: [
                  { refundNo: { contains: search } },
                  { payment: { is: { orderNo: { contains: search } } } },
                ],
              },
            ],
          }
        : {
            OR: [
              { refundNo: { contains: search } },
              { payment: { is: { orderNo: { contains: search } } } },
            ],
          }
      : scopedWhere;
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.paymentRefund.findMany({
        where,
        include: {
          payment: {
            select: {
              paymentNo: true,
              orderNo: true,
              bizType: true,
              bizId: true,
              userId: true,
            },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.paymentRefund.count({ where }),
    ]);
    const shopOrderIds = list
      .filter(
        (refund) =>
          refund.payment?.bizType === "order" && refund.payment?.bizId,
      )
      .map((refund) => refund.payment!.bizId);
    const shopOrders = shopOrderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: shopOrderIds } },
          select: {
            id: true,
            orderNo: true,
            user: { select: { id: true, nickname: true, phone: true } },
            merchant: { select: { id: true, name: true } },
          },
        })
      : [];
    const shopOrderMap = new Map(shopOrders.map((order) => [order.id, order]));
    return {
      list: list.map((r) => ({
        shopOrder:
          r.payment?.bizType === "order"
            ? shopOrderMap.get(r.payment.bizId)
            : undefined,
        id: r.id,
        refundNo: r.refundNo,
        paymentNo: r.payment?.paymentNo,
        orderNo: r.payment?.orderNo,
        bizOrderNo: r.payment?.orderNo,
        bizType: r.payment?.bizType,
        bizId: r.payment?.bizId,
        userId: r.payment?.userId,
        userName:
          r.payment?.bizType === "order"
            ? shopOrderMap.get(r.payment.bizId)?.user?.nickname
            : r.payment?.userId,
        merchantId:
          r.payment?.bizType === "order"
            ? shopOrderMap.get(r.payment.bizId)?.merchant?.id
            : undefined,
        merchantName:
          r.payment?.bizType === "order"
            ? shopOrderMap.get(r.payment.bizId)?.merchant?.name
            : undefined,
        amount: Math.round(Number(r.amount) * 100),
        reason: r.reason,
        status: r.status,
        wxRefundId: r.wxRefundId,
        failReason: r.failReason,
        refundedAt: r.refundedAt,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async auditRefund(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundException("退款申请不存在");
    await this.assertPaymentRefundRegionAccess(operatorId, refund);
    if (!["approved", "rejected"].includes(dto.status))
      throw new BadRequestException("不支持的退款审核状态");
    if (refund.status !== "pending")
      throw new BadRequestException("只有待处理退款申请可以审核");

    if (dto.status === "approved" && this.paymentService) {
      // AUD-P1-063: 对已存在的 PaymentRefund 执行退款，不调用 paymentService.refund 创建新记录
      try {
        await this.paymentService.executeRefund(id, operatorId);
      } catch (e: any) {
        throw new BadRequestException(`退款失败: ${e.message}`);
      }
    } else if (dto.status === "rejected") {
      if (!this.paymentService) throw new BadRequestException("支付服务未就绪");
      await this.paymentService.rejectRefundById(id, dto.remark, operatorId);
    }

    await this.logOperation(
      operatorId || "",
      "audit_refund",
      "refund",
      id,
      "refund",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async refundsFinance(query: any, operatorId?: string) {
    const { startAt, endAt, page = 1, pageSize = 20 } = query;
    const where: any = {
      status: { in: ["success", "processing"] },
      ...(await this.paymentRefundRegionWhere(operatorId)),
    };
    if (startAt) where.createdAt = { gte: new Date(startAt) };
    if (endAt) where.createdAt = { ...where.createdAt, lt: new Date(endAt) };

    const [list, total, aggregate] = await Promise.all([
      this.prisma.paymentRefund.findMany({
        where,
        include: {
          payment: {
            select: {
              paymentNo: true,
              orderNo: true,
              bizType: true,
              userId: true,
            },
          },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.paymentRefund.count({ where }),
      this.prisma.paymentRefund.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      list: list.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        paymentNo: r.payment?.paymentNo,
        orderNo: r.payment?.orderNo,
        bizType: r.payment?.bizType,
        userId: r.payment?.userId,
        amount: Math.round(Number(r.amount) * 100),
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      totalAmount: Math.round(Number(aggregate._sum.amount || 0) * 100),
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ==================== 财务 ====================
  async withdraws(query: any, operatorId?: string) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status.toUpperCase();
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) {
      if (!scope.regionIds.length) where.id = { in: [] };
      else where.user = this.userRegionScopeWhere(scope.regionIds);
    }
    const [list, total] = await Promise.all([
      this.prisma.withdraw.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.withdraw.count({ where }),
    ]);
    return {
      list: list.map((w) => ({
        id: w.id,
        userId: w.userId,
        userNickname: w.user?.nickname,
        userType: "user",
        amount: Math.round(Number(w.amount) * 100),
        fee: 0,
        actualAmount: Math.round(Number(w.amount) * 100),
        accountType: w.channel?.toLowerCase() || "wechat",
        accountInfo: w.account,
        status: w.status?.toLowerCase(),
        createdAt: w.createdAt,
        realName: w.realName,
        transferNo: w.transferNo,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async withdrawDetail(id: string, operatorId?: string) {
    const w = await this.prisma.withdraw.findUnique({
      where: { id },
      include: { user: { select: { nickname: true, wallet: true } } },
    });
    if (!w) throw new NotFoundException("提现申请不存在");
    await this.assertUserRegionAccess(operatorId, w.userId);
    return {
      ...w,
      userNickname: w.user?.nickname,
      balance: Number(w.user?.wallet?.balance || 0),
    };
  }

  async auditWithdraw(
    id: string,
    dto: { status: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const w = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("提现申请不存在");
    await this.assertUserRegionAccess(operatorId, w.userId);
    if (w.status !== "PENDING")
      throw new BadRequestException("该提现申请已处理");

    if (dto.status === "approved") {
      // 审核通过 → 转为处理中（不退回冻结金额）
      const transition = await this.prisma.withdraw.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "PROCESSING", processedAt: new Date() },
      });
      if (transition.count !== 1)
        throw new BadRequestException("提现状态已变更，请刷新后重试");
    } else {
      // 审核拒绝 → 在事务中拒绝并退回冻结金额
      await this.prisma.$transaction(async (tx) => {
        const transition = await tx.withdraw.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: "REJECTED",
            failReason: dto.remark,
            processedAt: new Date(),
          },
        });
        if (transition.count !== 1)
          throw new BadRequestException("提现状态已变更，请刷新后重试");
        const wallet = await tx.wallet.update({
          where: { userId: w.userId },
          data: {
            balance: { increment: w.amount },
            freeze: { decrement: w.amount },
          },
        });
        // 记录退回流水
        await tx.walletTransaction.create({
          data: {
            userId: w.userId,
            type: "WITHDRAW",
            amount: w.amount,
            balance: wallet.balance,
            channel: w.channel,
            orderNo: `WD_RETURN_${w.id}`,
            description: `提现被拒退回: ${dto.remark || ""}`,
            status: "SUCCESS",
          },
        });
      });
    }

    await this.logOperation(
      operatorId || "",
      "audit_withdraw",
      "finance",
      id,
      "withdraw",
      { status: dto.status, remark: dto.remark },
      ip,
    );
    return { success: true };
  }

  async completeWithdraw(
    id: string,
    dto: { transferNo?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const transferNo = String(dto.transferNo || "").trim();
    if (!transferNo) throw new BadRequestException("请填写打款流水号");
    const w = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("提现申请不存在");
    await this.assertUserRegionAccess(operatorId, w.userId);
    if (w.status !== "PROCESSING")
      throw new BadRequestException("该提现申请不在处理中状态");

    await this.prisma.$transaction(async (tx) => {
      const transition = await tx.withdraw.updateMany({
        where: { id, status: "PROCESSING" },
        data: {
          status: "SUCCESS",
          transferNo,
          processedAt: new Date(),
        },
      });
      if (transition.count !== 1)
        throw new BadRequestException("提现状态已变更，请刷新后重试");
      const wallet = await tx.wallet.update({
        where: { userId: w.userId },
        data: {
          freeze: { decrement: w.amount },
          totalOut: { increment: w.amount },
        },
      });
      await tx.walletTransaction.create({
        data: {
          userId: w.userId,
          type: "WITHDRAW",
          amount: w.amount,
          balance: wallet.balance,
          channel: w.channel,
          orderNo: w.id,
          description: `提现打款完成: ${transferNo}`,
          status: "SUCCESS",
        },
      });
    });

    await this.logOperation(
      operatorId || "",
      "complete_withdraw",
      "finance",
      id,
      "withdraw",
      { transferNo },
      ip,
    );
    return { success: true };
  }

  async payments(query: any) {
    const { page = 1, pageSize = 20, status } = query;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where: { ...where, status: "paid" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { payTime: "desc" },
      }),
      this.prisma.paymentOrder.count({ where: { ...where, status: "paid" } }),
    ]);
    return {
      list: list.map((p) => ({
        id: p.id,
        paymentNo: p.paymentNo,
        bizType: p.bizType,
        bizId: p.bizId,
        orderNo: p.orderNo,
        userId: p.userId,
        amount: Math.round(Number(p.amount) * 100),
        payMethod: p.channel,
        payStatus: "paid",
        payTime: p.payTime,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async transactions(query: any, operatorId?: string) {
    const { type, userId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (type) where.type = type;
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (userId) {
      const normalizedUserId = String(userId);
      await this.assertUserRegionAccess(operatorId, normalizedUserId);
      where.userId = normalizedUserId;
    } else if (!scope.isSuperAdmin) {
      if (!scope.regionIds.length) where.id = { in: [] };
      else where.user = this.userRegionScopeWhere(scope.regionIds);
    }
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        userId: t.userId,
        userNickname: t.user?.nickname,
        type: t.type,
        amount: Number(t.amount),
        balance: Number(t.balance),
        channel: t.channel,
        orderNo: t.orderNo,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async merchantSettlements(query: any, operatorId?: string) {
    const { merchantName, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (status) where.status = status;
    if (!scope.isSuperAdmin) {
      where.merchant = { regionId: { in: scope.regionIds } };
    }
    if (merchantName) {
      where.merchant = { ...where.merchant, name: { contains: merchantName } };
    }
    const [list, total] = await Promise.all([
      this.prisma.merchantSettlement.findMany({
        where,
        include: { merchant: { select: { name: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.merchantSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        merchantName: s.merchant?.name,
        period: s.startAt
          ? `${s.startAt.toISOString().slice(0, 10)} ~ ${s.endAt.toISOString().slice(0, 10)}`
          : "",
        orderCount: s.orderCount,
        totalAmount: Math.round(Number(s.amount) * 100),
        fee: Math.round(Number(s.platformFee) * 100),
        netAmount: Math.round((Number(s.amount) - Number(s.platformFee)) * 100),
        status: s.status,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async generateMerchantSettlement(
    dto: {
      merchantName?: string;
      merchantId?: string;
      period?: string;
      startAt?: string;
      endAt?: string;
      remark?: string;
    },
    operatorId?: string,
    ip?: string,
  ) {
    let merchantId = dto.merchantId;
    if (!merchantId && dto.merchantName) {
      const merchant = await this.prisma.merchant.findFirst({
        where: { name: dto.merchantName },
        select: { id: true },
      });
      if (!merchant) throw new NotFoundException("商家不存在");
      merchantId = merchant.id;
    }
    if (!merchantId) throw new BadRequestException("商家ID或名称必填");

    let startAt: Date, endAt: Date;
    if (dto.period) {
      const [y, m] = dto.period.split("-").map(Number);
      startAt = new Date(y, m - 1, 1);
      endAt = new Date(y, m, 0, 23, 59, 59);
    } else if (dto.startAt && dto.endAt) {
      startAt = new Date(dto.startAt);
      endAt = new Date(dto.endAt);
    } else {
      throw new BadRequestException("结算周期或起止日期必填");
    }

    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      startAt > endAt
    ) {
      throw new BadRequestException("结算周期不合法");
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { region: { select: { commissionRate: true } } },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    await this.assertMerchantSettlementRegionAccess(operatorId, merchant);

    const settlementLockKey = `merchant:settlement:${merchantId}`;
    if (!(await this.redis.getLock(settlementLockKey, 60))) {
      throw new ConflictException("该商家结算正在生成，请稍后重试");
    }
    try {
      const existing = await this.prisma.merchantSettlement.findFirst({
        // A settlement owns every completed order whose completeTime is in this window.
        // Allowing an overlapping window would pay those orders twice.
        where: {
          merchantId,
          startAt: { lte: endAt },
          endAt: { gte: startAt },
          OR: [
            { periodKey: null },
            { periodKey: { not: { startsWith: "refund-adjustment:" } } },
          ],
        },
        select: { settlementNo: true },
      });
      if (existing) {
        throw new ConflictException(
          `结算周期与已有结算单重叠：${existing.settlementNo}`,
        );
      }

      const completedOrders = await this.prisma.order.findMany({
        where: {
          merchantId,
          status: "COMPLETED",
          refundStatus: { notIn: ["refunding", "refunded"] },
          completeTime: { gte: startAt, lte: endAt },
        },
        select: {
          totalAmount: true,
          originalFreightAmount: true,
          refundAmount: true,
          refundStatus: true,
        },
      });
      const amount = completedOrders.reduce((sum, order) => {
        const goodsAmount = Math.max(
          0,
          Number(order.totalAmount || 0) -
            Number(order.originalFreightAmount || 0),
        );
        const refundedGoodsAmount =
          order.refundStatus === "partial"
            ? Math.min(
                goodsAmount,
                Math.max(0, Number(order.refundAmount || 0)),
              )
            : 0;
        return sum + goodsAmount - refundedGoodsAmount;
      }, 0);
      const commissionRate = Number(merchant.region?.commissionRate || 0);
      const platformFee = Math.round(amount * commissionRate * 100) / 100;
      const settlementNo = `MST${Date.now()}`;
      try {
        await this.prisma.merchantSettlement.create({
          data: {
            merchantId,
            settlementNo,
            amount,
            platformFee,
            startAt,
            endAt,
            orderCount: completedOrders.length,
            status: "pending",
            remark: dto.remark,
            periodKey: `${merchantId}:${startAt.toISOString()}:${endAt.toISOString()}`,
          },
        });
      } catch (error: any) {
        if (error?.code === "P2002")
          throw new ConflictException("该结算周期已生成，请刷新后查看");
        throw error;
      }
      await this.logOperation(
        operatorId || "",
        "generate_settlement",
        "merchant",
        merchantId,
        "settlement",
        dto,
        ip,
      );
      return { success: true, settlementNo };
    } finally {
      await this.redis.releaseLock(settlementLockKey).catch(() => undefined);
    }
  }

  // ==================== 对账 ====================
  async reconciliations(query: any) {
    const { status, type, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.reconciliation.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.reconciliation.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        reconciliationNo: r.reconciliationNo,
        type: r.type,
        startAt: r.startAt,
        endAt: r.endAt,
        totalAmount: Math.round(Number(r.totalAmount) * 100),
        platformFee: Math.round(Number(r.platformFee) * 100),
        netAmount: Math.round(Number(r.netAmount) * 100),
        orderCount: r.orderCount,
        status: r.status,
        remark: r.remark,
        createdAt: r.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createReconciliation(dto: any, operatorId?: string, ip?: string) {
    const reconNo = `REC${Date.now()}`;
    const recon = await this.prisma.reconciliation.create({
      data: {
        reconciliationNo: reconNo,
        type: dto.type,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        totalAmount: dto.totalAmount || 0,
        platformFee: dto.platformFee || 0,
        netAmount: (dto.totalAmount || 0) - (dto.platformFee || 0),
        orderCount: dto.orderCount || 0,
        status: "pending",
        detail: dto.detail,
        remark: dto.remark,
      },
    });
    await this.logOperation(
      operatorId || "",
      "create",
      "reconciliation",
      recon.id,
      "reconciliation",
      dto,
      ip,
    );
    return { success: true, reconciliationNo: reconNo, id: recon.id };
  }

  // ==================== 运营 ====================
  async notifications(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (query.userId) where.userId = String(query.userId);
    if (query.regionId) where.regionId = String(query.regionId);
    if (query.type) where.type = String(query.type).toUpperCase();
    if (query.readStatus === "read") where.isRead = true;
    if (query.readStatus === "unread") where.isRead = false;
    if (query.hiddenStatus === "hidden") where.hiddenAt = { not: null };
    if (query.hiddenStatus === "visible") where.hiddenAt = null;
    if (query.deliveryStatus)
      where.deliveryStatus = String(query.deliveryStatus);
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async notificationStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [total, todayCount, unread, hidden, partial, pending, exhausted] =
      await Promise.all([
        this.prisma.notification.count(),
        this.prisma.notification.count({
          where: { createdAt: { gte: today } },
        }),
        this.prisma.notification.count({
          where: { isRead: false, hiddenAt: null },
        }),
        this.prisma.notification.count({ where: { hiddenAt: { not: null } } }),
        this.prisma.notification.count({
          where: { deliveryStatus: "partial" },
        }),
        this.prisma.notification.count({
          where: { deliveryStatus: "pending" },
        }),
        this.prisma.notification.count({
          where: { deliveryStatus: "partial", deliveryAttempts: { gte: 3 } },
        }),
      ]);
    return {
      total,
      today: todayCount,
      unread,
      hidden,
      partial,
      pending,
      exhausted,
    };
  }

  // ==================== 消息 ====================
  async conversationDetail(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
  }

  async violations(_query: any) {
    const reports = await this.prisma.report.findMany({
      where: { targetType: "message", status: "pending" },
      include: { reporter: { select: { id: true, nickname: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    return {
      list: reports.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterName: r.reporter?.nickname,
        targetId: r.targetId,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total: reports.length,
    };
  }

  async unreadStats() {
    const official = await this.prisma.user.findUnique({
      where: { openid: "lingmeng_official_message_account" },
      select: { id: true },
    });

    if (!official) {
      return {
        privateUnread: 0,
        groupUnread: 0,
        systemUnread: 0,
        officialUnreadConversations: 0,
        officialUnreadMessages: 0,
        totalUnread: 0,
      };
    }

    const [officialUnreadConversations, officialUnreadMessages] =
      await Promise.all([
        this.prisma.conversationMember.count({
          where: {
            userId: official.id,
            unreadCount: { gt: 0 },
            conversation: { type: "private" },
          },
        }),
        this.prisma.conversationMember.aggregate({
          where: {
            userId: official.id,
            unreadCount: { gt: 0 },
            conversation: { type: "private" },
          },
          _sum: { unreadCount: true },
        }),
      ]);

    const unreadMessageCount = officialUnreadMessages._sum.unreadCount || 0;

    return {
      privateUnread: officialUnreadConversations,
      groupUnread: 0,
      systemUnread: 0,
      officialUnreadConversations,
      officialUnreadMessages: unreadMessageCount,
      totalUnread: unreadMessageCount,
    };
  }

  // ==================== 系统：管理员管理 ====================
  async admins(query: any) {
    const { keyword, regionId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    const normalizedKeyword = String(keyword || "").trim();
    if (normalizedKeyword) {
      where.OR = [
        { username: { contains: normalizedKeyword } },
        { realName: { contains: normalizedKeyword } },
        { phone: { contains: normalizedKeyword } },
        { email: { contains: normalizedKeyword } },
      ];
    }
    if (regionId) {
      where.roles = { some: { regionId: String(regionId) } };
    }
    const [list, total] = await Promise.all([
      this.prisma.adminAccount.findMany({
        where,
        include: { roles: { include: { role: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminAccount.count({ where }),
    ]);
    const regionIds = [
      ...new Set(
        list.flatMap(
          (account) =>
            account.roles
              .map((item) => item.regionId)
              .filter(Boolean) as string[],
        ),
      ),
    ];
    const regions = regionIds.length
      ? await this.prisma.region.findMany({
          where: { id: { in: regionIds } },
          select: { id: true, name: true },
        })
      : [];
    const regionMap = new Map(
      regions.map((region) => [region.id, region.name]),
    );
    const accountIds = list.map((account) => account.id);
    const operationLogs = accountIds.length
      ? await this.prisma.adminOperationLog
          .findMany({
            where: { accountId: { in: accountIds } },
            orderBy: { createdAt: "desc" },
            take: Math.max(accountIds.length * 5, 5),
            select: {
              id: true,
              accountId: true,
              action: true,
              module: true,
              targetType: true,
              targetId: true,
              detail: true,
              ip: true,
              createdAt: true,
            },
          })
          .catch(() => [])
      : [];
    const operationLogMap = new Map<string, any[]>();
    for (const log of operationLogs) {
      const group = operationLogMap.get(log.accountId) || [];
      if (group.length < 5) group.push(log);
      operationLogMap.set(log.accountId, group);
    }
    return {
      list: list.map((a) => {
        const firstRegionId =
          a.roles.find((item) => item.regionId)?.regionId || "";
        const roleItems = a.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name,
          code: r.role.code,
          regionId: r.regionId || "",
          regionName: r.regionId ? regionMap.get(r.regionId) || "" : "",
        }));
        return {
          id: a.id,
          username: a.username,
          realName: a.realName,
          avatar: a.avatar,
          phone: a.phone,
          email: a.email,
          roles: roleItems,
          roleName: roleItems.map((r) => r.name).join("、"),
          regionId: firstRegionId,
          regionName: firstRegionId ? regionMap.get(firstRegionId) || "" : "",
          scope: firstRegionId
            ? regionMap.get(firstRegionId) || firstRegionId
            : "全部数据",
          dataScope: firstRegionId
            ? regionMap.get(firstRegionId) || firstRegionId
            : "全部数据",
          status: a.status === "active" ? 1 : 0,
          isLocked: !!(a.lockedUntil && new Date(a.lockedUntil) > new Date()),
          lockedUntil: a.lockedUntil,
          loginFailCount: a.loginFailCount,
          passwordResetRequired: a.passwordResetRequired,
          passwordChangedAt: a.passwordChangedAt,
          lastLoginAt: a.lastLoginAt,
          lastLoginIp: a.lastLoginIp,
          operationLogs: operationLogMap.get(a.id) || [],
          createdAt: a.createdAt,
        };
      }),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createAdmin(dto: any, operatorId?: string, ip?: string) {
    const existing = await this.prisma.adminAccount.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException("用户名已存在");

    if (
      !dto.password ||
      typeof dto.password !== "string" ||
      dto.password.length < 8
    ) {
      throw new BadRequestException("密码长度至少 8 位");
    }
    const hash = await bcrypt.hash(dto.password, 10);
    const account = await this.prisma.adminAccount.create({
      data: {
        username: dto.username,
        passwordHash: hash,
        realName: dto.realName || dto.username,
        phone: dto.phone,
        email: dto.email,
        avatar: dto.avatar,
        status: "active",
      },
    });

    // 支持多角色分配（roles为角色ID数组，优先于roleCode）
    const roleIds =
      dto.roles && Array.isArray(dto.roles) && dto.roles.length > 0
        ? dto.roles
        : [dto.roleCode || "admin"];
    let linkedRegionManager = false;
    for (const roleRef of roleIds) {
      const role =
        typeof roleRef === "string" && roleRef.length > 10
          ? await this.prisma.adminRole.findUnique({ where: { id: roleRef } })
          : await this.prisma.adminRole.findFirst({
              where: {
                OR: [{ code: roleRef }, { id: roleRef }, { name: roleRef }],
              },
            });
      const resolvedRole =
        role ||
        (this.isRegionManagerRoleRef(roleRef)
          ? await this.ensureRegionManagerRole()
          : null);
      if (resolvedRole) {
        if (
          this.isRegionManagerRoleRef(roleRef) ||
          this.isRegionManagerRoleRef(resolvedRole.code) ||
          this.isRegionManagerRoleRef(resolvedRole.name)
        ) {
          linkedRegionManager = true;
        }
        await this.prisma.adminAccountRole.create({
          data: {
            accountId: account.id,
            roleId: resolvedRole.id,
            regionId: dto.regionId || null,
          },
        });
      }
    }
    if (dto.regionId && linkedRegionManager) {
      await this.prisma.region.update({
        where: { id: dto.regionId },
        data: {
          managerAccountId: account.id,
          managerName: dto.realName || dto.username,
          managerPhone: dto.phone || null,
        },
      });
    }

    await this.logOperation(
      operatorId || "",
      "create_admin",
      "admin",
      account.id,
      "admin_account",
      { username: dto.username, roleCode: dto.roleCode || "admin" },
      ip,
    );
    return { success: true, id: account.id };
  }

  async updateAdmin(id: string, dto: any, operatorId?: string, ip?: string) {
    const data: any = {};
    if (dto.realName) data.realName = dto.realName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.status)
      data.status =
        dto.status === 1 || dto.status === "active" ? "active" : "disabled";
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.adminAccount.update({ where: { id }, data });
    await this.logOperation(
      operatorId || "",
      "update_admin",
      "admin",
      id,
      "admin_account",
      dto,
      ip,
    );

    if (dto.roleIds) {
      await this.prisma.adminAccountRole.deleteMany({
        where: { accountId: id },
      });
      await this.prisma.adminAccountRole.createMany({
        data: dto.roleIds.map((rid: string) => ({
          accountId: id,
          roleId: rid,
          regionId: dto.regionId || null,
        })),
      });
    } else if (dto.regionId !== undefined) {
      await this.prisma.adminAccountRole.updateMany({
        where: { accountId: id },
        data: { regionId: dto.regionId || null },
      });
    }
    return { success: true };
  }

  async deleteAdmin(id: string, operatorId?: string, ip?: string) {
    await this.prisma.adminAccount.update({
      where: { id },
      data: { status: "deleted" },
    });
    await this.logOperation(
      operatorId || "",
      "delete_admin",
      "admin",
      id,
      "admin_account",
      null,
      ip,
    );
    return { success: true };
  }

  async adminRoles() {
    const list = await this.prisma.adminRole.findMany({
      include: {
        permissions: { include: { permission: true } },
        menus: { include: { menu: true } },
      },
    });
    return {
      list: list.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        description: r.description,
        isSystem: r.isSystem,
        sortOrder: r.sortOrder,
        permissions: r.permissions.map((p) => ({
          id: p.permission.id,
          code: p.permission.code,
          name: p.permission.name,
        })),
        menus: r.menus.map((m) => ({
          id: m.menu.id,
          name: m.menu.name,
          path: m.menu.path,
        })),
      })),
    };
  }

  async adminPermissions() {
    const list = await this.prisma.adminPermission.findMany({
      orderBy: { module: "asc" },
    });
    return { list };
  }

  async menuTree() {
    const menus = await this.prisma.adminMenu.findMany({
      orderBy: { sortOrder: "asc" },
      include: { children: { orderBy: { sortOrder: "asc" } } },
      where: { parentId: null },
    });
    return menus;
  }

  private classifyOperationRisk(log: any) {
    const action = String(log?.action || "").toLowerCase();
    const module = String(log?.module || "").toLowerCase();
    const detail =
      log?.detail && typeof log.detail === "object" ? log.detail : {};
    const criticalActions = [
      "delete",
      "soft_delete",
      "dissolve",
      "force_password_reset",
      "refund",
      "withdraw",
      "pay",
      "transfer",
    ];
    const highActions = [
      "ban",
      "unban",
      "disable",
      "close",
      "audit",
      "reject",
      "review",
      "batch",
      "update_status",
      "status",
    ];
    const sensitiveModules = [
      "region",
      "finance",
      "withdraw",
      "refund",
      "admin",
      "permission",
      "role",
      "circle",
      "payment",
    ];

    if (detail?.riskLevel) {
      return {
        riskLevel: detail.riskLevel,
        riskReason: detail.riskReason || "业务标记为高风险",
      };
    }
    if (criticalActions.some((item) => action.includes(item))) {
      return {
        riskLevel: "critical",
        riskReason: "删除、退款、提现、强制重置或解散类操作",
      };
    }
    if (
      highActions.some((item) => action.includes(item)) ||
      sensitiveModules.some((item) => module.includes(item))
    ) {
      return { riskLevel: "high", riskReason: "敏感模块或状态变更操作" };
    }
    return { riskLevel: "low", riskReason: "普通后台操作" };
  }

  private getOperationRegionId(log: any) {
    const detail =
      log?.detail && typeof log.detail === "object" ? log.detail : {};
    if (detail.regionId) return String(detail.regionId);
    if (detail.region?.id) return String(detail.region.id);
    if (log?.targetType === "region" && log?.targetId)
      return String(log.targetId);
    return null;
  }

  private getAdminRoleLabel(roles: any[] = []) {
    const normalizedRoles = Array.isArray(roles) ? roles : [];
    if (
      normalizedRoles.some((item) =>
        ["super_admin", "SUPER_ADMIN"].includes(item?.role?.code || item?.code),
      )
    ) {
      return "超级管理员";
    }
    const names = normalizedRoles
      .map((item) => item?.role?.name || item?.name)
      .filter(Boolean);
    return names.length ? Array.from(new Set(names)).join("、") : "后台管理员";
  }

  private async enrichOperationLogs(logs: any[]) {
    const ids = logs.map((item) => item.id).filter(Boolean);
    const alerts = ids.length
      ? await this.prisma.systemAlert.findMany({
          where: { type: "operation", businessId: { in: ids } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            businessId: true,
            level: true,
            status: true,
            title: true,
            message: true,
            createdAt: true,
          },
        })
      : [];
    const alertMap = new Map(alerts.map((alert) => [alert.businessId, alert]));
    return logs.map((l) => {
      const fallbackRisk = this.classifyOperationRisk(l);
      const alert = alertMap.get(l.id);
      const roleLabel = this.getAdminRoleLabel(l.account?.roles || []);
      const operatorAccount = l.account?.username || "";
      return {
        id: l.id,
        accountId: l.accountId,
        adminName: roleLabel,
        username: l.account?.realName || l.account?.username,
        operatorDisplayName: roleLabel,
        operatorAccount,
        operatorRealName: l.account?.realName || "",
        operatorRoleLabel: roleLabel,
        action: l.action,
        module: l.module,
        targetId: l.targetId,
        targetType: l.targetType,
        detail: l.detail,
        ip: l.ip,
        regionId: this.getOperationRegionId(l),
        riskLevel: alert?.level || fallbackRisk.riskLevel,
        riskReason: alert?.message || fallbackRisk.riskReason,
        alertId: alert?.id || null,
        alertStatus: alert?.status || null,
        alertTitle: alert?.title || null,
        createdAt: l.createdAt,
      };
    });
  }

  async auditLogs(query: any, operatorId?: string) {
    const {
      page = 1,
      pageSize = 20,
      accountId,
      module,
      action,
      keyword,
      startDate,
      endDate,
      startTime,
      endTime,
      regionId,
      riskLevel,
      alertStatus,
    } = query;
    const pageNum = +page || 1;
    const take = +pageSize || 20;
    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (module) where.module = module;
    if (action) {
      const actionText = String(action);
      where.action = {
        in: Array.from(
          new Set([
            actionText,
            actionText.toLowerCase(),
            actionText.toUpperCase(),
          ]),
        ),
      };
    }
    if (keyword) {
      where.OR = [
        { action: { contains: keyword } },
        { module: { contains: keyword } },
        { targetId: { contains: keyword } },
        { targetType: { contains: keyword } },
      ];
    }
    const from = startDate || startTime;
    const to = endDate || endTime;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const scope = await this.adminDataScope.getAdminContext(operatorId);
    const requestedRegionId = regionId ? String(regionId) : "";
    if (requestedRegionId) {
      await this.adminDataScope.assertRegionAccess(
        operatorId,
        requestedRegionId,
      );
    }
    const needsPostFilter = Boolean(
      riskLevel || alertStatus || requestedRegionId || !scope.isSuperAdmin,
    );
    const queryTake = needsPostFilter
      ? Math.min(Math.max(pageNum * take * 4, 500), 3000)
      : take;
    const querySkip = needsPostFilter ? 0 : (pageNum - 1) * take;

    const [rawList, rawTotal] = await Promise.all([
      this.prisma.adminOperationLog.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              username: true,
              realName: true,
              roles: { include: { role: true } },
            },
          },
        },
        skip: querySkip,
        take: queryTake,
        orderBy: { createdAt: "desc" },
      }),
      needsPostFilter
        ? Promise.resolve(0)
        : this.prisma.adminOperationLog.count({ where }),
    ]);
    const enriched = await this.enrichOperationLogs(rawList);
    const visible = needsPostFilter
      ? enriched.filter((item) => {
          if (requestedRegionId && item.regionId !== requestedRegionId)
            return false;
          if (!scope.isSuperAdmin) {
            const ownLog = item.accountId === operatorId;
            const scopedLog =
              item.regionId && scope.regionIds.includes(item.regionId);
            if (!ownLog && !scopedLog) return false;
          }
          if (riskLevel && item.riskLevel !== riskLevel) return false;
          if (alertStatus && item.alertStatus !== alertStatus) return false;
          return true;
        })
      : enriched;
    const paged = needsPostFilter
      ? visible.slice((pageNum - 1) * take, pageNum * take)
      : visible;
    return {
      list: paged,
      total: needsPostFilter ? visible.length : rawTotal,
      page: pageNum,
      pageSize: take,
    };
  }

  async loginLogs(query: any, operatorId?: string) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      success,
      startDate,
      endDate,
      startTime,
      endTime,
    } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) where.accountId = operatorId || "__forbidden__";
    if (keyword) {
      where.OR = [
        { account: { username: { contains: keyword } } },
        { ip: { contains: keyword } },
      ];
    }
    if (success !== undefined && success !== "") {
      where.success = success === true || success === "true" || success === "1";
    }
    const from = startDate || startTime;
    const to = endDate || endTime;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [list, total] = await Promise.all([
      this.prisma.adminLoginLog.findMany({
        where,
        include: {
          account: { select: { id: true, username: true, realName: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminLoginLog.count({ where }),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        adminName: l.account?.realName || l.account?.username,
        success: l.success,
        failReason: l.failReason,
        ip: l.ip,
        userAgent: l.ua,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async legacyAuditLogs(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: { user: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count(),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        userId: l.userId,
        username: l.user?.nickname,
        module: l.module,
        action: l.action,
        targetId: l.targetId,
        detail: l.detail,
        ip: l.ip,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getConfig(key: string) {
    const c = await this.prisma.config.findUnique({ where: { key } });
    return c?.value || {};
  }

  async setConfig(key: string, value: any, operatorId?: string, ip?: string) {
    await this.prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    // AUD-P1-169: 微信配置变更后清理缓存的 access_token，防止旧 AppID/Secret 继续使用
    if (key.startsWith("wechat")) {
      await this.redis.del("wx:miniapp:access_token").catch(() => undefined);
      await this.redis.del("wx:access_token").catch(() => undefined);
    }
    await this.logOperation(
      operatorId || "",
      "update_config",
      "config",
      key,
      "config",
      { key },
      ip,
    );
    return { success: true };
  }

  async testStorageConfig(dto: any) {
    const saved = (await this.getConfig("storage")) as Record<string, any>;
    const config = { ...(saved || {}), ...(dto || {}) };
    const provider = String(config.provider || saved?.provider || "cos");
    const providerConfig = {
      ...((saved || {})[provider] || {}),
      ...((dto || {})[provider] || {}),
      ...(dto || {}),
    };
    const secretId = String(
      providerConfig.secretId ||
        providerConfig.accessKey ||
        config.secretId ||
        config.accessKey ||
        config.COS_SECRET_ID ||
        "",
    ).trim();
    const secretKey = String(
      providerConfig.secretKey ||
        config.secretKey ||
        config.COS_SECRET_KEY ||
        "",
    ).trim();
    const bucket = String(
      providerConfig.bucket || config.bucket || config.COS_BUCKET || "",
    ).trim();
    const regionRaw = String(
      providerConfig.region || config.region || config.COS_REGION || "",
    ).trim();
    const region =
      regionRaw.match(/cos\.([a-z0-9-]+)\.myqcloud\.com/i)?.[1] || regionRaw;

    const missing: string[] = [];
    if (!secretId) missing.push("SecretId");
    if (!secretKey) missing.push("SecretKey");
    if (!bucket) missing.push("存储桶 Bucket");
    if (!region) missing.push("所属地域 Region");
    if (missing.length) {
      throw new BadRequestException(
        `COS 配置不完整，缺少：${missing.join("、")}`,
      );
    }
    if (/^https?:\/\//i.test(region) || region.includes(".myqcloud.com")) {
      throw new BadRequestException(
        "所属城市/地域填写错误：这里请选择 ap-chongqing 这类地域代码，不要填写 COS 访问域名",
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const COS = require("cos-nodejs-sdk-v5");
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      await new Promise((resolve, reject) => {
        cos.headBucket(
          { Bucket: bucket, Region: region },
          (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          },
        );
      });
      return { success: true, message: "腾讯云 COS 连接成功，存储桶可访问" };
    } catch (err: any) {
      const code = err?.code || err?.name || "";
      const message = err?.message || err?.error || "未知错误";
      const hints: Record<string, string> = {
        NoSuchBucket: "存储桶不存在或 Bucket 名称填写错误",
        AccessDenied:
          "SecretId/SecretKey 权限不足，请确认 CAM 授权包含 COS 访问权限",
        InvalidAccessKeyId: "SecretId 错误或密钥已被禁用",
        SignatureDoesNotMatch: "SecretKey 错误，签名校验失败",
        InvalidRegion: "所属地域 Region 填写错误",
      };
      throw new BadRequestException(
        `COS 测试失败：${hints[code] || message}${code ? `（${code}）` : ""}`,
      );
    }
  }

  // ==================== 城市代理管理 ====================
  async cityAgentApplications(query: any) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentApplication.findMany({
        where,
        include: {
          user: { select: { nickname: true, phone: true } },
          region: { select: { name: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentApplication.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async auditCityAgentApplication(
    id: string,
    dto: { status: string; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const app = await this.prisma.cityAgentApplication.findUnique({
      where: { id },
    });
    if (!app) throw new NotFoundException("申请不存在");

    const newStatus = dto.status === "approved" ? "approved" : "rejected";
    await this.prisma.cityAgentApplication.update({
      where: { id },
      data: {
        status: newStatus,
        rejectReason: dto.reason,
        approvedAt: newStatus === "approved" ? new Date() : null,
      },
    });

    if (newStatus === "approved") {
      const region = await this.prisma.region.findUnique({
        where: { id: app.regionId },
        select: { managerUserId: true },
      });
      const existing = await this.prisma.cityAgent.findUnique({
        where: { userId: app.userId },
      });
      if (!existing) {
        await this.prisma.cityAgent.create({
          data: {
            userId: app.userId,
            regionId: app.regionId,
            realName: app.realName,
            phone: app.phone,
            status: "active",
          },
        });
      }
      await this.prisma.region.update({
        where: { id: app.regionId },
        data: {
          managerUserId: app.userId,
          managerName: app.realName,
          managerPhone: app.phone,
        },
      });
      await this.syncRegionManagerUserRole(
        app.regionId,
        app.userId,
        region?.managerUserId,
      );
    }

    await this.logOperation(
      operatorId || "",
      "audit_city_agent",
      "city_agent",
      id,
      "city_agent_application",
      { status: dto.status, reason: dto.reason },
      ip,
    );
    return { success: true };
  }

  async cityAgents(query: any) {
    const { status, regionId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    const [list, total] = await Promise.all([
      this.prisma.cityAgent.findMany({
        where,
        include: {
          user: { select: { nickname: true } },
          region: { select: { name: true } },
          settlements: { take: 5, orderBy: { createdAt: "desc" } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgent.count({ where }),
    ]);
    return {
      list: list.map((a) => ({
        id: a.id,
        userId: a.userId,
        userNickname: a.user?.nickname,
        regionId: a.regionId,
        regionName: a.region?.name,
        realName: a.realName,
        phone: a.phone,
        commissionRate: Number(a.commissionRate),
        totalCommission: Number(a.totalCommission),
        settledAmount: Number(a.settledAmount),
        pendingAmount: Number(a.pendingAmount),
        status: a.status,
        createdAt: a.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async cityAgentDetail(id: string) {
    const a = await this.prisma.cityAgent.findUnique({
      where: { id },
      include: {
        user: { select: { nickname: true } },
        region: { select: { name: true } },
        settlements: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!a) throw new NotFoundException("代理不存在");
    return a;
  }

  async getCityAgentSettlements(query: any) {
    const { agentId, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentSettlement.findMany({
        where,
        include: { agent: { select: { realName: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        agentName: s.agent?.realName,
        settlementMonth: s.startAt ? s.startAt.toISOString().slice(0, 7) : "",
        amount: Number(s.amount),
        status: s.status,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createCityAgentSettlement(
    dto: {
      agentId?: string;
      agentName?: string;
      amount: number;
      startAt?: string;
      endAt?: string;
      settlementMonth?: string;
      remark?: string;
    },
    operatorId?: string,
    ip?: string,
  ) {
    let agentId = dto.agentId;
    if (!agentId && dto.agentName) {
      const agent = await this.prisma.cityAgent.findFirst({
        where: { realName: dto.agentName },
        select: { id: true },
      });
      if (!agent) throw new NotFoundException("代理人不存在");
      agentId = agent.id;
    }
    if (!agentId) throw new BadRequestException("代理人ID或名称必填");

    let startAt: Date, endAt: Date;
    if (dto.settlementMonth) {
      const [y, m] = dto.settlementMonth.split("-").map(Number);
      startAt = new Date(y, m - 1, 1);
      endAt = new Date(y, m, 0, 23, 59, 59);
    } else if (dto.startAt && dto.endAt) {
      startAt = new Date(dto.startAt);
      endAt = new Date(dto.endAt);
    } else {
      throw new BadRequestException("结算月份或起止日期必填");
    }

    const settlementNo = `STL${Date.now()}`;
    await this.prisma.cityAgentSettlement.create({
      data: {
        agentId,
        settlementNo,
        amount: dto.amount,
        startAt,
        endAt,
        status: "pending",
        remark: dto.remark,
      },
    });
    await this.logOperation(
      operatorId || "",
      "create_settlement",
      "city_agent",
      agentId,
      "settlement",
      dto,
      ip,
    );
    return { success: true, settlementNo };
  }

  async cityAgentLedger(query: any) {
    const { agentId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (agentId) where.agentId = agentId;
    const [list, total] = await Promise.all([
      this.prisma.cityAgentSettlement.findMany({
        where,
        include: { agent: { select: { realName: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.cityAgentSettlement.count({ where }),
    ]);
    return {
      list: list.map((s) => ({
        id: s.id,
        settlementNo: s.settlementNo,
        agentName: s.agent?.realName,
        amount: Math.round(Number(s.amount) * 100),
        status: s.status,
        startAt: s.startAt,
        endAt: s.endAt,
        orderCount: s.orderCount,
        transferNo: s.transferNo,
        remark: s.remark,
        createdAt: s.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async cityAgentOperations(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const where: any = { module: "city_agent" };
    const [list, total] = await Promise.all([
      this.prisma.adminOperationLog.findMany({
        where,
        include: { account: { select: { realName: true, username: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.adminOperationLog.count({ where }),
    ]);
    return {
      list: list.map((l) => ({
        id: l.id,
        operator: l.account?.realName || l.account?.username,
        action: l.action,
        targetId: l.targetId,
        targetType: l.targetType,
        detail: l.detail,
        createdAt: l.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ==================== 分类管理 ====================
  async createCategory(dto: any) {
    const {
      parentId,
      name,
      icon,
      sortOrder,
      type = "product",
      businessType,
      business_type,
      status = "active",
    } = dto;
    const data: any = {
      name,
      icon,
      sortOrder: sortOrder ?? 0,
      type,
      businessType: businessType || business_type || "takeaway",
      status,
    };
    if (parentId) data.parentId = parentId;
    const item = await this.prisma.category.create({ data });
    return { success: true, data: item };
  }

  async updateCategory(id: string, dto: any) {
    const {
      parentId,
      name,
      icon,
      sortOrder,
      type,
      businessType,
      business_type,
      status,
    } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (icon !== undefined) data.icon = icon;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (type !== undefined) data.type = type;
    if (businessType !== undefined || business_type !== undefined)
      data.businessType = businessType || business_type || "takeaway";
    if (status !== undefined) data.status = status;
    if (parentId !== undefined)
      data.parentId = this.toOptionalStringOrNull(parentId);
    const item = await this.prisma.category.update({ where: { id }, data });
    return { success: true, data: item };
  }

  async deleteCategory(id: string) {
    const children = await this.prisma.category.count({
      where: { parentId: id },
    });
    const products = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (children > 0 || products > 0) {
      await this.prisma.category.update({
        where: { id },
        data: { status: "deleted" },
      });
      return { success: true, message: "分类已软删除（存在子分类或关联商品）" };
    }
    await this.prisma.category.delete({ where: { id } });
    return { success: true, message: "分类已删除" };
  }

  // ==================== 商品管理 ====================
  async createProduct(dto: any, operatorId?: string, ip?: string) {
    const {
      merchantId,
      categoryId,
      name,
      images,
      detail,
      price,
      originPrice,
      stock,
      unit,
      weight,
      status = "on_sale",
      skus = [],
    } = dto;
    const product = await this.prisma.product.create({
      data: {
        merchantId,
        categoryId,
        name,
        images,
        detail,
        price,
        originPrice,
        stock,
        unit,
        weight,
        status,
        skus:
          skus.length > 0
            ? {
                create: skus.map((s: any) => ({
                  specs: s.specs,
                  price: s.price,
                  originPrice: s.originPrice,
                  stock: s.stock,
                  image: s.image,
                  status: s.status || "on_sale",
                })),
              }
            : undefined,
      },
      include: { skus: true },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "product",
        product.id,
        "product",
        { name },
        ip,
      );
    return { success: true, data: product };
  }

  async updateProduct(id: string, dto: any) {
    const {
      categoryId,
      name,
      images,
      detail,
      price,
      originPrice,
      stock,
      unit,
      weight,
      status,
      skus,
    } = dto;
    const data: any = {};
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (name !== undefined) data.name = name;
    if (images !== undefined) data.images = images;
    if (detail !== undefined) data.detail = detail;
    if (price !== undefined) data.price = price;
    if (originPrice !== undefined) data.originPrice = originPrice;
    if (stock !== undefined) data.stock = stock;
    if (unit !== undefined) data.unit = unit;
    if (weight !== undefined) data.weight = weight;
    if (status !== undefined) data.status = status;
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: { skus: true },
    });
    if (skus && Array.isArray(skus)) {
      const existingSkuIds = new Set<string>();
      for (const s of skus) {
        if (s.id) {
          await this.prisma.sKU.update({
            where: { id: s.id },
            data: {
              specs: s.specs,
              price: s.price,
              originPrice: s.originPrice,
              stock: s.stock,
              image: s.image,
              status: s.status || "on_sale",
            },
          });
          existingSkuIds.add(s.id);
        } else {
          await this.prisma.sKU.create({
            data: {
              productId: id,
              specs: s.specs,
              price: s.price,
              originPrice: s.originPrice,
              stock: s.stock,
              image: s.image,
              status: s.status || "on_sale",
            },
          });
        }
      }
    }
    const updatedProduct = await this.prisma.product.findUnique({
      where: { id },
      include: {
        skus: true,
        merchant: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    return { success: true, data: updatedProduct };
  }

  async updateProductStatus(id: string, status: number | string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: String(status) },
    });
    return { success: true, data: product };
  }

  async auditProduct(id: string, dto: any, operatorId?: string, ip?: string) {
    const { status, reason } = dto;
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: status === "approved" ? "on_sale" : "off_sale" },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        status === "approved" ? "APPROVE" : "REJECT",
        "product",
        id,
        "product",
        { reason },
        ip,
      );
    return { success: true, data: product };
  }

  async productStockAlerts(q: any) {
    const { page = 1, pageSize = 20, alertStock = 10 } = q;
    const where = { stock: { lt: +alertStock }, status: { not: "deleted" } };
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: { merchant: true, category: true },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ==================== 订单管理 ====================
  private async restoreOrderCoupon(order: any, db: any = this.prisma) {
    const usedCoupon = await db.couponReceive.findFirst({
      where: { userId: order.userId, orderNo: order.orderNo, status: "used" },
    });
    if (!usedCoupon) return;
    await db.couponReceive.update({
      where: { id: usedCoupon.id },
      data: { status: "unused", usedAt: null, orderNo: null },
    });
    await db.coupon
      .update({
        where: { id: usedCoupon.couponId },
        data: { usedCount: { decrement: 1 } },
      })
      .catch(() => undefined);
    await db.subsidyLedger
      .updateMany({
        where: { sourceType: "coupon", orderType: "order", orderId: order.id },
        data: { status: "cancelled" },
      })
      .catch(() => undefined);
  }

  private parseModifierSelections(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async restoreOrderInventory(order: any, db: any) {
    for (const item of order.items || []) {
      await db.product.updateMany({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          saleCount: { decrement: item.quantity },
        },
      });
      if (item.skuId) {
        await db.sKU.updateMany({
          where: { id: item.skuId },
          data: { stock: { increment: item.quantity } },
        });
      }
      for (const modifier of this.parseModifierSelections(
        item.modifierSelections,
      )) {
        if (modifier.stockManaged) {
          await db.productModifierOption.updateMany({
            where: { id: modifier.optionId, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    }
  }

  async cancelOrder(id: string, dto: any, operatorId?: string, ip?: string) {
    const { reason } = dto || {};
    await this.assertOrderRegionAccess(operatorId, id);
    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) throw new NotFoundException("订单不存在");
      if (current.status !== "PENDING_PAY") {
        throw new BadRequestException(
          "已支付或履约中的订单不能直接取消，请走退款流程",
        );
      }
      const claimed = await tx.order.updateMany({
        where: { id, status: "PENDING_PAY" },
        data: {
          status: "CANCELLED",
          cancelTime: new Date(),
          cancelReason: reason || "管理员取消",
          stockReserved: false,
        },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      if (current.stockReserved) await this.restoreOrderInventory(current, tx);
      await this.restoreOrderCoupon(current, tx);
      if (this.membershipService) {
        await this.membershipService.restoreBenefitUsagesForTarget(
          "shop_order",
          current.id,
          tx,
        );
      }
      await tx.subsidyLedger
        .updateMany({
          where: {
            sourceType: "membership",
            orderType: "order",
            orderId: current.id,
          },
          data: { status: "cancelled" },
        })
        .catch(() => undefined);
      return { ...current, status: "CANCELLED" };
    });
    await this.prisma.orderLog.create({
      data: {
        orderId: id,
        action: "CANCELLED",
        fromStatus: "PENDING_PAY",
        toStatus: "CANCELLED",
        operatorId: operatorId || "system",
        operatorType: "admin",
        remark: reason,
      },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CANCEL",
        "order",
        id,
        "order",
        { reason },
        ip,
      );
    if (this.notifyService && order.userId) {
      await this.notifyService
        .createAndDispatch({
          userId: order.userId,
          type: "order",
          scene: "shop_order_admin_cancelled",
          title: "外卖订单已取消",
          content: `订单 ${order.orderNo || order.id} 已由平台取消${reason ? `：${reason}` : ""}。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            reason: reason || "管理员取消",
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined);
    }
    return { success: true, data: order };
  }

  async updateOrderStatus(_id: string, _status: string) {
    throw new BadRequestException(
      "后台不可直接修改外卖订单状态，请使用取消、退款或商家/骑手履约流程",
    );
  }

  // ==================== 退款管理 ====================
  async completeRefund(id: string, dto: any, operatorId?: string, ip?: string) {
    const { transferNo } = dto || {};
    // AUD-P1-061: 禁止绕过状态机直接改 PaymentRefund.status。
    // 必须走 PaymentService.completeRefundById 统一事务：更新退款单 + 支付单 + 业务终态 + 退款流水 + 会员权益
    if (!this.paymentService) {
      throw new BadRequestException("支付服务未就绪");
    }
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundException("退款申请不存在");
    await this.assertPaymentRefundRegionAccess(operatorId, refund);
    const result = await this.paymentService.completeRefundById(
      id,
      operatorId,
      transferNo || undefined,
    );
    if (operatorId && ip) {
      await this.logOperation(
        operatorId,
        "COMPLETE",
        "refund",
        id,
        "refund",
        { transferNo, refundNo: result.refundNo },
        ip,
      ).catch(() => undefined);
    }
    return { success: true, data: result };
  }

  // ==================== 签到配置 ====================
  async signConfigs(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.punchInConfig.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.punchInConfig.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createSignConfig(dto: any) {
    const item = await this.prisma.punchInConfig.create({ data: dto });
    return { success: true, data: item };
  }

  async updateSignConfig(id: string, dto: any) {
    const item = await this.prisma.punchInConfig.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async deleteSignConfig(id: string) {
    await this.prisma.punchInConfig.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 徽章管理 ====================
  async badges(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.badge.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.badge.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createBadge(dto: any) {
    const item = await this.prisma.badge.create({ data: dto });
    return { success: true, data: item };
  }

  async updateBadge(id: string, dto: any) {
    const item = await this.prisma.badge.update({ where: { id }, data: dto });
    return { success: true, data: item };
  }

  async deleteBadge(id: string) {
    await this.prisma.badge.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 团购管理 ====================
  async groupBuys(q: any) {
    const { page = 1, pageSize = 20, status } = q;
    const where: any = {};
    if (status !== undefined) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.groupBuyPackage.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async createGroupBuy(dto: any) {
    const item = await this.prisma.groupBuyPackage.create({ data: dto });
    return { success: true, data: item };
  }

  async updateGroupBuy(id: string, dto: any) {
    const item = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  // ==================== 分享邀请 ====================
  async shareInvites(q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.shareSettings.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.shareSettings.count(),
    ]);
    return {
      list: list.length ? list : [],
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async createShareInvite(dto: any) {
    const item = await this.prisma.shareSettings.create({
      data: this.normalizeShareSettingsPayload(dto),
    });
    return { success: true, data: item };
  }

  async updateShareInvite(id: string, dto: any) {
    const item = await this.prisma.shareSettings.update({
      where: { id },
      data: this.normalizeShareSettingsPayload(dto),
    });
    return { success: true, data: item };
  }

  // ==================== 通知管理 ====================
  async createNotification(dto: any) {
    if (!this.notifyService) throw new BadRequestException("通知服务不可用");
    const {
      userId,
      regionId,
      type,
      scene,
      title,
      content,
      data,
      linkType,
      linkValue,
      channelMask,
    } = dto;
    if (!userId || !title || !content)
      throw new BadRequestException("用户、标题和内容不能为空");
    const item = await this.notifyService.createAndDispatch({
      userId,
      regionId,
      type: type || "SYSTEM",
      scene: scene || "admin_single",
      title,
      content,
      data,
      linkType,
      linkValue,
      channelMask,
    });
    return { success: true, data: item };
  }

  async updateNotification(id: string, dto: any) {
    const item = await this.prisma.notification.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async sendNotification(id: string) {
    return {
      code: 501,
      message: "系统通知广播需通过消息推送服务实现，当前仅支持单用户通知创建",
    };
  }

  async deleteNotification(id: string) {
    void id;
    throw new BadRequestException(
      "通知属于投递历史，后台不可物理删除；用户侧隐藏不会删除后台记录",
    );
  }

  // ==================== 会话管理 ====================
  async conversationList(q: any) {
    const { page = 1, pageSize = 20, keyword } = q;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { lastMessage: { contains: keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          members: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async blockConversation(id: string) {
    await this.prisma.conversation.update({
      where: { id },
      data: { isBlocked: true },
    });
    return { success: true };
  }

  async unblockConversation(id: string) {
    await this.prisma.conversation.update({
      where: { id },
      data: { isBlocked: false },
    });
    return { success: true };
  }

  // ==================== 消息管理 ====================
  async messageHistory(q: any) {
    const { page = 1, pageSize = 20, conversationId, keyword } = q;
    const where: any = {};
    if (conversationId) where.conversationId = conversationId;
    if (keyword) where.content = { contains: keyword };
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          sender: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.message.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async recallMessage(dto: any) {
    const { conversationId, messageId } = dto;
    await this.prisma.message.updateMany({
      where: { id: messageId, conversationId },
      data: { isRecalled: true, recalledAt: new Date() },
    });
    return { success: true };
  }

  // ==================== 违规处理 ====================
  async handleViolation(id: string, dto: any) {
    const { status, result } = dto;
    // 违规记录暂无独立表，暂时记录到 AuditRecord
    await this.prisma.auditRecord.create({
      data: { targetType: "report", targetId: id, status, reason: result },
    });
    return { success: true };
  }

  // ==================== 管理员管理 ====================
  async resetAdminPassword(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const password = String(dto?.password || "");
    const securityConfig = await this.prisma.config.findUnique({ where: { key: "security" } }).catch(() => null);
    const minLength = Number((securityConfig?.value as any)?.passwordMinLength) || 8;
    const strength = checkPasswordStrength(password, minLength);
    if (!strength.valid) throw new BadRequestException(strength.message);
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.adminAccount.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        passwordResetRequired: true,
      },
    });

    // AUD-P1-164: 重置密码后清除旧 refresh token
    await this.redis.del(`refresh:${id}`).catch(() => undefined);

    if (operatorId)
      await this.logOperation(
        operatorId,
        "RESET_PASSWORD",
        "admin",
        id,
        "admin_account",
        {},
        ip,
      );
    return { success: true };
  }

  async adminStatus(id: string, status: string | number) {
    const statusStr = status === 1 || status === "1" ? "active" : "disabled";
    await this.prisma.adminAccount.update({
      where: { id },
      data: { status: statusStr },
    });
    return { success: true };
  }

  async batchAdmins(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };
    if (action === "delete") {
      await this.prisma.adminAccount.deleteMany({ where: { id: { in: ids } } });
    } else if (action === "status") {
      await this.prisma.adminAccount.updateMany({
        where: { id: { in: ids } },
        data: { status: value },
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "admin",
        ids.join(","),
        "admin_account",
        { action, value },
        ip,
      );
    return { success: true };
  }

  /** 解锁管理员（清除 loginFailCount + lockedUntil） */
  async unlockAdmin(id: string, operatorId?: string, ip?: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException("管理员不存在");

    await this.prisma.adminAccount.update({
      where: { id },
      data: { loginFailCount: 0, lockedUntil: null },
    });

    if (operatorId)
      await this.logOperation(
        operatorId,
        "UNLOCK",
        "admin",
        id,
        "admin_account",
        { previousFailCount: account.loginFailCount },
        ip,
      );

    return { success: true };
  }

  /** 强制下次登录修改密码 */
  async forcePasswordReset(id: string, operatorId?: string, ip?: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException("管理员不存在");

    await this.prisma.adminAccount.update({
      where: { id },
      data: { passwordResetRequired: true },
    });

    // AUD-P1-164: 强制改密后清除旧 refresh token
    await this.redis.del(`refresh:${id}`).catch(() => undefined);

    if (operatorId)
      await this.logOperation(
        operatorId,
        "FORCE_PASSWORD_RESET",
        "admin",
        id,
        "admin_account",
        { username: account.username },
        ip,
      );

    return { success: true };
  }

  /** 软删除管理员（设置 deletedAt，不清除数据） */
  async softDeleteAdmin(id: string, operatorId?: string, ip?: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException("管理员不存在");

    await this.prisma.adminAccount.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "disabled",
      },
    });

    if (operatorId)
      await this.logOperation(
        operatorId,
        "SOFT_DELETE",
        "admin",
        id,
        "admin_account",
        { username: account.username },
        ip,
      );

    return { success: true };
  }

  // ==================== 角色/菜单管理 ====================
  async createRole(dto: any) {
    const { name, code, description, permissions = [] } = dto;
    if (!name || !code)
      throw new BadRequestException("角色名称和角色编码不能为空");
    const exists = await this.prisma.adminRole.findUnique({ where: { code } });
    if (exists) throw new ConflictException("角色编码已存在");
    const role = await this.prisma.adminRole.create({
      data: { name, code, description },
    });
    if (permissions.length > 0) {
      await this.assertPermissionsExist(permissions);
      await this.prisma.adminRolePermission.createMany({
        data: permissions.map((pid: string) => ({
          roleId: role.id,
          permissionId: pid,
        })),
      });
    }
    return { success: true, data: role };
  }

  async updateRole(id: string, dto: any) {
    const { name, code, description, permissions } = dto;
    const current = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("角色不存在");
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined && code !== current.code) {
      if (current.isSystem)
        throw new BadRequestException("系统内置角色不允许修改角色编码");
      const exists = await this.prisma.adminRole.findUnique({
        where: { code },
      });
      if (exists) throw new ConflictException("角色编码已存在");
      data.code = code;
    }
    if (description !== undefined) data.description = description;
    const role = await this.prisma.adminRole.update({ where: { id }, data });
    if (permissions && Array.isArray(permissions)) {
      await this.assertPermissionsExist(permissions);
      await this.prisma.adminRolePermission.deleteMany({
        where: { roleId: id },
      });
      if (permissions.length > 0) {
        await this.prisma.adminRolePermission.createMany({
          data: permissions.map((pid: string) => ({
            roleId: id,
            permissionId: pid,
          })),
        });
      }
    }
    return { success: true, data: role };
  }

  async deleteRole(id: string) {
    const role = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.isSystem) throw new BadRequestException("系统内置角色不允许删除");
    await this.prisma.adminRole.delete({ where: { id } });
    return { success: true };
  }

  private async assertPermissionsExist(permissionIds: string[]) {
    const ids = Array.from(new Set((permissionIds || []).filter(Boolean)));
    if (!ids.length) return;
    const count = await this.prisma.adminPermission.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length)
      throw new BadRequestException("存在无效权限点，请刷新后重试");
  }

  async createMenu(dto: any) {
    const item = await this.prisma.adminMenu.create({ data: dto });
    return { success: true, data: item };
  }

  async updateMenu(id: string, dto: any) {
    const item = await this.prisma.adminMenu.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: item };
  }

  async deleteMenu(id: string) {
    await this.prisma.adminMenu.delete({ where: { id } });
    return { success: true };
  }

  // ==================== 用户扩展 ====================
  async batchUsers(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };
    const normalizedAction = String(action || "").toLowerCase();
    if (normalizedAction === "ban") {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "BANNED" },
      });
    } else if (["unban", "enable", "active"].includes(normalizedAction)) {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "ACTIVE" },
      });
    } else if (["disable", "inactive"].includes(normalizedAction)) {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "INACTIVE" },
      });
    } else if (normalizedAction === "mute") {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: {
          muteEndAt: new Date(Date.now() + (value?.hours || 24) * 3600000),
          muteReason: value?.reason || "批量禁言",
        },
      });
    } else if (normalizedAction === "tag") {
      for (const uid of ids) {
        await this.prisma.userTag.upsert({
          where: {
            userId_name: { userId: uid, name: value?.name || "批量标签" },
          },
          update: {},
          create: {
            userId: uid,
            name: value?.name || "批量标签",
            color: value?.color,
          },
        });
      }
    }
    if (["ban", "disable", "inactive"].includes(normalizedAction)) {
      await Promise.all(
        Array.from(
          new Set(ids.map((id: any) => String(id)).filter(Boolean)),
        ).map((id) => this.revokeUserAccess(id)),
      );
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "user",
        ids.join(","),
        "user",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async userBalanceLogs(id: string, q: any, operatorId?: string) {
    await this.assertUserRegionAccess(operatorId, id);
    const { page = 1, pageSize = 20, type } = q;
    const where: any = { userId: id };
    if (type) where.type = type;
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return {
      list: list.map((t: any) => ({
        ...t,
        amount: Number(t.amount),
        balance: Number(t.balance),
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async userBalanceAdjust(dto: any, operatorId?: string, ip?: string) {
    const userId = String(dto.userId || dto.user_id || "").trim();
    const amount = Number(dto.amount || 0);
    const remark = String(dto.remark || dto.reason || "").trim();
    if (!userId) throw new BadRequestException("缺少用户ID");
    if (!amount || !Number.isFinite(amount))
      throw new BadRequestException("请输入调整金额");
    if (!remark) throw new BadRequestException("请填写调整原因");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("用户不存在");
    await this.assertUserRegionAccess(operatorId, userId);
    await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0, freeze: 0, totalIn: 0, totalOut: 0 },
      update: {},
    });
    const newBalance = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.updateMany({
        where: {
          userId,
          ...(amount < 0 ? { balance: { gte: Math.abs(amount) } } : {}),
        },
        data: {
          balance: { increment: amount },
          totalIn: amount > 0 ? { increment: amount } : undefined,
          totalOut: amount < 0 ? { increment: Math.abs(amount) } : undefined,
        },
      });
      if (updated.count !== 1) return null;

      const current = await tx.wallet.findUnique({ where: { userId }, select: { balance: true } });
      const balance = Number(current?.balance || 0);
      await tx.walletTransaction.create({
        data: {
          userId,
          type: amount > 0 ? "RECHARGE" : "PENALTY",
          amount: Math.abs(amount),
          balance,
          description: remark || "管理员调整余额",
        },
      });
      return balance;
    });
    if (newBalance === null) return { code: 400, message: "余额不能为负数" };
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BALANCE_ADJUST",
        "user",
        userId,
        "user",
        { amount, remark },
        ip,
      );
    return { success: true, newBalance };
  }

  async userCouponOptions() {
    const now = new Date();
    const list = await this.prisma.coupon.findMany({
      where: { status: "active", endAt: { gt: now } },
      orderBy: [{ endAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return {
      list: list.map((item: any) => ({
        ...item,
        businessScope: item.businessScope || "all",
        value: this.moneyToCents(item.value),
        minAmount: this.moneyToCents(item.minAmount),
        remainCount: Math.max(
          0,
          Number(item.totalCount || 0) - Number(item.receivedCount || 0),
        ),
      })),
    };
  }

  async grantUserCoupons(
    userId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const couponId = String(dto.couponId || dto.coupon_id || "").trim();
    const quantity = Math.max(1, Math.min(100, Number(dto.quantity || 1)));
    const reason = String(dto.reason || dto.remark || "").trim();
    const ignoreLimit = dto.ignoreLimit === true;
    if (!couponId) throw new BadRequestException("请选择优惠券");
    if (!reason) throw new BadRequestException("请填写发放原因");
    const now = new Date();
    const [user, coupon] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.coupon.findUnique({ where: { id: couponId } }),
    ]);
    if (!user) throw new NotFoundException("用户不存在");
    if (!coupon || coupon.status !== "active" || coupon.endAt <= now)
      throw new BadRequestException("优惠券不存在、未启用或已过期");
    const remain =
      Number(coupon.totalCount || 0) - Number(coupon.receivedCount || 0);
    if (remain < quantity) throw new BadRequestException("优惠券库存不足");
    if (!ignoreLimit) {
      const owned = await this.prisma.couponReceive.count({
        where: { userId, couponId },
      });
      if (owned + quantity > Number(coupon.limitPerUser || 1))
        throw new BadRequestException("超过该券的用户限领数量");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.couponReceive.createMany({
        data: Array.from({ length: quantity }).map(() => ({
          userId,
          couponId,
          status: "unused",
        })),
      });
      await tx.coupon.update({
        where: { id: couponId },
        data: { receivedCount: { increment: quantity } },
      });
    });
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "GRANT_COUPON",
        "user",
        userId,
        "user",
        { couponId, couponName: coupon.name, quantity, reason, ignoreLimit },
        ip,
      );
    }
    return { success: true, quantity };
  }

  async grantUserMembershipBenefit(
    userId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const reason = String(dto.reason || "").trim();
    if (!reason) throw new BadRequestException("请填写发放原因");
    const result = await this.membershipService?.adminGrantBenefit(
      { ...dto, userId },
      operatorId,
    );
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "GRANT_MEMBERSHIP_BENEFIT",
        "user",
        userId,
        "user",
        { ...dto, reason },
        ip,
      );
    }
    return { success: true, data: result };
  }

  async grantUserMembership(
    userId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const reason = String(dto.reason || "").trim();
    if (!reason) throw new BadRequestException("请填写赠送原因");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("用户不存在");
    const result = await this.membershipService?.adminGrant(
      { ...dto, userId },
      operatorId,
    );
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "GRANT_MEMBERSHIP",
        "user",
        userId,
        "user",
        { ...dto, reason, membershipId: (result as any)?.id },
        ip,
      );
    }
    return { success: true, data: result };
  }

  async updateUserRegion(
    userId: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const regionId = String(dto.regionId || dto.region_id || "").trim();
    const reason = String(dto.reason || "").trim();
    if (!regionId) throw new BadRequestException("请选择归属区域");
    if (!reason) throw new BadRequestException("请填写变更原因");
    const [user, region] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
      this.prisma.region.findUnique({ where: { id: regionId } }),
    ]);
    if (!user) throw new NotFoundException("用户不存在");
    if (!region) throw new NotFoundException("区域不存在");
    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, regionId, region: region.name },
        update: { regionId, region: region.name },
      });
      const defaultAddress = await tx.address.findFirst({
        where: { userId, isDefault: true },
      });
      if (defaultAddress) {
        await tx.address.update({
          where: { id: defaultAddress.id },
          data: { regionId },
        });
      }
    });
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "UPDATE_USER_REGION",
        "user",
        userId,
        "user",
        {
          regionId,
          regionName: region.name,
          previousRegionId: (user.profile as any)?.regionId || null,
          previousRegionName: user.profile?.region || null,
          reason,
        },
        ip,
      );
    }
    return { success: true, regionId, regionName: region.name };
  }

  async userFollows(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          following: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.follow.count({ where: { followerId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async userFans(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          follower: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.follow.count({ where: { followingId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async userBrowseHistory(id: string, q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.browseHistory.findMany({
        where: { userId: id },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.browseHistory.count({ where: { userId: id } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ==================== 帖子扩展 ====================
  async toggleEssence(id: string, operatorId?: string, ip?: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) return { code: 404, message: "帖子不存在" };
    const updated = await this.prisma.post.update({
      where: { id },
      data: { isEssence: !post.isEssence },
    });
    // AUD-P1-145: 精华变更后清理帖子流缓存
    await this.clearPostFeedCache(post.regionId);
    // AUD-P1-150: 记录操作日志
    await this.logOperation(
      operatorId || "",
      "update",
      "post",
      id,
      "post",
      { isEssence: !post.isEssence },
      ip,
    );
    return { success: true, data: updated };
  }

  async batchPosts(dto: any, operatorId?: string, ip?: string) {
    const { ids, action, value } = dto;
    if (!ids || !Array.isArray(ids))
      return { code: 400, message: "缺少 ids 参数" };

    // AUD-P1-149: 根据操作类型检查权限
    // 注意：权限检查已在 controller 层通过 RequirePermissionAny 完成
    // 这里只做业务逻辑处理

    if (action === "delete") {
      for (const id of ids.map(String)) {
        await this.deletePost(id, operatorId, ip);
      }
    } else if (action === "audit") {
      for (const id of ids.map(String)) {
        await this.auditPost(id, { status: value }, operatorId, ip);
      }
    } else if (action === "top") {
      const posts = await this.prisma.post.findMany({
        where: { id: { in: ids.map(String) } },
        select: { regionId: true },
      });
      await this.prisma.post.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { isTop: value === true || value === "true" || value === 1 },
      });
      await Promise.all(
        [...new Set(posts.map((item) => item.regionId).filter(Boolean))].map(
          (regionId) => this.clearPostFeedCache(regionId),
        ),
      );
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "post",
        ids.join(","),
        "post",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async getHotPosts(q?: any) {
    const { page = 1, pageSize = 20 } = q || {};
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: [{ viewCount: "desc" }, { likeCount: "desc" }],
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          media: true,
        },
      }),
      this.prisma.post.count({
        where: { status: "PUBLISHED", deletedAt: null },
      }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async updateHot(dto: any, operatorId?: string, ip?: string) {
    const { postIds } = dto;
    if (!Array.isArray(postIds))
      return { code: 400, message: "postIds 必须是数组" };
    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, regionId: true },
    });
    await this.prisma.post.updateMany({
      where: { id: { in: postIds } },
      data: { isEssence: true },
    });
    // AUD-P1-145/150: 热门配置变更后清理各区域帖子流缓存 + 记录操作日志
    await Promise.all(
      [...new Set(posts.map((p) => p.regionId).filter(Boolean))].map((rid) =>
        this.clearPostFeedCache(rid),
      ),
    );
    await this.logOperation(
      operatorId || "",
      "update",
      "hot",
      "",
      "post",
      { postIds },
      ip,
    );
    return { success: true };
  }

  // ==================== 圈子管理 ====================
  async createCircle(dto: any) {
    const {
      name,
      icon,
      cover,
      description,
      regionId,
      joinType,
      maxMembers,
      tags,
    } = dto;
    const circle = await this.prisma.circle.create({
      data: {
        name,
        icon,
        cover,
        description,
        regionId,
        joinType,
        maxMembers,
        tags,
      },
    });
    return { success: true, data: circle };
  }

  async updateCircle(id: string, dto: any) {
    const {
      name,
      icon,
      cover,
      description,
      regionId,
      joinType,
      maxMembers,
      tags,
    } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (icon !== undefined) data.icon = icon;
    if (cover !== undefined) data.cover = cover;
    if (description !== undefined) data.description = description;
    if (regionId !== undefined) data.regionId = regionId;
    if (joinType !== undefined) data.joinType = joinType;
    if (maxMembers !== undefined) data.maxMembers = maxMembers;
    if (tags !== undefined) data.tags = tags;
    const circle = await this.prisma.circle.update({ where: { id }, data });
    return { success: true, data: circle };
  }

  async updateCircleStatus(id: string, status: number | string) {
    const circle = await this.prisma.circle.update({
      where: { id },
      data: { status: String(status) },
    });
    return { success: true, data: circle };
  }

  // ==================== 配置管理 ====================
  async getConfigs(key?: string) {
    return this.getConfig(key || "default");
  }
  async updateConfigs(dto: any, operatorId?: string, ip?: string) {
    return this.setConfig(dto.key || "default", dto, operatorId, ip);
  }

  // ==================== 区域扩展 ====================
  async batchRegions(dto: any, operatorId?: string, ip?: string) {
    const { ids, action } = dto;
    if (!ids || !Array.isArray(ids))
      throw new BadRequestException("缺少 ids 参数");
    const regionIds = ids.map((id: unknown) => String(id)).filter(Boolean);
    if (regionIds.length === 0) throw new BadRequestException("请选择区域");
    await Promise.all(
      regionIds.map((id) =>
        this.adminDataScope.assertRegionAccess(operatorId, id),
      ),
    );

    const value = dto.value ?? dto.data?.status;
    if (action === "delete") {
      // 检查关联数据
      const relatedPosts = await this.prisma.post.count({
        where: { regionId: { in: regionIds } },
      });
      if (relatedPosts > 0) {
        throw new BadRequestException(
          `选中区域共有 ${relatedPosts} 个关联帖子，请先清理后再删除`,
        );
      }
      await this.prisma.region.deleteMany({ where: { id: { in: regionIds } } });
    } else if (
      action === "status" ||
      action === "enable" ||
      action === "disable"
    ) {
      const isOpen =
        action === "enable"
          ? true
          : action === "disable"
            ? false
            : value === true ||
              value === "true" ||
              value === 1 ||
              value === "1";
      await this.prisma.region.updateMany({
        where: { id: { in: regionIds } },
        data: { isOpen },
      });
    } else {
      throw new BadRequestException(`不支持的批量操作: ${action}`);
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "BATCH",
        "region",
        regionIds.join(","),
        "region",
        { action, value },
        ip,
      );
    return { success: true };
  }

  async deleteRegion(id: string, operatorId?: string, ip?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, id);
    const region = await this.prisma.region.findUnique({
      where: { id },
      select: { id: true, name: true, code: true },
    });
    if (!region) throw new NotFoundException("区域不存在");

    // 检查关联数据
    const [
      postCount,
      circleCount,
      merchantCount,
      activityCount,
      secondHandCount,
    ] = await Promise.all([
      this.prisma.post.count({ where: { regionId: id } }),
      this.prisma.circle.count({ where: { regionId: id } }),
      this.prisma.merchant.count({ where: { regionId: id } }),
      this.prisma.activity.count({ where: { regionId: id } }),
      this.prisma.secondHand.count({ where: { regionId: id } }),
    ]);

    const relatedCounts = [
      { name: "帖子", count: postCount },
      { name: "圈子", count: circleCount },
      { name: "商家", count: merchantCount },
      { name: "活动", count: activityCount },
      { name: "二手商品", count: secondHandCount },
    ].filter((c) => c.count > 0);

    if (relatedCounts.length > 0) {
      const detail = relatedCounts
        .map((c) => `${c.name} ${c.count} 个`)
        .join("、");
      throw new BadRequestException(
        `该区域存在关联数据，禁止删除（${detail}）。请先清理关联数据后再删除。`,
      );
    }

    await this.prisma.region.delete({ where: { id } });
    if (operatorId) {
      await this.logOperation(
        operatorId,
        "DELETE",
        "region",
        id,
        "region",
        { name: region.name, code: region.code },
        ip,
      );
    }
    return { success: true };
  }

  private async assertRegionScopedRecordAccess(
    modelName: string,
    id: string,
    operatorId?: string,
  ) {
    const delegate = (this.prisma as any)[modelName];
    const item = await delegate.findUnique({
      where: { id },
      select: { id: true, regionId: true },
    });
    if (!item) throw new NotFoundException("数据不存在");
    await this.adminDataScope.assertRegionAccess(operatorId, item.regionId);
    return item;
  }

  private async assertRegionDtoAccess(dto: any, operatorId?: string) {
    const regionId = dto?.regionId;
    if (!regionId) throw new BadRequestException("缺少区域ID");
    await this.adminDataScope.assertRegionAccess(operatorId, String(regionId));
  }

  async regionContentItems(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.regionContentItem.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionContentItem(dto: any, operatorId?: string, ip?: string) {
    await this.assertRegionDtoAccess(dto, operatorId);
    const item = await this.prisma.regionContentItem.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_content",
        item.id,
        "region_content_item",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionContentItem(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const current = await this.assertRegionScopedRecordAccess(
      "regionContentItem",
      id,
      operatorId,
    );
    if (dto.regionId && dto.regionId !== current.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);
    const item = await this.prisma.regionContentItem.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_content",
        id,
        "region_content_item",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionContentItem(id: string, operatorId?: string, ip?: string) {
    await this.assertRegionScopedRecordAccess(
      "regionContentItem",
      id,
      operatorId,
    );
    await this.prisma.regionContentItem.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_content",
        id,
        "region_content_item",
        {},
        ip,
      );
    return { success: true };
  }

  async regionBanners(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.regionBanner.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionBanner(dto: any, operatorId?: string, ip?: string) {
    await this.assertRegionDtoAccess(dto, operatorId);
    const item = await this.prisma.regionBanner.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_banner",
        item.id,
        "region_banner",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionBanner(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const current = await this.assertRegionScopedRecordAccess(
      "regionBanner",
      id,
      operatorId,
    );
    if (dto.regionId && dto.regionId !== current.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);
    const item = await this.prisma.regionBanner.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_banner",
        id,
        "region_banner",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionBanner(id: string, operatorId?: string, ip?: string) {
    await this.assertRegionScopedRecordAccess("regionBanner", id, operatorId);
    await this.prisma.regionBanner.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_banner",
        id,
        "region_banner",
        {},
        ip,
      );
    return { success: true };
  }

  async regionAnnouncements(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.regionNotice.findMany({
      where: { regionId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: items };
  }

  async saveRegionAnnouncement(dto: any, operatorId?: string, ip?: string) {
    await this.assertRegionDtoAccess(dto, operatorId);
    const item = await this.prisma.regionNotice.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_notice",
        item.id,
        "region_notice",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionAnnouncement(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const current = await this.assertRegionScopedRecordAccess(
      "regionNotice",
      id,
      operatorId,
    );
    if (dto.regionId && dto.regionId !== current.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);
    const item = await this.prisma.regionNotice.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_notice",
        id,
        "region_notice",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionAnnouncement(id: string, operatorId?: string, ip?: string) {
    await this.assertRegionScopedRecordAccess("regionNotice", id, operatorId);
    await this.prisma.regionNotice.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_notice",
        id,
        "region_notice",
        {},
        ip,
      );
    return { success: true };
  }

  async regionNav(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.regionNav.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionNav(dto: any, operatorId?: string, ip?: string) {
    const { regionId, items } = dto;
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    if (items && Array.isArray(items)) {
      await this.prisma.regionNav.deleteMany({ where: { regionId } });
      await this.prisma.regionNav.createMany({
        data: items.map((it: any, idx: number) => ({
          ...it,
          regionId,
          sortOrder: idx,
        })),
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_nav",
        regionId,
        "region",
        { count: items?.length },
        ip,
      );
    return { success: true };
  }

  async regionTabBar(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const config = await this.prisma.regionTabBar.findFirst({
      where: { regionId },
    });
    if (!config) return { success: true, data: null };
    return {
      success: true,
      data: {
        ...config,
        config: this.normalizeRegionTabBarConfig(config.config),
      },
    };
  }

  async saveRegionTabBar(dto: any, operatorId?: string, ip?: string) {
    const { regionId, config } = dto;
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const normalizedConfig = this.normalizeRegionTabBarConfig(config);
    const item = await this.prisma.regionTabBar.upsert({
      where: { regionId },
      update: { config: normalizedConfig },
      create: { regionId, config: normalizedConfig },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_tabbar",
        regionId,
        "region",
        normalizedConfig,
        ip,
      );
    this.wsNative?.broadcast({
      event: "tabbarConfigUpdate",
      type: "tabbarConfigUpdate",
      data: {
        regionId,
        messageBadgeStyle: normalizedConfig.messageBadgeStyle,
        updateTime: Date.now(),
      },
    });
    return { success: true, data: item };
  }

  private normalizeRegionTabBarConfig(config: any) {
    const source = { ...(config || {}) };
    const list = Array.isArray(source.list)
      ? source.list
      : Array.isArray(source.tabs)
        ? source.tabs
        : [];
    const messageBadgeStyle = ["bubble", "number", "dot", "none"].includes(
      source.messageBadgeStyle,
    )
      ? source.messageBadgeStyle
      : "bubble";
    return {
      color: source.color || "#8A8A8A",
      selectedColor: source.selectedColor || "#1677ff",
      backgroundColor: source.backgroundColor || "#ffffff",
      borderStyle: source.borderStyle || "black",
      ...source,
      messageBadgeStyle,
      list,
      tabs: list,
    };
  }

  // ==================== 区域自定义页面 ====================
  async regionCustomPages(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.regionCustomPage.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionCustomPage(dto: any, operatorId?: string, ip?: string) {
    await this.assertRegionDtoAccess(dto, operatorId);
    const item = await this.prisma.regionCustomPage.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "region_custom_page",
        item.id,
        "region_custom_page",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionCustomPage(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const current = await this.assertRegionScopedRecordAccess(
      "regionCustomPage",
      id,
      operatorId,
    );
    if (dto.regionId && dto.regionId !== current.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);
    const item = await this.prisma.regionCustomPage.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "region_custom_page",
        id,
        "region_custom_page",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionCustomPage(id: string, operatorId?: string, ip?: string) {
    await this.assertRegionScopedRecordAccess(
      "regionCustomPage",
      id,
      operatorId,
    );
    await this.prisma.regionCustomPage.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "region_custom_page",
        id,
        "region_custom_page",
        {},
        ip,
      );
    return { success: true };
  }

  // ==================== 区域富文本内容 ====================
  async regionRichTexts(regionId: string, operatorId?: string) {
    await this.adminDataScope.assertRegionAccess(operatorId, regionId);
    const items = await this.prisma.richTextContent.findMany({
      where: { regionId },
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: items };
  }

  async saveRegionRichText(dto: any, operatorId?: string, ip?: string) {
    await this.assertRegionDtoAccess(dto, operatorId);
    const item = await this.prisma.richTextContent.create({ data: dto });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "rich_text",
        item.id,
        "rich_text_content",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async updateRegionRichText(
    id: string,
    dto: any,
    operatorId?: string,
    ip?: string,
  ) {
    const current = await this.assertRegionScopedRecordAccess(
      "richTextContent",
      id,
      operatorId,
    );
    if (dto.regionId && dto.regionId !== current.regionId)
      await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);
    const item = await this.prisma.richTextContent.update({
      where: { id },
      data: dto,
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "rich_text",
        id,
        "rich_text_content",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async deleteRegionRichText(id: string, operatorId?: string, ip?: string) {
    await this.assertRegionScopedRecordAccess(
      "richTextContent",
      id,
      operatorId,
    );
    await this.prisma.richTextContent.delete({ where: { id } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "rich_text",
        id,
        "rich_text_content",
        {},
        ip,
      );
    return { success: true };
  }

  // ==================== 用户扩展 ====================
  async updateUser(id: string, dto: any, operatorId?: string, ip?: string) {
    const { nickname, avatar, phone, status, muteEndAt, muteReason } = dto;
    const data: any = {};
    if (nickname !== undefined) data.nickname = nickname;
    if (avatar !== undefined) data.avatar = avatar;
    if (phone !== undefined) data.phone = phone;
    if (status !== undefined) data.status = this.normalizeUserStatus(status);
    if (muteEndAt !== undefined)
      data.muteEndAt = muteEndAt ? new Date(muteEndAt) : null;
    if (muteReason !== undefined) data.muteReason = muteReason;
    const user = await this.prisma.user.update({ where: { id }, data });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "user",
        id,
        "user",
        dto,
        ip,
      );
    return { success: true, data: user };
  }

  async userTags() {
    const definitions = await this.getUserTagDefinitions();
    const counts = await this.prisma.userTag.groupBy({
      by: ["name"],
      _count: { name: true },
    });
    const countMap = new Map(counts.map((t: any) => [t.name, t._count.name]));
    return {
      success: true,
      data: definitions.map((t: any) => ({
        ...t,
        count: countMap.get(t.name) || 0,
      })),
    };
  }

  async createUserTag(dto: any, operatorId?: string, ip?: string) {
    const { name, color } = dto;
    const definitions = await this.getUserTagDefinitions();
    const existing = definitions.find((t: any) => t.name === name);
    if (existing) return { code: 400, message: "标签已存在" };
    const tag = {
      id: `tag_${Date.now()}`,
      name,
      color: color || "#1677ff",
      createdAt: new Date().toISOString(),
    };
    await this.saveUserTagDefinitions([...definitions, tag], operatorId);
    if (operatorId)
      await this.logOperation(
        operatorId,
        "CREATE",
        "user_tag",
        tag.id,
        "user_tag",
        tag,
        ip,
      );
    return { success: true, data: tag };
  }

  async updateUserTag(_id: string, dto: any, operatorId?: string, ip?: string) {
    const definitions = await this.getUserTagDefinitions();
    const index = definitions.findIndex(
      (t: any) => String(t.id) === String(_id) || t.name === dto.oldName,
    );
    if (index < 0) return { code: 404, message: "标签不存在" };
    const oldName = definitions[index].name;
    const nextName = dto.name || dto.newName || oldName;
    definitions[index] = {
      ...definitions[index],
      ...dto,
      id: definitions[index].id,
      name: nextName,
    };
    await this.saveUserTagDefinitions(definitions, operatorId);
    if (nextName !== oldName || dto.color !== undefined) {
      await this.prisma.userTag.updateMany({
        where: { name: oldName },
        data: { name: nextName, color: dto.color },
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "UPDATE",
        "user_tag",
        _id,
        "user_tag",
        dto,
        ip,
      );
    return { success: true, data: definitions[index] };
  }

  async deleteUserTag(_id: string, operatorId?: string, ip?: string) {
    const definitions = await this.getUserTagDefinitions();
    const tag = definitions.find(
      (t: any) => String(t.id) === String(_id) || t.name === _id,
    );
    if (!tag) return { code: 404, message: "标签不存在" };
    await this.saveUserTagDefinitions(
      definitions.filter((t: any) => String(t.id) !== String(tag.id)),
      operatorId,
    );
    await this.prisma.userTag.deleteMany({ where: { name: tag.name } });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "DELETE",
        "user_tag",
        _id,
        "user_tag",
        {},
        ip,
      );
    return { success: true };
  }

  async setUserTags(
    userId: string,
    tagIds: string[],
    operatorId?: string,
    ip?: string,
  ) {
    const definitions = await this.getUserTagDefinitions();
    const tagNames = (tagIds || [])
      .map(
        (id: string) =>
          definitions.find((t: any) => String(t.id) === String(id))?.name || id,
      )
      .filter(Boolean);
    await this.prisma.userTag.deleteMany({ where: { userId } });
    if (tagNames.length > 0) {
      await this.prisma.userTag.createMany({
        data: tagNames.map((name: string) => ({ userId, name })),
        skipDuplicates: true,
      });
    }
    if (operatorId)
      await this.logOperation(
        operatorId,
        "SET_TAGS",
        "user",
        userId,
        "user",
        { tags: tagNames },
        ip,
      );
    return { success: true };
  }

  // ==================== 商品扩展 ====================
  async updateSku(id: string, dto: any, operatorId?: string, ip?: string) {
    const { specs, price, originPrice, stock, image, status } = dto;
    const data: any = {};
    if (specs !== undefined) data.specs = specs;
    if (price !== undefined) data.price = price;
    if (originPrice !== undefined) data.originPrice = originPrice;
    if (stock !== undefined) data.stock = stock;
    if (image !== undefined) data.image = image;
    if (status !== undefined) data.status = status;
    const sku = await this.prisma.sKU.update({ where: { id }, data });
    if (operatorId)
      await this.logOperation(operatorId, "UPDATE", "sku", id, "sku", dto, ip);
    return { success: true, data: sku };
  }

  // ==================== 促销扩展 ====================
  async togglePromotionStatus(id: string, status: number) {
    const promotion = await this.prisma.promotion.update({
      where: { id },
      data: { status: status === 1 ? "active" : "inactive" },
    });
    return { success: true, data: promotion };
  }

  // ==================== 团购扩展 ====================
  async toggleGroupBuyStatus(id: string, status: number) {
    const item = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: { status: status === 1 ? "active" : "inactive" },
    });
    return { success: true, data: item };
  }

  // ==================== 对账扩展 ====================
  async generateReconciliation(dto: any, operatorId?: string, ip?: string) {
    const { date, type } = dto;
    const startAt = new Date(date);
    const endAt = new Date(date);
    if (type === "monthly") {
      endAt.setMonth(endAt.getMonth() + 1);
    } else {
      endAt.setDate(endAt.getDate() + 1);
    }
    const payments = await this.prisma.paymentOrder.findMany({
      where: { payTime: { gte: startAt, lt: endAt }, status: "paid" },
    });
    const totalAmount = payments.reduce(
      (sum: number, p: any) => sum + Number(p.amount),
      0,
    );
    const reconciliationNo = `REC-${Date.now()}`;
    const item = await this.prisma.reconciliation.create({
      data: {
        reconciliationNo,
        type,
        startAt,
        endAt,
        totalAmount,
        platformFee: 0,
        netAmount: totalAmount,
        orderCount: payments.length,
        status: "generated",
        detail: { paymentIds: payments.map((p: any) => p.id) },
      },
    });
    if (operatorId)
      await this.logOperation(
        operatorId,
        "GENERATE",
        "reconciliation",
        item.id,
        "reconciliation",
        dto,
        ip,
      );
    return { success: true, data: item };
  }

  async exportReconciliation(id: string) {
    const recon = await this.prisma.reconciliation.findUnique({
      where: { id },
    });
    if (!recon) throw new NotFoundException("对账单不存在");
    return {
      success: true,
      data: recon,
      message: "对账数据已导出（JSON格式）",
    };
  }

  // ==================== 工具方法 ====================
  private async getUserTagDefinitions() {
    const config = await this.prisma.config.findUnique({
      where: { key: "user_tag_definitions" },
    });
    return Array.isArray(config?.value) ? (config.value as any[]) : [];
  }

  private async saveUserTagDefinitions(tags: any[], operatorId?: string) {
    await this.prisma.config.upsert({
      where: { key: "user_tag_definitions" },
      update: { value: tags, group: "user", updatedBy: operatorId },
      create: {
        key: "user_tag_definitions",
        value: tags,
        group: "user",
        desc: "后台用户标签定义",
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });
  }

  private getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private getYesterdayStart() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getNoteSettingConfigKey(regionId: string) {
    return `content.note_settings.${regionId}`;
  }

  private getNoteSettingDefaults(regionId = "") {
    return {
      regionId,
      enable_region_posting: 1,
      min_length: 1,
      max_length: 5000,
      enable_note_title: 0,
      title_min_length: 0,
      title_max_length: 50,
      publish_interval_seconds: 0,
      allow_images: 1,
      max_images_per_note: 9,
      allow_download_image: 0,
      allow_videos: 1,
      allow_audio: 1,
      enable_campus_echo: 1,
      campus_echo_window_hours: 12,
      campus_echo_min_participants: 2,
      allow_pure_text_notes: 1,
      image_compression_ratio: 0.8,
      enable_qrcode_filter: 1,
      enable_ai_qrcode_fallback: 1,
      ai_review_failure_to_manual: 1,
      qrcode_replace_image_url: "",
      qrcode_whitelist_user_ids: [],
      enable_topics: 1,
      max_topics_per_note: 3,
      allow_anonymous_notes: 0,
      anonymous_default_name: "匿名用户",
      enable_note_location: 0,
      enable_note_group: 0,
      enable_note_top: 0,
      enable_co_create_note: 0,
      enable_vote: 0,
      note_approval_type: "manual",
      require_phone_before_publish: 0,
      require_student_auth_before_publish: 0,
      daily_publish_limit: 10,
      default_note_prompt: "",
      content_declaration: "发布校园生活、经验和新鲜事",
      allow_comments: 1,
      max_comments: 0,
      comment_length_limit: 500,
      allow_anonymous_comments: 0,
      allow_author_pin_comment: 0,
      allow_manager_delete_comment: 1,
      comment_approval_type: "none",
      random_comment_enabled: 0,
      enable_ads: 0,
      card_ad_content: "",
      waterfall_ad_content: "",
      note_list_style: "waterfall",
      note_sort_strategy: "latest",
      allow_edit: 1,
      editable_hours: 24,
      allow_delete: 1,
      deletable_hours: 72,
      manager_can_edit_note: 1,
      manager_can_delete_note: 1,
      show_view_count: 1,
      view_count_mode: "unlimited",
      enable_report: 1,
      allow_friend_share: 1,
      enable_share_poster: 0,
      enable_comment_qrcode_filter: 1,
      enable_squat: 1,
    };
  }

  private normalizeNoteSettingPayload(payload: any, regionId: string) {
    const defaults = this.getNoteSettingDefaults(regionId);
    const source = { ...(payload || {}) };

    if (source.allowTextNote !== undefined)
      source.allow_pure_text_notes = source.allowTextNote ? 1 : 0;
    if (source.allowImageNote !== undefined)
      source.allow_images = source.allowImageNote ? 1 : 0;
    if (source.allowVideoNote !== undefined)
      source.allow_videos = source.allowVideoNote ? 1 : 0;
    const aliasPairs: Array<[string, string]> = [
      ["allow_image_download", "allow_download_image"],
      ["note_publish_interval_seconds", "publish_interval_seconds"],
      ["max_notes_per_day", "daily_publish_limit"],
      ["enable_note_qrcode_filter", "enable_qrcode_filter"],
      ["ai_review_failed_to_manual", "ai_review_failure_to_manual"],
      ["ai_manual_fallback", "ai_review_failure_to_manual"],
      ["blocked_image_replacement_url", "qrcode_replace_image_url"],
      ["force_bind_phone", "require_phone_before_publish"],
      ["force_student_auth", "require_student_auth_before_publish"],
      ["enable_random_comment", "random_comment_enabled"],
      ["edit_time_limit", "editable_hours"],
      ["delete_time_limit", "deletable_hours"],
      ["allow_manager_edit", "manager_can_edit_note"],
      ["allow_manager_delete_note", "manager_can_delete_note"],
      ["note_sorting_strategy", "note_sort_strategy"],
    ];
    for (const [alias, key] of aliasPairs) {
      if (source[key] === undefined && source[alias] !== undefined)
        source[key] = source[alias];
    }

    const merged: any = { ...defaults, ...source, regionId };
    const flagKeys = [
      "enable_region_posting",
      "enable_note_title",
      "allow_images",
      "allow_download_image",
      "allow_videos",
      "allow_audio",
      "enable_campus_echo",
      "allow_pure_text_notes",
      "enable_qrcode_filter",
      "enable_ai_qrcode_fallback",
      "ai_review_failure_to_manual",
      "enable_topics",
      "allow_anonymous_notes",
      "enable_note_location",
      "enable_note_group",
      "enable_note_top",
      "enable_co_create_note",
      "enable_vote",
      "require_phone_before_publish",
      "require_student_auth_before_publish",
      "allow_comments",
      "allow_anonymous_comments",
      "allow_author_pin_comment",
      "allow_manager_delete_comment",
      "random_comment_enabled",
      "enable_ads",
      "allow_edit",
      "allow_delete",
      "manager_can_edit_note",
      "manager_can_delete_note",
      "show_view_count",
      "enable_report",
      "allow_friend_share",
      "enable_share_poster",
      "enable_comment_qrcode_filter",
      "enable_squat",
    ];
    for (const key of flagKeys) merged[key] = merged[key] ? 1 : 0;

    const numericKeys = [
      "min_length",
      "max_length",
      "title_min_length",
      "title_max_length",
      "publish_interval_seconds",
      "max_images_per_note",
      "max_topics_per_note",
      "daily_publish_limit",
      "max_comments",
      "comment_length_limit",
      "editable_hours",
      "deletable_hours",
    ];
    for (const key of numericKeys) {
      const n = Number(merged[key]);
      merged[key] = Number.isFinite(n)
        ? n
        : defaults[key as keyof typeof defaults];
    }
    const ratio = Number(merged.image_compression_ratio);
    merged.image_compression_ratio = Number.isFinite(ratio)
      ? Math.min(Math.max(ratio, 0.1), 1)
      : 0.8;
    merged.campus_echo_window_hours = Math.min(
      Math.max(Number(merged.campus_echo_window_hours) || 12, 1),
      72,
    );
    merged.campus_echo_min_participants = Math.min(
      Math.max(Number(merged.campus_echo_min_participants) || 2, 2),
      20,
    );
    if (typeof merged.qrcode_whitelist_user_ids === "string") {
      merged.qrcode_whitelist_user_ids = merged.qrcode_whitelist_user_ids
        .split(/[,\n]/)
        .map((item: string) => item.trim())
        .filter(Boolean);
    }

    return {
      ...merged,
      allow_image_download: !!merged.allow_download_image,
      note_publish_interval_seconds: merged.publish_interval_seconds,
      max_notes_per_day: merged.daily_publish_limit,
      enable_note_qrcode_filter: !!merged.enable_qrcode_filter,
      blocked_image_replacement_url: merged.qrcode_replace_image_url,
      force_bind_phone: !!merged.require_phone_before_publish,
      force_student_auth: !!merged.require_student_auth_before_publish,
      enable_random_comment: !!merged.random_comment_enabled,
      edit_time_limit: merged.editable_hours,
      delete_time_limit: merged.deletable_hours,
      allow_manager_edit: !!merged.manager_can_edit_note,
      allow_manager_delete_note: !!merged.manager_can_delete_note,
      note_sorting_strategy: merged.note_sort_strategy,
      allowTextNote: !!merged.allow_pure_text_notes,
      allowImageNote: !!merged.allow_images,
      allowVideoNote: !!merged.allow_videos,
    };
  }

  // ==================== 笔记配置 ====================
  async getNoteSettings(query: any) {
    const { regionId, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.noteSettings.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.noteSettings.count({ where }),
    ]);

    // Batch-fetch region names
    const regionIds = [...new Set(list.map((s) => s.regionId).filter(Boolean))];
    const regionMap: Record<string, string> = {};
    if (regionIds.length > 0) {
      const regions = await this.prisma.region.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true },
      });
      for (const r of regions) regionMap[r.id] = r.name;
    }

    return {
      list: await Promise.all(
        list.map(async (s) => {
          const detail = await this.getNoteSettingByRegion(s.regionId);
          return {
            ...detail,
            id: s.id,
            regionName: regionMap[s.regionId] || detail.regionName || null,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          };
        }),
      ),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getNoteSettingByRegion(regionId: string) {
    if (!regionId) throw new BadRequestException("regionId 不能为空");
    const [settings, config, region] = await Promise.all([
      this.prisma.noteSettings.findUnique({ where: { regionId } }),
      this.prisma.config.findUnique({
        where: { key: this.getNoteSettingConfigKey(regionId) },
      }),
      this.prisma.region.findUnique({
        where: { id: regionId },
        select: { id: true, name: true, settings: true },
      }),
    ]);
    if (!region) throw new NotFoundException("区域不存在");
    const regionSettings = (region.settings || {}) as Record<string, any>;
    const storedConfig = (config?.value ||
      regionSettings.noteConfig ||
      {}) as Record<string, any>;
    const merged = this.normalizeNoteSettingPayload(
      {
        ...storedConfig,
        allowTextNote: settings?.allowTextNote ?? storedConfig.allowTextNote,
        allowImageNote: settings?.allowImageNote ?? storedConfig.allowImageNote,
        allowVideoNote: settings?.allowVideoNote ?? storedConfig.allowVideoNote,
      },
      regionId,
    );
    return { ...merged, regionName: region.name };
  }

  async updateNoteSetting(regionId: string, dto: any) {
    if (!regionId) throw new BadRequestException("regionId 不能为空");
    const current = await this.getNoteSettingByRegion(regionId);
    const next = this.normalizeNoteSettingPayload(
      { ...current, ...dto },
      regionId,
    );
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { settings: true },
    });
    if (!region) throw new NotFoundException("区域不存在");
    const regionSettings = {
      ...((region.settings || {}) as Record<string, any>),
      noteConfig: next,
    };

    await this.prisma.$transaction([
      this.prisma.noteSettings.upsert({
        where: { regionId },
        update: {
          allowVideoNote: !!next.allow_videos,
          allowImageNote: !!next.allow_images,
          allowTextNote: !!next.allow_pure_text_notes,
        },
        create: {
          regionId,
          allowVideoNote: !!next.allow_videos,
          allowImageNote: !!next.allow_images,
          allowTextNote: !!next.allow_pure_text_notes,
        },
      }),
      this.prisma.config.upsert({
        where: { key: this.getNoteSettingConfigKey(regionId) },
        update: {
          value: next,
          group: "content",
          desc: "区域笔记发布、媒体、评论和广告配置",
        },
        create: {
          key: this.getNoteSettingConfigKey(regionId),
          value: next,
          group: "content",
          desc: "区域笔记发布、媒体、评论和广告配置",
        },
      }),
      this.prisma.region.update({
        where: { id: regionId },
        data: {
          settings: regionSettings,
          enableQrcodeFilter: !!next.enable_qrcode_filter,
        },
      }),
    ]);

    return { success: true, data: await this.getNoteSettingByRegion(regionId) };
  }

  // ==================== 统计聚合端点 ====================

  /** 仪表盘待办统计 — only return real counts, frontend must not invent todo numbers. */
  async getDashboardTodos(operatorId?: string) {
    const fulfillmentCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const riderPickupCutoff = new Date(Date.now() - 15 * 60 * 1000);
    const riderDeliveryCutoff = new Date(Date.now() - 45 * 60 * 1000);
    const s = async <T>(p: Promise<T>, f: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return f;
      }
    };
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    const pendingOrderAppealWhere = scope.isSuperAdmin
      ? { status: "pending" }
      : { status: "pending", regionId: { in: scope.regionIds } };
    const shopOrderScope = scope.isSuperAdmin
      ? {}
      : { merchant: { regionId: { in: scope.regionIds } } };
    const paymentRefundScope = await this.paymentRefundRegionWhere(operatorId);
    const activeTakeaway = {
      refundStatus: { notIn: ["refunding", "refunded"] },
    };
    const [
      pendingMerchants,
      pendingMallMerchants,
      pendingProducts,
      abnormalOrders,
      pendingReports,
      pendingRefunds,
      pendingPaymentRefunds,
      pendingCerts,
      pendingPosts,
      pendingComments,
      pendingWithdraws,
      pendingTakeawayAcceptance,
      readyTakeawayWithoutRider,
      riderAcceptedWithoutPickup,
      riderPickedWithoutDelivery,
      takeawayRefunds,
      pendingOrderAppeals,
    ] = await Promise.all([
      s(this.prisma.merchant.count({ where: { status: "pending" } }), 0),
      s(this.prisma.mallMerchant.count({ where: { status: "pending" } }), 0),
      s(this.prisma.mallProduct.count({ where: { status: "off_sale" } }), 0),
      s(
        this.prisma.mallOrder.count({
          where: {
            OR: [{ refundStatus: { not: "none" } }, { status: "cancelled" }],
          },
        }),
        0,
      ),
      s(this.prisma.report.count({ where: { status: "pending" } }), 0),
      s(this.prisma.mallRefund.count({ where: { status: "applying" } }), 0),
      s(
        this.prisma.paymentRefund.count({
          where: { ...paymentRefundScope, status: "pending" },
        }),
        0,
      ),
      s(this.prisma.studentVerify.count({ where: { status: "PENDING" } }), 0),
      s(this.prisma.post.count({ where: { auditStatus: "pending" } }), 0),
      s(
        this.prisma.comment.count({
          where: { auditStatus: "pending", status: { not: "deleted" } },
        }),
        0,
      ),
      s(this.prisma.withdraw.count({ where: { status: "PENDING" } }), 0),
      s(
        this.prisma.order.count({
          where: {
            status: "PAID",
            businessType: "takeaway",
            merchantAcceptTime: null,
            ...shopOrderScope,
            ...activeTakeaway,
            OR: [
              { fulfillmentStartTime: { lte: fulfillmentCutoff } },
              {
                fulfillmentStartTime: null,
                createdAt: { lte: fulfillmentCutoff },
                OR: [
                  { scheduledDeliveryTime: null },
                  { scheduledDeliveryTime: { lte: fulfillmentCutoff } },
                ],
              },
            ],
          },
        }),
        0,
      ),
      s(
        this.prisma.order.count({
          where: {
            status: "PAID",
            businessType: "takeaway",
            readyTime: { not: null, lte: fulfillmentCutoff },
            riderId: null,
            ...shopOrderScope,
            ...activeTakeaway,
          },
        }),
        0,
      ),
      s(
        this.prisma.order.count({
          where: {
            status: "SHIPPED",
            businessType: "takeaway",
            riderId: { not: null },
            pickupTime: null,
            acceptTime: { lte: riderPickupCutoff },
            ...shopOrderScope,
            ...activeTakeaway,
          },
        }),
        0,
      ),
      s(
        this.prisma.order.count({
          where: {
            status: "SHIPPED",
            businessType: "takeaway",
            pickupTime: { not: null, lte: riderDeliveryCutoff },
            deliverTime: null,
            ...shopOrderScope,
            ...activeTakeaway,
          },
        }),
        0,
      ),
      s(
        this.prisma.order.count({
          where: {
            ...shopOrderScope,
            OR: [{ status: "REFUNDING" as any }, { refundStatus: "refunding" }],
          },
        }),
        0,
      ),
      s(this.prisma.orderAppeal.count({ where: pendingOrderAppealWhere }), 0),
    ]);
    return {
      pendingCerts,
      pendingMerchants: pendingMerchants + pendingMallMerchants,
      pendingProducts,
      abnormalOrders,
      pendingReports,
      pendingPosts,
      pendingComments,
      pendingWithdraws,
      takeawayFulfillmentAlerts:
        pendingTakeawayAcceptance +
        readyTakeawayWithoutRider +
        riderAcceptedWithoutPickup +
        riderPickedWithoutDelivery,
      pendingRefunds: pendingRefunds + pendingPaymentRefunds + takeawayRefunds,
      pendingOrderAppeals,
    };
  }

  /** 订单来源分布 — 没有单独 source 字段时，按真实业务订单表聚合 */
  async getDashboardOrderSources() {
    const s = async <T>(p: Promise<T>, f: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return f;
      }
    };
    const [
      localOrders,
      mallOrders,
      errandOrders,
      deliveryOrders,
      groupBuyOrders,
    ] = await Promise.all([
      s(this.prisma.order.count(), 0),
      s(this.prisma.mallOrder.count(), 0),
      s(this.prisma.errandOrder.count(), 0),
      s(this.prisma.deliveryOrder.count(), 0),
      s(this.prisma.groupBuyOrder.count(), 0),
    ]);
    const rows = [
      { name: "本地商家", count: localOrders },
      { name: "商城", count: mallOrders },
      { name: "跑腿", count: errandOrders },
      { name: "配送", count: deliveryOrders },
      { name: "团购", count: groupBuyOrders },
    ].filter((item) => item.count > 0);
    const total = rows.reduce((sum, item) => sum + item.count, 0);
    return {
      total,
      sources: rows.map((item) => ({
        ...item,
        percentage: total ? Math.round((item.count / total) * 10000) / 100 : 0,
      })),
    };
  }

  /** 今日商家GMV排行 Top10 — Models: mallOrder, mallMerchant */
  async getDashboardMerchantRank() {
    try {
      const today = this.getTodayStart();
      const orders = await this.prisma.mallOrder.groupBy({
        by: ["merchantId"],
        where: { createdAt: { gte: today } },
        _sum: { payAmount: true },
        _count: { id: true },
        orderBy: { _sum: { payAmount: "desc" } },
        take: 10,
      });
      const ids = orders.map((o) => o.merchantId);
      const merchants = ids.length
        ? await this.prisma.mallMerchant.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
      const nameMap = new Map(merchants.map((m) => [m.id, m.name]));
      return {
        rank: orders.map((o) => ({
          name: nameMap.get(o.merchantId) || "Unknown",
          orders: o._count.id,
          gmv: Math.round(Number(o._sum.payAmount || 0)),
        })),
      };
    } catch {
      return { rank: [] };
    }
  }

  /** 学生认证统计 — Model: studentVerify */
  async getVerificationsStats() {
    let hasError = false;
    try {
      const today = this.getTodayStart();
      const [pending, todayApproved, rejected, totalApproved] =
        await Promise.all([
          this.prisma.studentVerify
            .count({ where: { status: "PENDING" } })
            .catch((e: any) => {
              hasError = true;
              console.warn("Stats query failed:", e?.message);
              return 0;
            }),
          this.prisma.studentVerify
            .count({
              where: { status: "APPROVED", verifiedAt: { gte: today } },
            })
            .catch((e: any) => {
              hasError = true;
              console.warn("Stats query failed:", e?.message);
              return 0;
            }),
          this.prisma.studentVerify
            .count({ where: { status: "REJECTED" } })
            .catch((e: any) => {
              hasError = true;
              console.warn("Stats query failed:", e?.message);
              return 0;
            }),
          this.prisma.studentVerify
            .count({ where: { status: "APPROVED" } })
            .catch((e: any) => {
              hasError = true;
              console.warn("Stats query failed:", e?.message);
              return 0;
            }),
        ]);
      return {
        pending,
        todayApproved,
        rejected,
        totalApproved,
        _error: hasError,
      };
    } catch {
      return {
        pending: 0,
        todayApproved: 0,
        rejected: 0,
        totalApproved: 0,
        _error: true,
      };
    }
  }

  /** 内容审核统计 — Models: post, report, comment */
  async getReportsStats() {
    let hasError = false;
    try {
      const today = this.getTodayStart();
      const [
        pendingPosts,
        pendingReports,
        todayComments,
        riskContent,
        handledReports,
      ] = await Promise.all([
        this.prisma.post
          .count({ where: { auditStatus: "pending" } })
          .catch((e: any) => {
            hasError = true;
            console.warn("Stats query failed:", e?.message);
            return 0;
          }),
        this.prisma.report
          .count({ where: { status: "pending" } })
          .catch((e: any) => {
            hasError = true;
            console.warn("Stats query failed:", e?.message);
            return 0;
          }),
        this.prisma.comment
          .count({ where: { createdAt: { gte: today } } })
          .catch((e: any) => {
            hasError = true;
            console.warn("Stats query failed:", e?.message);
            return 0;
          }),
        this.prisma.post
          .count({
            where: {
              OR: [{ auditStatus: "rejected" }, { reports: { some: {} } }],
            },
          })
          .catch((e: any) => {
            hasError = true;
            console.warn("Stats query failed:", e?.message);
            return 0;
          }),
        this.prisma.report
          .count({ where: { status: { in: ["resolved", "rejected"] } } })
          .catch((e: any) => {
            hasError = true;
            console.warn("Stats query failed:", e?.message);
            return 0;
          }),
      ]);
      return {
        pendingPosts,
        pendingReports,
        todayComments,
        riskContent,
        handledReports,
        _error: hasError,
      };
    } catch {
      return {
        pendingPosts: 0,
        pendingReports: 0,
        todayComments: 0,
        riskContent: 0,
        handledReports: 0,
        _error: true,
      };
    }
  }

  /** 帖子统计 — Model: post */
  async getPostsStats() {
    try {
      const today = this.getTodayStart();
      const [totalPosts, todayPosts, pendingAudit, reportedPosts] =
        await Promise.all([
          this.prisma.post
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.post
            .count({ where: { createdAt: { gte: today } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.post
            .count({ where: { auditStatus: "pending" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.post
            .count({ where: { reports: { some: {} } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
        ]);
      return { totalPosts, todayPosts, pendingAudit, reportedPosts };
    } catch {
      return {
        totalPosts: 0,
        todayPosts: 0,
        pendingAudit: 0,
        reportedPosts: 0,
      };
    }
  }

  /** 退款统计 — Model: mallRefund */
  async getRefundsStats() {
    try {
      const today = this.getTodayStart();
      const [pendingRefunds, todayRefundAgg, approvedCount, refundedCount] =
        await Promise.all([
          this.prisma.mallRefund
            .count({ where: { status: "applying" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallRefund
            .aggregate({
              where: { createdAt: { gte: today }, status: "refunded" },
              _sum: { amount: true },
            })
            .catch(() => ({ _sum: { amount: 0 } })),
          this.prisma.mallRefund
            .count({ where: { status: "approved" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallRefund
            .count({ where: { status: "refunded" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
        ]);
      return {
        pendingRefunds,
        todayRefundAmount: Math.round(
          Number((todayRefundAgg as any)._sum?.amount || 0),
        ),
        approvedCount,
        refundedCount,
      };
    } catch {
      return {
        pendingRefunds: 0,
        todayRefundAmount: 0,
        approvedCount: 0,
        refundedCount: 0,
      };
    }
  }

  /** 订单统计 — Model: mallOrder */
  async getOrdersStats() {
    try {
      const today = this.getTodayStart();
      const [
        todayOrders,
        pendingPay,
        pendingDelivery,
        refunding,
        completed,
        abnormalOrders,
      ] = await Promise.all([
        this.prisma.mallOrder
          .count({ where: { createdAt: { gte: today } } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.mallOrder
          .count({ where: { status: "pending_pay" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.mallOrder
          .count({ where: { status: { in: ["paid", "shipped"] } } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.mallOrder
          .count({ where: { refundStatus: "refunding" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.mallOrder
          .count({ where: { status: "completed" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.mallOrder
          .count({
            where: {
              OR: [{ refundStatus: { not: "none" } }, { status: "cancelled" }],
            },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);
      return {
        todayOrders,
        pendingPay,
        pendingDelivery,
        refunding,
        completed,
        abnormalOrders,
      };
    } catch {
      return {
        todayOrders: 0,
        pendingPay: 0,
        pendingDelivery: 0,
        refunding: 0,
        completed: 0,
        abnormalOrders: 0,
      };
    }
  }

  /** 商家统计 — Model: mallMerchant */
  async getMerchantsStats() {
    try {
      const today = this.getTodayStart();
      const [totalMerchants, todayNew, active, pendingAudit, riskMerchants] =
        await Promise.all([
          this.prisma.mallMerchant
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallMerchant
            .count({ where: { createdAt: { gte: today } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallMerchant
            .count({ where: { status: "approved" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallMerchant
            .count({ where: { status: "pending" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallMerchant
            .count({ where: { rating: { lt: 3 } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
        ]);
      return { totalMerchants, todayNew, active, pendingAudit, riskMerchants };
    } catch {
      return {
        totalMerchants: 0,
        todayNew: 0,
        active: 0,
        pendingAudit: 0,
        riskMerchants: 0,
      };
    }
  }

  /** 商品统计 — Model: mallProduct */
  async getProductsStats() {
    try {
      const [totalProducts, activeProducts, pendingAudit, violationProducts] =
        await Promise.all([
          this.prisma.mallProduct
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallProduct
            .count({ where: { status: "on_sale" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallProduct
            .count({ where: { status: "off_sale" } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.mallProduct
            .count({ where: { status: { notIn: ["on_sale", "off_sale"] } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
        ]);
      return { totalProducts, activeProducts, pendingAudit, violationProducts };
    } catch {
      return {
        totalProducts: 0,
        activeProducts: 0,
        pendingAudit: 0,
        violationProducts: 0,
      };
    }
  }

  /** 区域统计 — Models: region, user, paymentOrder */
  async getRegionsStats() {
    try {
      const [totalRegions, activeRegions, totalUsers, gmvAgg] =
        await Promise.all([
          this.prisma.region
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.region
            .count({ where: { isOpen: true } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.user
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.paymentOrder
            .aggregate({ where: { status: "paid" }, _sum: { amount: true } })
            .catch(() => ({ _sum: { amount: 0 } })),
        ]);
      return {
        totalRegions,
        activeRegions,
        totalUsers,
        totalGmv: Math.round(Number((gmvAgg as any)._sum?.amount || 0)),
      };
    } catch {
      return { totalRegions: 0, activeRegions: 0, totalUsers: 0, totalGmv: 0 };
    }
  }

  /** 财务统计 — Models: paymentOrder, withdraw, paymentRefund */
  async getFinanceStats() {
    try {
      const today = this.getTodayStart();
      const [
        todayRevenueAgg,
        totalRevenueAgg,
        todayOrders,
        pendingWithdraws,
        totalRefundsAgg,
        paidOrders,
      ] = await Promise.all([
        this.prisma.paymentOrder
          .aggregate({
            where: { status: "paid", createdAt: { gte: today } },
            _sum: { amount: true },
          })
          .catch(() => ({ _sum: { amount: 0 } })),
        this.prisma.paymentOrder
          .aggregate({ where: { status: "paid" }, _sum: { amount: true } })
          .catch(() => ({ _sum: { amount: 0 } })),
        this.prisma.paymentOrder
          .count({ where: { status: "paid", createdAt: { gte: today } } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.withdraw
          .count({ where: { status: "PENDING" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.paymentRefund
          .aggregate({ where: { status: "success" }, _sum: { amount: true } })
          .catch(() => ({ _sum: { amount: 0 } })),
        this.prisma.paymentOrder
          .count({ where: { status: "paid" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);
      const todayRevenue = Math.round(
        Number((todayRevenueAgg as any)._sum?.amount || 0),
      );
      const totalRevenue = Math.round(
        Number((totalRevenueAgg as any)._sum?.amount || 0),
      );
      const totalRefunds = Math.round(
        Number((totalRefundsAgg as any)._sum?.amount || 0),
      );
      return {
        todayRevenue,
        totalRevenue,
        todayOrders,
        pendingWithdraws,
        totalRefunds,
        avgOrderValue:
          paidOrders > 0 ? Math.round(totalRevenue / paidOrders) : 0,
      };
    } catch {
      return {
        todayRevenue: 0,
        totalRevenue: 0,
        todayOrders: 0,
        pendingWithdraws: 0,
        totalRefunds: 0,
        avgOrderValue: 0,
      };
    }
  }

  /** 跑腿订单统计 — Model: errandOrder */
  async getDeliveryOrdersStats() {
    try {
      const today = this.getTodayStart();
      const overduePendingTime = new Date(Date.now() - 10 * 60 * 1000);
      const overdueRunningTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const [
        totalOrders,
        todayOrders,
        pendingAccept,
        inProgress,
        completed,
        cancelled,
        onlineRiders,
        overdue,
      ] = await Promise.all([
        this.prisma.errandOrder
          .count()
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({ where: { createdAt: { gte: today } } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({ where: { status: "pending_accept" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({
            where: { status: { in: ["accepted", "in_progress", "arrived"] } },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({ where: { status: "completed" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({ where: { status: "cancelled" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.regionRider
          .count({ where: { status: "online", verifyStatus: "approved" } })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
        this.prisma.errandOrder
          .count({
            where: {
              OR: [
                {
                  status: "pending_accept",
                  createdAt: { lte: overduePendingTime },
                },
                {
                  status: { in: ["accepted", "in_progress", "arrived"] },
                  updatedAt: { lte: overdueRunningTime },
                },
                {
                  status: "refunding",
                  updatedAt: {
                    lte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                  },
                },
              ],
            },
          })
          .catch(
            (e: any) => (console.warn("Stats query failed:", e?.message), 0),
          ),
      ]);
      return {
        totalOrders,
        todayOrders,
        pendingAccept,
        inProgress,
        completed,
        cancelled,
        onlineRiders,
        overdue,
      };
    } catch {
      return {
        totalOrders: 0,
        todayOrders: 0,
        pendingAccept: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        onlineRiders: 0,
        overdue: 0,
      };
    }
  }

  /** 文件上传统计 — Model: uploadRecord */
  async getUploadFilesStats() {
    try {
      const today = this.getTodayStart();
      const [totalFiles, todayFiles, totalSizeAgg, images, videos, others] =
        await Promise.all([
          this.prisma.uploadRecord
            .count()
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.uploadRecord
            .count({ where: { createdAt: { gte: today } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.uploadRecord
            .aggregate({ _sum: { fileSize: true } })
            .catch(() => ({ _sum: { fileSize: 0 } })),
          this.prisma.uploadRecord
            .count({ where: { fileType: { startsWith: "image" } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.uploadRecord
            .count({ where: { fileType: { startsWith: "video" } } })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
          this.prisma.uploadRecord
            .count({
              where: {
                AND: [
                  { NOT: { fileType: { startsWith: "image" } } },
                  { NOT: { fileType: { startsWith: "video" } } },
                ],
              },
            })
            .catch(
              (e: any) => (console.warn("Stats query failed:", e?.message), 0),
            ),
        ]);
      return {
        totalFiles,
        todayFiles,
        totalSize: (totalSizeAgg as any)._sum?.fileSize || 0,
        byType: { images, videos, others },
      };
    } catch {
      return {
        totalFiles: 0,
        todayFiles: 0,
        totalSize: 0,
        byType: { images: 0, videos: 0, others: 0 },
      };
    }
  }

  private resolveMerchantDeliveryMode(
    businessType: string,
    value?: string | null,
  ) {
    if (businessType === "dorm_shop") return "self_delivery";
    return "platform_rider";
  }

  private deliveryModeLabel(value?: string | null) {
    if (value === "self_delivery") return "店主自送";
    return "平台配送";
  }

  private normalizeDeliveryFee(value: any) {
    if (value === undefined || value === null || value === "") return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("配送费不能小于 0");
    }
    return Math.round(amount * 100) / 100;
  }

  private normalizeBusinessHours(value?: any) {
    const weeklyHours = this.normalizeWeeklyBusinessHours(value);
    if (weeklyHours) return weeklyHours;
    if (
      Array.isArray(value) ||
      (typeof value === "string" && value.trim().startsWith("["))
    )
      return null;
    const match = String(value || "")
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const [, startHourRaw, startMinuteRaw, endHourRaw, endMinuteRaw] = match;
    const startHour = Number(startHourRaw);
    const startMinute = Number(startMinuteRaw);
    const endHour = Number(endHourRaw);
    const endMinute = Number(endMinuteRaw);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (
      startHour < 0 ||
      startHour > 23 ||
      endHour < 0 ||
      endHour > 23 ||
      startMinute < 0 ||
      startMinute > 59 ||
      endMinute < 0 ||
      endMinute > 59 ||
      start >= end
    ) {
      return null;
    }
    return `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
  }

  private normalizeWeeklyBusinessHours(value: any): string | null {
    if (typeof value !== "string" || !value.trim().startsWith("[")) return null;
    try {
      const schedule = JSON.parse(value);
      if (!Array.isArray(schedule) || schedule.length !== 7) return null;
      const normalized = schedule.map((item, day) => {
        if (
          !Array.isArray(item) ||
          item.length !== 3 ||
          Number(item[0]) !== day
        )
          return null;
        if (item[1] === "Closed" || item[2] === "Closed") {
          return item[1] === "Closed" && item[2] === "Closed"
            ? [day, "Closed", "Closed"]
            : null;
        }
        const range = this.normalizeBusinessHours(
          `${item[1] || ""}-${item[2] || ""}`,
        );
        return range ? [day, ...range.split("-")] : null;
      });
      return normalized.every(Boolean) ? JSON.stringify(normalized) : null;
    } catch {
      return null;
    }
  }

  private assertValidBusinessHours(
    value: string | null | undefined,
    message = "营业时间格式不正确",
  ) {
    if (!this.normalizeBusinessHours(value)) {
      throw new BadRequestException(
        `${message}，格式如 09:00-22:00 或完整每周计划`,
      );
    }
  }

  private normalizeClosedNotice(value?: string | null) {
    const text = String(value || "").trim();
    return text || null;
  }

  private async assertBatchDormShopsReady(ids: string[]) {
    const dormShops = await this.prisma.merchant.findMany({
      where: { id: { in: ids }, businessType: "dorm_shop" },
      select: { name: true, businessHours: true },
    });
    const invalid = dormShops.find(
      (item) => !this.normalizeBusinessHours(item.businessHours),
    );
    if (invalid) {
      throw new BadRequestException(
        `宿舍小店「${invalid.name}」缺少营业时间，格式如 09:00-22:00`,
      );
    }
  }

  private async assertBatchDormShopsClosedNotice(
    ids: string[],
    notice?: string | null,
  ) {
    if (this.normalizeClosedNotice(notice)) return;
    const dormShop = await this.prisma.merchant.findFirst({
      where: { id: { in: ids }, businessType: "dorm_shop" },
      select: { name: true },
    });
    if (dormShop) {
      throw new BadRequestException(
        `关闭宿舍小店「${dormShop.name}」时必须填写小程序弹窗提示`,
      );
    }
  }
}
