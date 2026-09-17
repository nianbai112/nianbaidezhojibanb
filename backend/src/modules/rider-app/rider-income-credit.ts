export type ConfirmedRiderIncomeInput = {
  orderType: "errand" | "delivery_order";
  orderId: string;
  orderNo?: string | null;
  riderId?: string | null;
  ownerUserId?: string | null;
  regionId?: string | null;
  deliveryFeeAmount: number;
  tipAmount?: number;
  platformFeeAmount?: number;
  now: Date;
};

const roundMoney = (value: unknown) =>
  Math.round(Math.max(0, Number(value || 0)) * 100) / 100;

const shanghaiDay = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  const key = `${read("year")}-${read("month")}-${read("day")}`;
  return {
    key,
    start: new Date(`${key}T00:00:00.000+08:00`),
    end: new Date(`${key}T23:59:59.999+08:00`),
  };
};

/**
 * Credits one confirmed delivery into the rider wallet and the rider's paid
 * Shanghai calendar-day settlement. The caller must run this in the same
 * database transaction that claims the order's terminal status.
 */
export async function creditConfirmedRiderIncome(
  tx: any,
  input: ConfirmedRiderIncomeInput,
) {
  if (!input.riderId) return { credited: false, reason: "missing_rider" };
  if (input.ownerUserId && input.ownerUserId === input.riderId) {
    return { credited: false, reason: "self_fulfillment_blocked" };
  }
  const deliveryFeeAmount = roundMoney(input.deliveryFeeAmount);
  const tipAmount = roundMoney(input.tipAmount);
  const grossAmount = roundMoney(deliveryFeeAmount + tipAmount);
  if (grossAmount <= 0) return { credited: false, reason: "zero_amount" };
  const platformFeeAmount = input.orderType === "errand"
    ? Math.min(grossAmount, roundMoney(input.platformFeeAmount)) : 0;
  const payableAmount = roundMoney(grossAmount - platformFeeAmount);

  // Historical orders may already belong to a manually generated PENDING or
  // CONFIRMED settlement. Never credit those again: later manual payment would
  // otherwise duplicate the rider's income.
  const existingItem = await tx.riderSettlementItem.findFirst({
    where: {
      orderType: input.orderType,
      orderId: input.orderId,
      riderId: input.riderId,
      settlement: { status: { not: "REJECTED" } },
    },
    select: { id: true, settlementId: true },
  });
  if (existingItem) {
    return { credited: false, reason: "existing_settlement_item" };
  }

  const day = shanghaiDay(input.now);
  const periodKey = `auto:daily:${input.riderId}:${day.key}`;
  const liabilities = await tx.riderLiability.findMany({
    where: { riderId: input.riderId, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  let remainingRecovery = payableAmount;
  let liabilityRecovered = 0;
  const liabilityUpdates: Array<{
    id: string;
    recoveredAmount: number;
    status: string;
  }> = [];
  for (const liability of liabilities) {
    const liabilityAmount = roundMoney(liability.amount);
    const recoveredBefore = roundMoney(liability.recoveredAmount);
    const outstanding = roundMoney(liabilityAmount - recoveredBefore);
    const recovered = Math.min(outstanding, remainingRecovery);
    if (recovered <= 0) continue;
    const recoveredAmount = roundMoney(recoveredBefore + recovered);
    liabilityUpdates.push({
      id: liability.id,
      recoveredAmount,
      status: recoveredAmount >= liabilityAmount ? "recovered" : "open",
    });
    remainingRecovery = roundMoney(remainingRecovery - recovered);
    liabilityRecovered = roundMoney(liabilityRecovered + recovered);
  }
  const netPaidAmount = roundMoney(payableAmount - liabilityRecovered);

  const settlement = await tx.riderSettlement.upsert({
    where: { periodKey },
    create: {
      settlementNo: `AUTO-${day.key.replace(/-/g, "")}-${input.riderId}`,
      riderId: input.riderId,
      regionId: input.regionId || null,
      periodStart: day.start,
      periodEnd: day.end,
      orderCount: 1,
      // Existing finance reporting treats deliveryFeeTotal as fee + tip.
      deliveryFeeTotal: payableAmount,
      rewardAmount: 0,
      penaltyAmount: 0,
      payableAmount,
      paidAmount: netPaidAmount,
      status: "PAID",
      confirmedBy: "system:auto_receipt",
      confirmedAt: input.now,
      paidBy: "system:auto_receipt",
      paidAt: input.now,
      periodKey,
      remark:
        "确认收货后按扣除平台抽成的金额自动入账；退款或申诉按既有冲正流程处理",
    },
    update: {
      orderCount: { increment: 1 },
      deliveryFeeTotal: { increment: payableAmount },
      payableAmount: { increment: payableAmount },
      paidAmount: { increment: netPaidAmount },
      paidAt: input.now,
    },
  });
  await tx.riderSettlementItem.create({
    data: {
      settlementId: settlement.id,
      orderType: input.orderType,
      orderId: input.orderId,
      riderId: input.riderId,
      deliveryFeeAmount,
      tipAmount,
      rewardAmount: 0,
      penaltyAmount: 0,
      payableAmount,
      status: "included",
    },
  });
  for (const liability of liabilityUpdates) {
    await tx.riderLiability.update({
      where: { id: liability.id },
      data: {
        recoveredAmount: liability.recoveredAmount,
        status: liability.status,
      },
    });
  }

  if (netPaidAmount > 0) {
    const wallet = await tx.wallet.upsert({
      where: { userId: input.riderId },
      create: {
        userId: input.riderId,
        balance: netPaidAmount,
        totalIn: netPaidAmount,
      },
      update: {
        balance: { increment: netPaidAmount },
        totalIn: { increment: netPaidAmount },
      },
    });
    const orderLabel =
      input.orderType === "errand" ? "跑腿订单" : "商家配送订单";
    await tx.walletTransaction.create({
      data: {
        userId: input.riderId,
        type: "COMMISSION",
        amount: netPaidAmount,
        balance: wallet.balance,
        orderNo: input.orderNo || input.orderId,
        description: `${orderLabel}完成自动入账 ${input.orderNo || input.orderId}${platformFeeAmount ? `（平台抽成 ${platformFeeAmount} 元）` : ""}${
          liabilityRecovered
            ? `（已抵扣退款负债 ${liabilityRecovered} 元）`
            : ""
        }`,
        status: "SUCCESS",
      },
    });
  }

  return {
    credited: true,
    settlementId: settlement.id,
    payableAmount,
    paidAmount: netPaidAmount,
    liabilityRecovered,
  };
}
