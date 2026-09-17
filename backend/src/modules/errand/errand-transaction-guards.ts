import { BadRequestException } from "@nestjs/common";

export const ERRAND_MARKETING_HOLD_MS = 48 * 60 * 60 * 1000;

const money = (value: unknown) =>
  Math.round(Math.max(0, Number(value || 0)) * 100) / 100;

export const errandCampaignDayKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

export async function resolveActiveCouponCampaign(db: any, couponId: string) {
  const config = await db.config.findUnique({ where: { key: 'marketing_campaigns_config' } });
  const value = config?.value;
  const list = Array.isArray(value?.list) ? value.list : Array.isArray(value) ? value : [];
  const linked = list.filter((item: any) => item && String(item.couponId || '') === String(couponId));
  if (!linked.length) return null;
  const now = Date.now();
  const campaign = linked.find((item: any) => item.status === 'active' &&
    (!item.startAt || now >= new Date(item.startAt).getTime()) &&
    (!item.endAt || now <= new Date(item.endAt).getTime()));
  if (!campaign) {
    throw new BadRequestException('优惠券关联活动未开始、已结束或已停用');
  }
  return { ...campaign, id: String(campaign.id || `coupon:${couponId}`) };
}

/**
 * Serialize every assignment for one assignee inside the caller transaction.
 * This closes the "same user accepts different orders concurrently" gap that
 * an order-scoped Redis lock cannot cover.
 */
export async function lockErrandAssignee(tx: any, userId: string) {
  if (!userId) throw new BadRequestException("接单用户不能为空");
  return tx.errandAssigneeMutex.upsert({
    where: { userId },
    create: { userId, version: 1 },
    update: { version: { increment: 1 } },
  });
}

type CampaignReservation = {
  campaignId: string;
  userId: string;
  amount: number;
  dayKey: string;
};

function campaignCounterId(campaignId: string, scopeKey: string) {
  return `${campaignId}:${scopeKey}`;
}

/**
 * Lock and consume all applicable campaign counters in the order transaction.
 * A failure rolls back both the counters and the order/coupon consumption.
 */
export async function reserveErrandCampaignBudget(
  tx: any,
  campaign: any,
  userId: string,
  discountAmount: number,
  now = new Date(),
): Promise<CampaignReservation | null> {
  const amount = money(discountAmount);
  const campaignId = String(campaign?.id || "").trim();
  if (!campaignId || amount <= 0) return null;

  const dayKey = errandCampaignDayKey(now);
  const dayStart = new Date(`${dayKey}T00:00:00+08:00`);
  const scopes = [
    {
      scopeKey: "total",
      budget: money(campaign.totalBudget),
      usesLimit: 0,
      message: "活动总预算已不足",
      ledgerWhere: {},
    },
    {
      scopeKey: `day:${dayKey}`,
      budget: money(campaign.dailyBudget),
      usesLimit: 0,
      message: "活动今日预算已不足",
      ledgerWhere: { createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } },
    },
    {
      scopeKey: `user:${userId}`,
      budget: money(campaign.perUserBudget),
      usesLimit: campaign.firstOrderOnly
        ? 1
        : Math.max(0, Math.floor(Number(campaign.userLimit || 0))),
      message: "已达到个人活动补贴或参与次数上限",
      ledgerWhere: { userId },
    },
  ];

  for (const scope of scopes) {
    const id = campaignCounterId(campaignId, scope.scopeKey);
    // Both id and (campaignId, scopeKey) are unique. An upsert targeting only
    // one constraint can fail on the other when the first requests race.
    await tx.marketingCampaignBudgetCounter.createMany({
      data: [{
        id,
        campaignId,
        scopeKey: scope.scopeKey,
        spent: 0,
        uses: 0,
        version: 0,
      }],
      skipDuplicates: true,
    });
    const counter = await tx.marketingCampaignBudgetCounter.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
    // All coupon order flows hold the total row lock until commit.
    // Read committed ledgers after that lock to include legacy shop usage and
    // cancellations that predate counter maintenance.
    const ledger = await tx.subsidyLedger.aggregate({
      where: { campaignId, status: { not: 'cancelled' }, ...scope.ledgerWhere },
      _sum: { amount: true },
      _count: true,
    });
    const spent = money(ledger?._sum?.amount);
    const uses = Number(ledger?._count || 0);
    if (scope.budget > 0 && spent + amount > scope.budget) {
      throw new BadRequestException(scope.message);
    }
    if (scope.usesLimit > 0 && uses >= scope.usesLimit) {
      throw new BadRequestException(scope.message);
    }
    const consumed = await tx.marketingCampaignBudgetCounter.updateMany({
      where: { id, version: counter.version },
      data: {
        spent: money(spent + amount),
        uses: uses + 1,
      },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException("活动预算状态已变化，请重试");
    }
  }
  return { campaignId, userId, amount, dayKey };
}

/** Release a reservation once, after the subsidy ledger CAS becomes cancelled. */
export async function releaseErrandCampaignBudget(
  tx: any,
  reservation: CampaignReservation,
) {
  const scopes = [
    "total",
    `day:${reservation.dayKey}`,
    `user:${reservation.userId}`,
  ];
  for (const scopeKey of scopes) {
    await tx.marketingCampaignBudgetCounter.updateMany({
      where: {
        id: campaignCounterId(reservation.campaignId, scopeKey),
        spent: { gte: reservation.amount },
        uses: { gt: 0 },
      },
      data: {
        spent: { decrement: reservation.amount },
        uses: { decrement: 1 },
      },
    });
  }
}

export async function hasErrandMarketingBenefit(db: any, order: any) {
  if (money(order?.couponDiscount ?? order?.coupon_discount) > 0) return true;
  if (!order?.id || !db?.subsidyLedger?.findFirst) return false;
  const subsidy = await db.subsidyLedger.findFirst({
    where: {
      orderType: "errand_order",
      orderId: order.id,
      status: { not: "cancelled" },
    },
    select: { id: true },
  });
  return !!subsidy;
}

export async function findErrandSettlementBlocker(db: any, orderIds: string[]) {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (!ids.length) return null;
  const [hold, appeal, risk] = await Promise.all([
    db.errandSettlementHold.findFirst({
      where: { orderId: { in: ids }, status: { not: "released" } },
      select: { orderId: true, status: true, reasonCode: true },
    }),
    db.orderAppeal.findFirst({
      where: {
        orderId: { in: ids },
        orderType: { in: ["errand", "errand_order"] },
        status: {
          notIn: ["resolved", "rejected", "closed", "cancelled", "completed"],
        },
      },
      select: { orderId: true, status: true },
    }),
    db.deliveryRiskEvent.findFirst({
      where: {
        orderId: { in: ids },
        orderType: "errand",
        handled: false,
        eventLevel: { in: ["error", "critical"] },
      },
      select: { orderId: true, eventType: true },
    }),
  ]);
  if (hold) return { type: "hold", ...hold };
  if (appeal) return { type: "appeal", ...appeal };
  if (risk) return { type: "risk", ...risk };
  return null;
}

export async function assertCouponCampaignRules(db: any, campaign: any, userId: string, couponId: string, discountAmount: number, orderType: 'shop' | 'errand') {
  const dayStart = new Date(`${errandCampaignDayKey(new Date())}T00:00:00+08:00`);
    if (!campaign) return;
    if (campaign.firstOrderOnly) {
      const orderCount = orderType === 'errand'
        ? await db.errandOrder.count({ where: { userId, status: { notIn: ['cancelled', 'refunded'] } } })
        : await db.order.count({ where: { userId, status: { not: 'CANCELLED' } } });
      if (orderCount > 0) throw new BadRequestException(orderType === 'errand' ? '该活动仅限跑腿首单使用' : '该活动仅限首单使用');
    }
    if (campaign.newUserOnly) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
      const days = Number(campaign.newUserDays || 7);
      if (!user || Date.now() - user.createdAt.getTime() > days * 24 * 60 * 60 * 1000) {
        throw new BadRequestException('该活动仅限新用户使用');
      }
    }
    const baseWhere: any = {
      status: { not: 'cancelled' },
      OR: [
        { campaignId: campaign.id },
        { sourceType: 'coupon', sourceId: couponId },
      ],
    };
    const [totalAgg, todayAgg, userAgg] = await Promise.all([
      db.subsidyLedger.aggregate({ where: baseWhere, _sum: { amount: true } }),
      db.subsidyLedger.aggregate({ where: { ...baseWhere, createdAt: { gte: dayStart } }, _sum: { amount: true } }),
      db.subsidyLedger.aggregate({ where: { ...baseWhere, userId }, _sum: { amount: true }, _count: true }),
    ]);
    const totalSpent = Number(totalAgg?._sum?.amount || 0);
    const todaySpent = Number(todayAgg?._sum?.amount || 0);
    const userSpent = Number(userAgg?._sum?.amount || 0);
    if (Number(campaign.totalBudget || 0) > 0 && (totalSpent >= Number(campaign.totalBudget) || Math.round((totalSpent + discountAmount) * 100) > Math.round(Number(campaign.totalBudget) * 100))) {
      throw new BadRequestException('活动总预算已不足');
    }
    if (Number(campaign.dailyBudget || 0) > 0 && (todaySpent >= Number(campaign.dailyBudget) || Math.round((todaySpent + discountAmount) * 100) > Math.round(Number(campaign.dailyBudget) * 100))) {
      throw new BadRequestException('活动今日预算已不足');
    }
    if (Number(campaign.perUserBudget || 0) > 0 && (userSpent >= Number(campaign.perUserBudget) || Math.round((userSpent + discountAmount) * 100) > Math.round(Number(campaign.perUserBudget) * 100))) {
      throw new BadRequestException('已达到个人活动补贴上限');
    }
    if (Number(campaign.userLimit || 0) > 0 && Number(userAgg?._count || 0) >= Number(campaign.userLimit)) {
      throw new BadRequestException('已达到个人活动参与次数上限');
    }
}
