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
  const scopes = [
    {
      scopeKey: "total",
      budget: money(campaign.totalBudget),
      usesLimit: 0,
      message: "活动总预算已不足",
    },
    {
      scopeKey: `day:${dayKey}`,
      budget: money(campaign.dailyBudget),
      usesLimit: 0,
      message: "活动今日预算已不足",
    },
    {
      scopeKey: `user:${userId}`,
      budget: money(campaign.perUserBudget),
      usesLimit: campaign.firstOrderOnly
        ? 1
        : Math.max(0, Math.floor(Number(campaign.userLimit || 0))),
      message: "已达到个人活动补贴或参与次数上限",
    },
  ];

  for (const scope of scopes) {
    const id = campaignCounterId(campaignId, scope.scopeKey);
    // The update arm is intentional: it obtains the database row lock even
    // when the counter already exists.
    const counter = await tx.marketingCampaignBudgetCounter.upsert({
      where: { id },
      create: {
        id,
        campaignId,
        scopeKey: scope.scopeKey,
        spent: 0,
        uses: 0,
        version: 1,
      },
      update: { version: { increment: 1 } },
    });
    if (scope.budget > 0 && money(counter.spent) + amount > scope.budget) {
      throw new BadRequestException(scope.message);
    }
    if (scope.usesLimit > 0 && Number(counter.uses || 0) >= scope.usesLimit) {
      throw new BadRequestException(scope.message);
    }
    const consumed = await tx.marketingCampaignBudgetCounter.updateMany({
      where: { id, version: counter.version },
      data: {
        spent: { increment: amount },
        uses: { increment: 1 },
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
