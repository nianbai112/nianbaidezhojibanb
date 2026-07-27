import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

const DEFAULT_BENEFITS = [
  '会员身份标识',
  '专属活动优先报名',
  '会员商品价格',
  '专属客服服务',
];

const BENEFIT_CATALOG = [
  { key: 'delivery_free_quota', name: '每月免配送费次数', category: '消费类权益', type: 'quota', unit: '次' },
  { key: 'member_coupon_monthly', name: '每月会员专属优惠券', category: '消费类权益', type: 'quota', unit: '张' },
  { key: 'mall_member_price', name: '商城/外卖会员价', category: '消费类权益', type: 'discount', unit: '折' },
  { key: 'errand_service_discount', name: '跑腿订单服务费折扣', category: '消费类权益', type: 'discount', unit: '折' },
  { key: 'refund_priority', name: '退款/售后优先处理', category: '消费类权益', type: 'flag', unit: '' },
  { key: 'post_pin_free_quota', name: '每月免费帖子置顶次数', category: '内容类权益', type: 'quota', unit: '次' },
  { key: 'content_exposure_boost', name: '发布内容轻量曝光加权', category: '内容类权益', type: 'boost', unit: '权重' },
  { key: 'comment_member_highlight', name: '评论/回复会员标识高亮', category: '内容类权益', type: 'flag', unit: '' },
  { key: 'advanced_content_tools', name: '投票/抽奖/活动高级配置', category: '内容类权益', type: 'flag', unit: '' },
  { key: 'content_audit_priority', name: '内容审核优先队列', category: '内容类权益', type: 'flag', unit: '' },
  { key: 'second_hand_refresh_quota', name: '二手商品免费刷新次数', category: '交易类权益', type: 'quota', unit: '次' },
  { key: 'second_hand_exposure_boost', name: '二手商品曝光加权', category: '交易类权益', type: 'boost', unit: '权重' },
  { key: 'second_hand_publish_limit', name: '二手商品发布数量上限提高', category: '交易类权益', type: 'limit', unit: '个' },
  { key: 'second_hand_fee_discount', name: '二手交易服务费减免', category: '交易类权益', type: 'discount', unit: '折' },
  { key: 'dispute_priority', name: '举报/纠纷优先处理', category: '交易类权益', type: 'flag', unit: '' },
  { key: 'activity_priority_join', name: '活动优先报名', category: '活动类权益', type: 'flag', unit: '' },
  { key: 'member_only_activity', name: '会员专属活动', category: '活动类权益', type: 'flag', unit: '' },
  { key: 'activity_ticket_discount', name: '活动票价折扣', category: '活动类权益', type: 'discount', unit: '折' },
  { key: 'activity_ticket_coupon_monthly', name: '每月活动报名券', category: '活动类权益', type: 'quota', unit: '张' },
  { key: 'activity_waitlist_priority', name: '活动候补优先', category: '活动类权益', type: 'flag', unit: '' },
  { key: 'member_badge', name: '会员身份标识', category: '身份类权益', type: 'flag', unit: '' },
  { key: 'profile_member_badge', name: '主页会员徽章', category: '身份类权益', type: 'flag', unit: '' },
  { key: 'message_member_badge', name: '私信/消息页会员标识', category: '身份类权益', type: 'flag', unit: '' },
  { key: 'verified_member_identity', name: '认证用户+会员组合身份', category: '身份类权益', type: 'flag', unit: '' },
];

const DEFAULT_ENTITLEMENTS = [
  { key: 'delivery_free_quota', enabled: true, quota: 4, cycle: 'monthly' },
  { key: 'member_coupon_monthly', enabled: true, quota: 2, cycle: 'monthly', amount: 5 },
  { key: 'mall_member_price', enabled: true, discountRate: 9.5 },
  { key: 'errand_service_discount', enabled: true, discountRate: 9.5 },
  { key: 'refund_priority', enabled: true, unlimited: true },
  { key: 'post_pin_free_quota', enabled: true, quota: 2, cycle: 'monthly' },
  { key: 'content_exposure_boost', enabled: true, amount: 10, unlimited: true },
  { key: 'comment_member_highlight', enabled: true, unlimited: true },
  { key: 'advanced_content_tools', enabled: true, unlimited: true },
  { key: 'content_audit_priority', enabled: true, unlimited: true },
  { key: 'second_hand_refresh_quota', enabled: true, quota: 5, cycle: 'monthly' },
  { key: 'second_hand_exposure_boost', enabled: true, amount: 10, unlimited: true },
  { key: 'second_hand_publish_limit', enabled: true, amount: 20, unlimited: true },
  { key: 'second_hand_fee_discount', enabled: true, discountRate: 9 },
  { key: 'dispute_priority', enabled: true, unlimited: true },
  { key: 'activity_priority_join', enabled: true, unlimited: true },
  { key: 'member_only_activity', enabled: true, unlimited: true },
  { key: 'activity_ticket_discount', enabled: true, discountRate: 9 },
  { key: 'activity_ticket_coupon_monthly', enabled: true, quota: 1, cycle: 'monthly' },
  { key: 'activity_waitlist_priority', enabled: true, unlimited: true },
  { key: 'member_badge', enabled: true, unlimited: true },
  { key: 'profile_member_badge', enabled: true, unlimited: true },
  { key: 'message_member_badge', enabled: true, unlimited: true },
  { key: 'verified_member_identity', enabled: true, unlimited: true },
];

const DEFAULT_DISPLAY_ITEMS = [
  {
    title: '每月会员专属优惠券',
    subtitle: '开通后自动发放，可用于平台订单抵扣',
    imageUrl: '/static/logo.jpg',
    priceText: '2张',
    originalPriceText: '每月',
    buttonText: '去查看',
    actionType: 'navigate',
    actionUrl: '/pagesA/ticket-wallet/ticket-wallet?tab=coupon',
    targetType: 'wallet_coupon',
    benefitKey: 'member_coupon_monthly',
    sortOrder: 1,
  },
  {
    title: '免配送费额度',
    subtitle: '外卖/小店订单可抵扣配送费',
    imageUrl: '/static/logo.jpg',
    priceText: '4次',
    originalPriceText: '每月',
    buttonText: '可用',
    actionType: 'switchTab',
    actionUrl: '/pages/tabbar/index/index',
    targetType: 'shop',
    benefitKey: 'delivery_free_quota',
    sortOrder: 2,
  },
  {
    title: '免费帖子置顶',
    subtitle: '内容发布后可使用会员置顶额度',
    imageUrl: '/static/logo.jpg',
    priceText: '2次',
    originalPriceText: '每月',
    buttonText: '去使用',
    actionType: 'navigate',
    actionUrl: '/pagesB/post/createPost',
    targetType: 'post',
    benefitKey: 'post_pin_free_quota',
    sortOrder: 3,
  },
  {
    title: '活动报名券',
    subtitle: '报名付费活动时可优先抵扣',
    imageUrl: '/static/logo.jpg',
    priceText: '1张',
    originalPriceText: '每月',
    buttonText: '去查看',
    actionType: 'navigate',
    actionUrl: '/pagesA/ticket-wallet/ticket-wallet?tab=benefit',
    targetType: 'wallet_benefit',
    benefitKey: 'activity_ticket_coupon_monthly',
    sortOrder: 4,
  },
];

const DEFAULT_FAQS = [
  {
    question: '会员如何续费？',
    answer: '在会员中心选择需要续费的套餐并完成支付即可。未到期会员续费后，有效期会顺延，不会覆盖当前剩余时间。',
    sortOrder: 1,
  },
  {
    question: '会员有效期如何计算？',
    answer: '会员有效期从支付成功或运营赠送成功时开始计算，到期后未使用完的月度权益会自动失效。',
    sortOrder: 2,
  },
  {
    question: '会员价格如何享受？',
    answer: '开通会员后，系统会在外卖、商城、跑腿、活动等场景自动识别会员身份，并按后台配置的权益进行优惠或抵扣。',
    sortOrder: 3,
  },
  {
    question: '如何查看权益剩余额度？',
    answer: '会员中心的“权益额度”会实时同步后台发放记录，展示当前可用次数、折扣或专属资格。',
    sortOrder: 4,
  },
];

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return this.prisma as any;
  }

  private money(value: any) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException('金额不正确');
    return Math.round(n * 100) / 100;
  }

  private normalizePlan(plan: any) {
    if (!plan) return null;
    const entitlements = this.normalizeEntitlements(plan.entitlements, plan.level || 1);
    return {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      description: plan.description || '',
      level: plan.level || 1,
      price: Number(plan.price || 0),
      originalPrice: plan.originalPrice == null ? null : Number(plan.originalPrice),
      durationDays: plan.durationDays || 30,
      benefits: Array.isArray(plan.benefits) ? plan.benefits : this.labelsFromEntitlements(entitlements),
      entitlements,
      sortOrder: plan.sortOrder || 0,
      isActive: !!plan.isActive,
    };
  }

  private catalogMap() {
    return new Map(BENEFIT_CATALOG.map((item) => [item.key, item]));
  }

  private normalizeEntitlements(value: any, level = 1) {
    const source = Array.isArray(value) && value.length ? value : DEFAULT_ENTITLEMENTS;
    return source.map((item: any) => {
      const meta = this.catalogMap().get(String(item.key));
      if (!meta) return null;
      const scale = Math.max(1, Number(level || 1));
      const quota = item.quota == null ? 0 : Math.max(0, Number(item.quota || 0));
      return {
        key: meta.key,
        name: meta.name,
        category: meta.category,
        type: meta.type,
        unit: meta.unit,
        enabled: item.enabled !== false,
        cycle: item.cycle || 'membership',
        quota: item.scaleByLevel === false ? quota : quota * scale,
        unlimited: !!item.unlimited || meta.type === 'flag' || meta.type === 'boost' || meta.type === 'limit',
        discountRate: item.discountRate == null ? null : Number(item.discountRate),
        amount: item.amount == null ? null : Number(item.amount),
        config: item.config || {},
      };
    }).filter(Boolean);
  }

  private labelsFromEntitlements(entitlements: any[]) {
    return entitlements.filter((item) => item.enabled).map((item) => item.name);
  }

  private cycleMultiplier(entitlement: any, durationDays: number) {
    if (entitlement.cycle === 'monthly') return Math.max(1, Math.ceil(Number(durationDays || 30) / 30));
    return 1;
  }

  private formatGrant(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      benefitKey: row.benefitKey,
      benefitName: row.benefitName,
      category: row.category,
      cycle: row.cycle,
      totalQuota: row.totalQuota,
      usedQuota: row.usedQuota,
      remainingQuota: row.unlimited ? -1 : Math.max(0, Number(row.totalQuota || 0) - Number(row.usedQuota || 0)),
      unlimited: row.unlimited,
      discountRate: row.discountRate == null ? null : Number(row.discountRate),
      amount: row.amount == null ? null : Number(row.amount),
      config: row.config || {},
      status: row.status,
      startedAt: row.startedAt,
      expiredAt: row.expiredAt,
    };
  }

  private normalizeMembership(row: any) {
    if (!row) return null;
    const now = Date.now();
    const expiredAt = new Date(row.expiredAt).getTime();
    return {
      id: row.id,
      planId: row.planId,
      planName: row.planName,
      level: row.level,
      status: expiredAt > now && row.status === 'active' ? 'active' : 'expired',
      startedAt: row.startedAt,
      expiredAt: row.expiredAt,
      remainingDays: Math.max(0, Math.ceil((expiredAt - now) / 86400000)),
      source: row.source,
    };
  }

  private async ensureDefaultPlans() {
    const count = await this.db().membershipPlan.count();
    if (count === 0) {
      await this.db().membershipPlan.createMany({
        data: [
          { name: '月卡会员', code: 'monthly', level: 1, price: 19.9, originalPrice: 29.9, durationDays: 30, sortOrder: 1, benefits: DEFAULT_BENEFITS, entitlements: DEFAULT_ENTITLEMENTS },
          { name: '季卡会员', code: 'quarterly', level: 2, price: 49.9, originalPrice: 89.7, durationDays: 90, sortOrder: 2, benefits: [...DEFAULT_BENEFITS, '运营活动加权展示'], entitlements: DEFAULT_ENTITLEMENTS },
          { name: '年卡会员', code: 'yearly', level: 3, price: 169, originalPrice: 358.8, durationDays: 365, sortOrder: 3, benefits: [...DEFAULT_BENEFITS, '年度专属权益'], entitlements: DEFAULT_ENTITLEMENTS },
        ],
      });
      return;
    }

    const plans = await this.db().membershipPlan.findMany({ select: { id: true, level: true, entitlements: true } });
    const stalePlans = plans.filter((plan: any) => !Array.isArray(plan.entitlements) || !plan.entitlements.length);
    await Promise.all(stalePlans.map((plan: any) => this.db().membershipPlan.update({
      where: { id: plan.id },
      data: {
        entitlements: this.normalizeEntitlements(DEFAULT_ENTITLEMENTS, plan.level || 1),
        benefits: this.labelsFromEntitlements(this.normalizeEntitlements(DEFAULT_ENTITLEMENTS, plan.level || 1)),
      },
    })));
  }

  private async ensureDefaultDisplayItems() {
    const count = await this.db().membershipDisplayItem.count();
    if (count === 0) {
      await this.db().membershipDisplayItem.createMany({
        data: DEFAULT_DISPLAY_ITEMS.map((item) => ({
          ...item,
          isEnabled: true,
          memberOnly: false,
          showWhen: 'always',
        })),
      });
      return;
    }
    await Promise.all([
      this.db().membershipDisplayItem.updateMany({
        where: { benefitKey: 'member_coupon_monthly' },
        data: {
          actionType: 'navigate',
          actionUrl: '/pagesA/ticket-wallet/ticket-wallet?tab=coupon',
          targetType: 'wallet_coupon',
          buttonText: '去查看',
        },
      }),
      this.db().membershipDisplayItem.updateMany({
        where: { benefitKey: 'activity_ticket_coupon_monthly' },
        data: {
          actionType: 'navigate',
          actionUrl: '/pagesA/ticket-wallet/ticket-wallet?tab=benefit',
          targetType: 'wallet_benefit',
          buttonText: '去查看',
        },
      }),
    ]);
  }

  private async ensureDefaultFaqs() {
    const count = await this.db().membershipFaq.count();
    if (count > 0) return;
    await this.db().membershipFaq.createMany({
      data: DEFAULT_FAQS.map((item) => ({ ...item, scene: 'miniapp', isEnabled: true })),
    });
  }

  private async ensureDefaultContent() {
    await Promise.all([
      this.ensureDefaultPlans(),
      this.ensureDefaultDisplayItems(),
      this.ensureDefaultFaqs(),
    ]);
  }

  private async ensureActiveMembershipBenefits(userId: string) {
    const membership = await this.db().userMembership.findFirst({
      where: { userId, status: 'active', expiredAt: { gt: new Date() } },
      include: { plan: true },
      orderBy: [{ level: 'desc' }, { expiredAt: 'desc' }],
    });
    if (!membership) return null;
    const count = await this.db().membershipBenefitGrant.count({ where: { membershipId: membership.id } });
    if (count === 0) {
      await this.issueBenefits(userId, membership, membership.plan || { level: membership.level, entitlements: DEFAULT_ENTITLEMENTS });
    }
    return membership;
  }

  async getActiveMembership(userId: string) {
    const row = await this.db().userMembership.findFirst({
      where: { userId, status: 'active', expiredAt: { gt: new Date() } },
      orderBy: [{ level: 'desc' }, { expiredAt: 'desc' }],
    });
    return this.normalizeMembership(row);
  }

  async getCenter(userId: string) {
    await this.ensureDefaultContent();
    await this.ensureActiveMembershipBenefits(userId);
    const [plans, membership, latestOrders, grants, displayItems, faqs] = await Promise.all([
      this.db().membershipPlan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }] }),
      this.getActiveMembership(userId),
      this.db().membershipOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.db().membershipBenefitGrant.findMany({ where: { userId, status: 'active', expiredAt: { gt: new Date() } }, orderBy: [{ category: 'asc' }, { createdAt: 'asc' }] }),
      this.db().membershipDisplayItem.findMany({ where: { isEnabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.db().membershipFaq.findMany({ where: { isEnabled: true, scene: { in: ['miniapp', 'all'] } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return {
      membership,
      plans: plans.map((p: any) => this.normalizePlan(p)),
      benefits: grants.length ? grants.map((g: any) => g.benefitName) : (membership ? DEFAULT_BENEFITS : DEFAULT_BENEFITS.slice(0, 4)),
      benefitGrants: grants.map((g: any) => this.formatGrant(g)),
      quotaCards: this.buildQuotaCards(displayItems, grants, membership),
      faqs: faqs.map((item: any) => this.formatFaq(item)),
      benefitCatalog: BENEFIT_CATALOG,
      orders: latestOrders.map((o: any) => ({ ...o, amount: Number(o.amount || 0) })),
    };
  }

  async createOrder(userId: string, dto: any) {
    await this.ensureDefaultPlans();
    const plan = await this.db().membershipPlan.findUnique({ where: { id: String(dto.planId || dto.plan_id || '') } });
    if (!plan || !plan.isActive) throw new NotFoundException('会员套餐不存在或已下架');
    const amount = Number(plan.price || 0);
    const order = await this.db().membershipOrder.create({
      data: {
        orderNo: `VIP${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        userId,
        planId: plan.id,
        planName: plan.name,
        amount,
        durationDays: plan.durationDays,
        status: 'pending',
        payChannel: amount > 0 ? null : 'free',
        payTime: amount > 0 ? null : new Date(),
      },
    });
    if (amount <= 0) await this.activateOrder(order.id, 'free');
    return { order: { ...order, amount }, bizType: 'membership_order', bizId: order.id, amount };
  }

  async getPayableOrder(orderId: string, userId: string) {
    const order = await this.db().membershipOrder.findUnique({ where: { id: orderId } });
    if (!order) return null;
    return {
      userId: order.userId,
      orderNo: order.orderNo,
      realAmount: Number(order.amount || 0),
      description: `会员开通 ${order.planName}`,
    };
  }

  async activateOrder(orderId: string, paymentNo?: string) {
    const order = await this.db().membershipOrder.findUnique({ where: { id: orderId }, include: { plan: true } });
    if (!order) return null;
    const existingMembership = await this.db().userMembership.findFirst({
      where: { userId: order.userId, source: 'order', planId: order.planId, startedAt: { gte: order.createdAt } },
    });
    if (order.status === 'paid' && existingMembership) return order;
    const now = new Date();
    const active = await this.db().userMembership.findFirst({
      where: { userId: order.userId, status: 'active', expiredAt: { gt: now } },
      orderBy: { expiredAt: 'desc' },
    });
    const start = active?.expiredAt && new Date(active.expiredAt) > now ? new Date(active.expiredAt) : now;
    const expiredAt = new Date(start.getTime() + Number(order.durationDays || 30) * 86400000);
    const membership = await this.db().$transaction(async (tx: any) => {
      await tx.membershipOrder.update({ where: { id: order.id }, data: { status: 'paid', payChannel: paymentNo === 'free' ? 'free' : 'wx_pay', paymentNo, payTime: now } });
      return tx.userMembership.create({
        data: { userId: order.userId, planId: order.planId, planName: order.planName, level: order.plan?.level || 1, startedAt: start, expiredAt, source: 'order', sourceOrderId: order.id },
      });
    });
    await this.issueBenefits(order.userId, membership, order.plan);
    return { ...order, status: 'paid', paymentNo, payTime: now };
  }

  async revokeMembershipOrder(orderId: string, reason: string, db: any = this.db()) {
    const order = await db.membershipOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('会员订单不存在');
    const membership = await db.userMembership.findFirst({ where: { sourceOrderId: order.id } });
    if (!membership) return { revoked: false, reason: 'membership_source_not_found' };

    const usedBenefitCount = await db.membershipBenefitUsage.count({
      where: { grant: { membershipId: membership.id } },
    });
    const now = new Date();
    await db.userMembership.update({
      where: { id: membership.id },
      data: { status: 'revoked', expiredAt: now },
    });
    await db.membershipBenefitGrant.updateMany({
      where: { membershipId: membership.id, status: 'active' },
      data: { status: 'revoked', expiredAt: now },
    });
    await db.couponReceive.updateMany({
      where: { userId: membership.userId, sourceMembershipId: membership.id, status: 'unused' },
      data: { status: 'expired' },
    });
    return { revoked: true, membershipId: membership.id, usedBenefitCount, reason };
  }

  async adminRevokeMembership(membershipId: string, reason: string, operatorId: string) {
    const result = await this.db().$transaction(async (tx: any) => {
      const membership = await tx.userMembership.findUnique({ where: { id: membershipId } });
      if (!membership) throw new NotFoundException('会员记录不存在');
      if (membership.status === 'revoked') return { revoked: false, reason: 'already_revoked' };
      const now = new Date();
      await tx.userMembership.update({
        where: { id: membership.id },
        data: { status: 'revoked', expiredAt: now },
      });
      await tx.membershipBenefitGrant.updateMany({
        where: { membershipId: membership.id, status: 'active' },
        data: { status: 'revoked', expiredAt: now },
      });
      await tx.couponReceive.updateMany({
        where: { userId: membership.userId, sourceMembershipId: membership.id, status: 'unused' },
        data: { status: 'expired' },
      });
      await tx.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action: 'REVOKE_MEMBERSHIP',
          module: 'membership',
          targetId: membership.id,
          targetType: 'user_membership',
          detail: { userId: membership.userId, reason: String(reason || '后台人工撤销') },
        },
      });
      return { revoked: true, membershipId: membership.id };
    });
    return { success: true, ...result };
  }

  async adminAdjustMembershipExpiry(membershipId: string, adjustmentDays: number, reason: string, operatorId: string) {
    const days = Math.trunc(Number(adjustmentDays));
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 3650) {
      throw new BadRequestException('有效期调整必须为非零整数天数，且不超过十年');
    }
    return this.db().$transaction(async (tx: any) => {
      const membership = await tx.userMembership.findUnique({ where: { id: membershipId } });
      if (!membership) throw new NotFoundException('会员记录不存在');
      const beforeExpiredAt = new Date(membership.expiredAt);
      const expiredAt = new Date(beforeExpiredAt.getTime() + days * 86400000);
      const status = expiredAt > new Date() ? 'active' : 'expired';
      await tx.userMembership.update({ where: { id: membership.id }, data: { expiredAt, status } });
      await tx.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action: 'ADJUST_MEMBERSHIP_EXPIRY',
          module: 'membership',
          targetId: membership.id,
          targetType: 'user_membership',
          detail: { userId: membership.userId, beforeExpiredAt: beforeExpiredAt.toISOString(), afterExpiredAt: expiredAt.toISOString(), adjustmentDays: days, reason: String(reason || '后台有效期调整') },
        },
      });
      return { success: true, membershipId: membership.id, adjustmentDays: days, beforeExpiredAt, expiredAt, status };
    });
  }

  /** Explicit repair for pre-sourceOrderId records. Never infers a membership from time, plan, or user alone. */
  async adminLinkHistoricalOrderMembership(orderId: string, membershipId: string, reason: string, operatorId: string) {
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) throw new BadRequestException('请填写历史订单关联原因');
    return this.db().$transaction(async (tx: any) => {
      const order = await tx.membershipOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('会员订单不存在');
      if (!['paid', 'refunding', 'refunded'].includes(order.status)) {
        throw new BadRequestException('只有已支付或退款中的历史订单可以关联会员记录');
      }
      const linked = await tx.userMembership.findFirst({ where: { sourceOrderId: order.id } });
      if (linked) throw new BadRequestException('该会员订单已经关联会员记录');
      const membership = await tx.userMembership.findUnique({ where: { id: membershipId } });
      if (!membership) throw new NotFoundException('会员记录不存在');
      if (membership.userId !== order.userId) throw new BadRequestException('会员记录必须属于该订单用户');
      if (membership.sourceOrderId) throw new BadRequestException('该会员记录已经关联其他订单');

      await tx.userMembership.update({ where: { id: membership.id }, data: { sourceOrderId: order.id } });
      let revoked = false;
      if (order.status === 'refunded') {
        const now = new Date();
        await tx.userMembership.update({ where: { id: membership.id }, data: { status: 'revoked', expiredAt: now } });
        await tx.membershipBenefitGrant.updateMany({
          where: { membershipId: membership.id, status: 'active' },
          data: { status: 'revoked', expiredAt: now },
        });
        await tx.couponReceive.updateMany({
          where: { userId: membership.userId, sourceMembershipId: membership.id, status: 'unused' },
          data: { status: 'expired' },
        });
        revoked = true;
      }
      await tx.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action: 'LINK_HISTORICAL_MEMBERSHIP_ORDER',
          module: 'membership',
          targetId: order.id,
          targetType: 'membership_order',
          detail: { membershipId: membership.id, userId: order.userId, orderStatus: order.status, reason: normalizedReason, revokedAfterLink: revoked },
        },
      });
      return { success: true, orderId: order.id, membershipId: membership.id, revokedAfterLink: revoked };
    });
  }

  async issueBenefits(userId: string, membership: any, plan: any, db: any = this.db()) {
    if (!membership) return [];
    const existing = await db.membershipBenefitGrant.count({ where: { membershipId: membership.id } });
    if (existing > 0) return [];
    const entitlements = this.normalizeEntitlements(plan?.entitlements, plan?.level || membership.level || 1).filter((item: any) => item.enabled);
    const durationDays = Math.max(1, Math.ceil((new Date(membership.expiredAt).getTime() - new Date(membership.startedAt).getTime()) / 86400000));
    const rows = entitlements.map((item: any) => ({
      userId,
      membershipId: membership.id,
      benefitKey: item.key,
      benefitName: item.name,
      category: item.category,
      cycle: item.cycle || 'membership',
      totalQuota: item.unlimited ? 0 : Math.max(0, Number(item.quota || 0) * this.cycleMultiplier(item, durationDays)),
      usedQuota: 0,
      unlimited: item.unlimited,
      discountRate: item.discountRate,
      amount: item.amount,
      config: item.config || {},
      status: 'active',
      startedAt: membership.startedAt || new Date(),
      expiredAt: membership.expiredAt,
    }));
    if (!rows.length) return [];
    await db.membershipBenefitGrant.createMany({ data: rows });
    await this.issueCouponBenefits(userId, membership, entitlements, db);
    return rows;
  }

  private async issueCouponBenefits(userId: string, membership: any, entitlements: any[], db: any) {
    const couponEntitlement = entitlements.find((item: any) => item.key === 'member_coupon_monthly' && item.enabled);
    if (!couponEntitlement) return;
    const durationDays = Math.max(1, Math.ceil((new Date(membership.expiredAt).getTime() - new Date(membership.startedAt).getTime()) / 86400000));
    const quantity = couponEntitlement.unlimited
      ? 1
      : Math.max(0, Number(couponEntitlement.quota || 0) * this.cycleMultiplier(couponEntitlement, durationDays));
    if (quantity <= 0) return;
    const amount = this.money(couponEntitlement.amount || 5);
    const code = `MEMBER_COUPON_${amount.toFixed(2).replace('.', '_')}`;
    const now = new Date();
    const coupon = await db.coupon.upsert({
      where: { code },
      create: {
        name: `会员专属${amount}元优惠券`,
        type: 'FULL_REDUCTION',
        value: amount,
        minAmount: 0,
        totalCount: 999999,
        limitPerUser: 999999,
        startAt: now,
        endAt: new Date(now.getTime() + 3650 * 86400000),
        status: 'active',
        description: '会员套餐自动发放',
        code,
      },
      update: {
        value: amount,
        status: 'active',
        endAt: new Date(now.getTime() + 3650 * 86400000),
      },
    });
    const grant = await db.membershipBenefitGrant.findFirst({
      where: { membershipId: membership.id, benefitKey: 'member_coupon_monthly' },
      orderBy: { createdAt: 'desc' },
    });
    await db.couponReceive.createMany({
      data: Array.from({ length: quantity }).map(() => ({ couponId: coupon.id, userId, status: 'unused', sourceMembershipId: membership.id })),
    });
    await db.coupon.update({ where: { id: coupon.id }, data: { receivedCount: { increment: quantity } } });
    if (grant) {
      await db.membershipBenefitUsage.create({
        data: {
          userId,
          grantId: grant.id,
          benefitKey: grant.benefitKey,
          benefitName: grant.benefitName,
          category: grant.category,
          targetType: 'coupon',
          targetId: coupon.id,
          amount,
          quantity,
          metadata: { membershipId: membership.id, couponName: coupon.name, autoIssued: true },
        },
      });
      if (!grant.unlimited) {
        await db.membershipBenefitGrant.update({ where: { id: grant.id }, data: { usedQuota: { increment: quantity } } });
      }
    }
  }

  async getUserBenefits(userId: string) {
    await this.ensureDefaultPlans();
    await this.ensureActiveMembershipBenefits(userId);
    const [membership, grants] = await Promise.all([
      this.getActiveMembership(userId),
      this.db().membershipBenefitGrant.findMany({ where: { userId, status: 'active', expiredAt: { gt: new Date() } }, orderBy: [{ category: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return { membership, list: grants.map((g: any) => this.formatGrant(g)), catalog: BENEFIT_CATALOG };
  }

  async getActiveBenefitGrant(userId: string, benefitKey: string) {
    await this.ensureDefaultPlans();
    await this.ensureActiveMembershipBenefits(userId);
    const grant = await this.db().membershipBenefitGrant.findFirst({
      where: { userId, benefitKey, status: 'active', expiredAt: { gt: new Date() } },
      orderBy: [{ unlimited: 'desc' }, { expiredAt: 'asc' }],
    });
    return this.formatGrant(grant);
  }

  async hasBenefit(userId: string, benefitKey: string) {
    return !!(await this.getActiveBenefitGrant(userId, benefitKey));
  }

  async consumeBenefit(userId: string, benefitKey: string, dto: any = {}) {
    return this.consumeBenefitWithDb(userId, benefitKey, dto, this.db());
  }

  async consumeBenefitWithDb(userId: string, benefitKey: string, dto: any = {}, db: any = this.db()) {
    const key = String(benefitKey || dto.benefitKey || '').trim();
    if (!key) throw new BadRequestException('缺少权益类型');
    const quantity = Math.max(1, Number(dto.quantity || 1));
    const grant = await db.membershipBenefitGrant.findFirst({
      where: { userId, benefitKey: key, status: 'active', expiredAt: { gt: new Date() } },
      orderBy: [{ unlimited: 'desc' }, { expiredAt: 'asc' }],
    });
    if (!grant) throw new BadRequestException('当前会员没有该权益或权益已过期');
    // AUD-P1-054: 校验业务场景白名单，防止通用扣权益口被滥用
    const allowedBizTypes = [
      'topup', 'delivery', 'coupon', 'activity', 'activity_order', 'post', 'post_pin',
      'shop_order', 'mall_order', 'errand_order', 'content_promotion', 'dating', 'second_hand',
    ];
    const targetType = String(dto.targetType || '').trim();
    if (targetType && !allowedBizTypes.includes(targetType)) {
      throw new BadRequestException(`不支持的业务场景: ${targetType}`);
    }
    const targetId = String(dto.targetId || '').trim();
    const idempotencyKey = String(dto.idempotencyKey || (targetType && targetId ? `${grant.id}:${targetType}:${targetId}` : '')).trim() || null;
    if (idempotencyKey) {
      const existing = await db.membershipBenefitUsage.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return { usage: existing, grant: this.formatGrant(grant), duplicated: true };
      }
    }
    const run = async (tx: any) => {
      let updated = grant;
      if (!grant.unlimited) {
        const claimed = await tx.membershipBenefitGrant.updateMany({
          where: {
            id: grant.id,
            status: 'active',
            usedQuota: { lte: Number(grant.totalQuota || 0) - quantity },
          },
          data: { usedQuota: { increment: quantity } },
        });
        if (claimed.count !== 1) throw new BadRequestException('该会员权益次数不足');
        updated = await tx.membershipBenefitGrant.findUnique({ where: { id: grant.id } });
      }
      return tx.membershipBenefitUsage.create({
        data: {
          userId,
          grantId: grant.id,
          benefitKey: grant.benefitKey,
          benefitName: grant.benefitName,
          category: grant.category,
          targetType: targetType || null,
          targetId: targetId || null,
          idempotencyKey,
          amount: dto.amount == null ? null : this.money(dto.amount),
          quantity,
          metadata: dto.metadata || {},
        },
      }).then((row: any) => ({ row, grant: updated }));
    };
    try {
      const usage = typeof db.$transaction === 'function' ? await db.$transaction(run) : await run(db);
      return { usage: usage.row, grant: this.formatGrant(usage.grant) };
    } catch (error: any) {
      if (idempotencyKey && error?.code === 'P2002' && typeof db.$transaction === 'function') {
        const existing = await db.membershipBenefitUsage.findUnique({ where: { idempotencyKey } });
        if (existing) return { usage: existing, grant: this.formatGrant(grant), duplicated: true };
      }
      throw error;
    }
  }

  async restoreBenefitUsagesForTarget(targetType: string, targetId: string, db: any = this.db()) {
    const type = String(targetType || '').trim();
    const id = String(targetId || '').trim();
    if (!type || !id) return { restored: 0 };
    const usages = await db.membershipBenefitUsage.findMany({
      where: { targetType: type, targetId: id },
      orderBy: { createdAt: 'asc' },
    });
    let restored = 0;
    for (const usage of usages) {
      const metadata = usage.metadata && typeof usage.metadata === 'object' ? usage.metadata : {};
      if ((metadata as any).restoredAt) continue;
      if (usage.grantId) {
        const grant = await db.membershipBenefitGrant.findUnique({ where: { id: usage.grantId } });
        if (grant && !grant.unlimited) {
          const nextUsedQuota = Math.max(0, Number(grant.usedQuota || 0) - Number(usage.quantity || 1));
          await db.membershipBenefitGrant.update({
            where: { id: grant.id },
            data: { usedQuota: nextUsedQuota },
          });
        }
      }
      await db.membershipBenefitUsage.update({
        where: { id: usage.id },
        data: {
          metadata: {
            ...metadata,
            restoredAt: new Date().toISOString(),
            restoreReason: 'order_cancel_or_refund',
          },
        },
      }).catch(() => undefined);
      restored += 1;
    }
    return { restored };
  }

  async adminOverview(query: any = {}) {
    await this.ensureDefaultContent();
    const now = new Date();
    const [planCount, activeUsers, todayOrders, paidAgg, pendingOrders, usageCount, grantCount, topUsage] = await Promise.all([
      this.db().membershipPlan.count({ where: { isActive: true } }),
      this.db().userMembership.count({ where: { status: 'active', expiredAt: { gt: now } } }),
      this.db().membershipOrder.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      this.db().membershipOrder.aggregate({ where: { status: 'paid' }, _sum: { amount: true }, _count: true }),
      this.db().membershipOrder.count({ where: { status: 'pending' } }),
      this.db().membershipBenefitUsage.count(),
      this.db().membershipBenefitGrant.count({ where: { status: 'active', expiredAt: { gt: now } } }),
      this.db().membershipBenefitUsage.groupBy({ by: ['benefitKey', 'benefitName'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }).catch(() => []),
    ]);
    return { planCount, activeUsers, todayOrders, paidOrders: paidAgg._count || 0, revenue: Number(paidAgg._sum.amount || 0), pendingOrders, usageCount, grantCount, topUsage };
  }

  adminBenefitCatalog() {
    return { list: BENEFIT_CATALOG };
  }

  async adminGrantBenefit(dto: any, operatorId?: string) {
    const userId = String(dto.userId || dto.user_id || '').trim();
    const benefitKey = String(dto.benefitKey || dto.benefit_key || '').trim();
    const quantity = Math.max(1, Math.min(999, Number(dto.quantity || 1)));
    const durationDays = Math.max(1, Math.min(3650, Number(dto.durationDays || dto.duration_days || 30)));
    const reason = String(dto.reason || '').trim();
    if (!userId) throw new BadRequestException('用户不能为空');
    if (!benefitKey) throw new BadRequestException('请选择会员权益');
    if (!reason) throw new BadRequestException('请填写发放原因');
    const meta = BENEFIT_CATALOG.find((item) => item.key === benefitKey);
    if (!meta) throw new BadRequestException('会员权益不存在');
    const user = await this.db().user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const now = new Date();
    const expiredAt = new Date(now.getTime() + durationDays * 86400000);
    const amount = dto.amount === '' || dto.amount == null
      ? (benefitKey === 'member_coupon_monthly' ? 5 : null)
      : this.money(dto.amount);
    const quotaLike = ['quota', 'limit'].includes(meta.type);
    const grant = await this.db().membershipBenefitGrant.create({
      data: {
        userId,
        benefitKey: meta.key,
        benefitName: meta.name,
        category: meta.category,
        cycle: 'manual',
        totalQuota: quotaLike ? quantity : 0,
        usedQuota: 0,
        unlimited: !quotaLike,
        discountRate: dto.discountRate == null || dto.discountRate === '' ? null : Number(dto.discountRate),
        amount,
        config: { manualGrant: true, reason, operatorId: operatorId || null },
        status: 'active',
        startedAt: now,
        expiredAt,
      },
    });

    let coupon: any = null;
    if (benefitKey === 'member_coupon_monthly') {
      const couponAmount = this.money(amount || 5);
      const code = `MEMBER_COUPON_${couponAmount.toFixed(2).replace('.', '_')}`;
      coupon = await this.db().coupon.upsert({
        where: { code },
        create: {
          name: `会员专属${couponAmount}元优惠券`,
          type: 'FULL_REDUCTION',
          value: couponAmount,
          minAmount: 0,
          totalCount: 999999,
          limitPerUser: 999999,
          startAt: now,
          endAt: new Date(now.getTime() + 3650 * 86400000),
          status: 'active',
          description: '运营手动发放会员权益券',
          code,
        },
        update: {
          value: couponAmount,
          status: 'active',
          endAt: new Date(now.getTime() + 3650 * 86400000),
        },
      });
      await this.db().$transaction(async (tx: any) => {
        await tx.couponReceive.createMany({
          data: Array.from({ length: quantity }).map(() => ({ couponId: coupon.id, userId, status: 'unused' })),
        });
        await tx.coupon.update({ where: { id: coupon.id }, data: { receivedCount: { increment: quantity } } });
        await tx.membershipBenefitUsage.create({
          data: {
            userId,
            grantId: grant.id,
            benefitKey: grant.benefitKey,
            benefitName: grant.benefitName,
            category: grant.category,
            targetType: 'coupon',
            targetId: coupon.id,
            amount: couponAmount,
            quantity,
            metadata: { manualGrant: true, couponName: coupon.name, reason, operatorId: operatorId || null },
          },
        });
        await tx.membershipBenefitGrant.update({ where: { id: grant.id }, data: { usedQuota: { increment: quantity } } });
      });
    }

    return {
      success: true,
      grant: this.formatGrant({ ...grant, usedQuota: benefitKey === 'member_coupon_monthly' ? quantity : grant.usedQuota }),
      coupon,
    };
  }

  async adminPlans() {
    await this.ensureDefaultContent();
    const list = await this.db().membershipPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return { list: list.map((p: any) => this.normalizePlan(p)) };
  }

  async savePlan(dto: any) {
    const data = {
      name: String(dto.name || '').trim(),
      code: String(dto.code || '').trim(),
      description: dto.description || '',
      level: Number(dto.level || 1),
      price: this.money(dto.price),
      originalPrice: dto.originalPrice === '' || dto.originalPrice == null ? null : this.money(dto.originalPrice),
      durationDays: Number(dto.durationDays || dto.duration_days || 30),
      entitlements: this.normalizeEntitlements(dto.entitlements, Number(dto.level || 1)),
      benefits: Array.isArray(dto.benefits) && dto.benefits.length ? dto.benefits : this.labelsFromEntitlements(this.normalizeEntitlements(dto.entitlements, Number(dto.level || 1))),
      sortOrder: Number(dto.sortOrder || dto.sort_order || 0),
      isActive: dto.isActive !== false && dto.is_active !== false,
    };
    if (!data.name || !data.code) throw new BadRequestException('套餐名称和编码不能为空');
    const row = dto.id
      ? await this.db().membershipPlan.update({ where: { id: dto.id }, data })
      : await this.db().membershipPlan.create({ data });
    return this.normalizePlan(row);
  }

  async deletePlan(id: string) {
    const used = await this.db().membershipOrder.count({ where: { planId: id } });
    if (used > 0) {
      return this.db().membershipPlan.update({ where: { id }, data: { isActive: false } });
    }
    await this.db().membershipPlan.delete({ where: { id } });
    return { success: true };
  }

  async adminOrders(query: any = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || query.size || 20)));
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.keyword) where.OR = [{ orderNo: { contains: String(query.keyword) } }, { planName: { contains: String(query.keyword) } }];
    const [list, total] = await Promise.all([
      this.db().membershipOrder.findMany({ where, include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } }, plan: true, membership: { select: { id: true, status: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db().membershipOrder.count({ where }),
    ]);
    return { list: list.map((o: any) => ({ ...o, amount: Number(o.amount || 0) })), total, page, pageSize };
  }

  async adminUsers(query: any = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 20)));
    const where: any = query.status ? { status: query.status } : {};
    const [list, total] = await Promise.all([
      this.db().userMembership.findMany({ where, include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } }, orderBy: { expiredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db().userMembership.count({ where }),
    ]);
    return { list: list.map((m: any) => ({ ...m, membership: this.normalizeMembership(m) })), total, page, pageSize };
  }

  async adminGrant(dto: any, operatorId?: string) {
    const userId = String(dto.userId || dto.user_id || '').trim();
    if (!userId) throw new BadRequestException('缺少用户ID');
    const days = Math.max(1, Number(dto.days || 30));
    const planName = String(dto.planName || dto.plan_name || '运营赠送会员');
    const now = new Date();
    const expiredAt = new Date(now.getTime() + days * 86400000);
    const membership = await this.db().userMembership.create({
      data: { userId, planName, level: Number(dto.level || 1), startedAt: now, expiredAt, source: `grant:${operatorId || 'admin'}` },
    });
    const plan = { level: Number(dto.level || 1), entitlements: dto.entitlements || DEFAULT_ENTITLEMENTS };
    await this.issueBenefits(userId, membership, plan);
    return membership;
  }

  async adminUsage(query: any = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 20)));
    const where: any = {};
    if (query.benefitKey) where.benefitKey = String(query.benefitKey);
    if (query.userId) where.userId = String(query.userId);
    const [list, total] = await Promise.all([
      this.db().membershipBenefitUsage.findMany({ where, include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db().membershipBenefitUsage.count({ where }),
    ]);
    return { list: list.map((row: any) => ({ ...row, amount: row.amount == null ? null : Number(row.amount) })), total, page, pageSize };
  }

  private formatDisplayItem(row: any) {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      imageUrl: row.imageUrl || '/static/logo.jpg',
      priceText: row.priceText || '',
      originalPriceText: row.originalPriceText || '',
      buttonText: row.buttonText || '可用',
      actionType: row.actionType || 'navigate',
      actionUrl: row.actionUrl || '',
      targetType: row.targetType || '',
      targetId: row.targetId || '',
      benefitKey: row.benefitKey || '',
      memberOnly: !!row.memberOnly,
      showWhen: row.showWhen || 'always',
      sortOrder: row.sortOrder || 0,
      isEnabled: !!row.isEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private formatFaq(row: any) {
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      scene: row.scene || 'miniapp',
      sortOrder: row.sortOrder || 0,
      isEnabled: !!row.isEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private buildQuotaCards(displayItems: any[], grants: any[], membership: any) {
    const grantMap = new Map(grants.map((grant: any) => [grant.benefitKey, this.formatGrant(grant)]));
    return displayItems
      .map((item: any) => {
        const grant = item.benefitKey ? grantMap.get(item.benefitKey) : null;
        if (item.memberOnly && !membership && !grant) return null;
        const remaining = grant ? Number(grant.remainingQuota || 0) : 0;
        const isUnlimited = !!grant?.unlimited;
        const hasGrant = !!grant;
        let available = hasGrant && (isUnlimited || remaining > 0);
        let priceText = item.priceText || '';
        let originalPriceText = item.originalPriceText || '';
        let buttonText = item.buttonText || '可用';
        if (grant) {
          priceText = isUnlimited ? '不限' : `${Math.max(0, remaining)}/${Number(grant.totalQuota || 0)}`;
          originalPriceText = grant.discountRate ? `${Number(grant.discountRate)}折` : (grant.cycle === 'monthly' ? '每月' : '权益');
          buttonText = available ? buttonText : '已用完';
          if (item.benefitKey === 'member_coupon_monthly') {
            priceText = `${Number(grant.totalQuota || 0)}张`;
            originalPriceText = '已发放';
            buttonText = '去查看';
            available = true;
          }
        } else if (!membership) {
          buttonText = '开通';
        }
        return {
          ...this.formatDisplayItem(item),
          priceText,
          originalPriceText,
          buttonText,
          available,
          grant,
        };
      })
      .filter(Boolean);
  }

  async adminDisplayItems(query: any = {}) {
    await this.ensureDefaultDisplayItems();
    const where: any = {};
    if (query.enabled === 'true') where.isEnabled = true;
    if (query.enabled === 'false') where.isEnabled = false;
    const list = await this.db().membershipDisplayItem.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return { list: list.map((item: any) => this.formatDisplayItem(item)) };
  }

  async saveDisplayItem(dto: any) {
    const data = {
      title: String(dto.title || '').trim(),
      subtitle: dto.subtitle || '',
      imageUrl: dto.imageUrl || dto.image_url || '',
      priceText: dto.priceText || dto.price_text || '',
      originalPriceText: dto.originalPriceText || dto.original_price_text || '',
      buttonText: dto.buttonText || dto.button_text || '可用',
      actionType: dto.actionType || dto.action_type || 'navigate',
      actionUrl: dto.actionUrl || dto.action_url || '',
      targetType: dto.targetType || dto.target_type || '',
      targetId: dto.targetId || dto.target_id || '',
      benefitKey: dto.benefitKey || dto.benefit_key || '',
      memberOnly: dto.memberOnly === true || dto.member_only === true,
      showWhen: dto.showWhen || dto.show_when || 'always',
      sortOrder: Number(dto.sortOrder || dto.sort_order || 0),
      isEnabled: dto.isEnabled !== false && dto.is_enabled !== false,
    };
    if (!data.title) throw new BadRequestException('权益展示标题不能为空');
    const row = dto.id
      ? await this.db().membershipDisplayItem.update({ where: { id: dto.id }, data })
      : await this.db().membershipDisplayItem.create({ data });
    return this.formatDisplayItem(row);
  }

  async deleteDisplayItem(id: string) {
    await this.db().membershipDisplayItem.delete({ where: { id } });
    return { success: true };
  }

  async adminFaqs(query: any = {}) {
    await this.ensureDefaultFaqs();
    const where: any = {};
    if (query.scene) where.scene = String(query.scene);
    if (query.enabled === 'true') where.isEnabled = true;
    if (query.enabled === 'false') where.isEnabled = false;
    const list = await this.db().membershipFaq.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return { list: list.map((item: any) => this.formatFaq(item)) };
  }

  async saveFaq(dto: any) {
    const data = {
      question: String(dto.question || '').trim(),
      answer: String(dto.answer || '').trim(),
      scene: dto.scene || 'miniapp',
      sortOrder: Number(dto.sortOrder || dto.sort_order || 0),
      isEnabled: dto.isEnabled !== false && dto.is_enabled !== false,
    };
    if (!data.question || !data.answer) throw new BadRequestException('问题和答案不能为空');
    const row = dto.id
      ? await this.db().membershipFaq.update({ where: { id: dto.id }, data })
      : await this.db().membershipFaq.create({ data });
    return this.formatFaq(row);
  }

  async deleteFaq(id: string) {
    await this.db().membershipFaq.delete({ where: { id } });
    return { success: true };
  }
}
