import { errandCampaignDayKey, releaseErrandCampaignBudget } from './errand-transaction-guards';

/** Must run inside the cancellation/refund transaction. */
export async function restoreErrandOrderCoupon(tx: any, order: { id: string; userId: string; orderNo: string }) {
  let couponReceiveId: string | null = null;
  const usedCoupon = await tx.couponReceive.findFirst({
    where: { userId: order.userId, orderNo: order.orderNo, status: 'used' },
  });
  if (usedCoupon) {
    // Include the order binding: a delayed refund must never release a coupon reused on another order.
    const released = await tx.couponReceive.updateMany({
      where: { id: usedCoupon.id, userId: order.userId, orderNo: order.orderNo, status: 'used' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
    if (released.count > 0) {
      couponReceiveId = usedCoupon.id;
      await tx.coupon.update({
        where: { id: usedCoupon.couponId },
        data: { usedCount: { decrement: 1 } },
      });
    }
  }

  // Each ledger is claimed separately so repeated callbacks release its campaign budget only once.
  const ledgers = await tx.subsidyLedger.findMany({
    where: { sourceType: 'coupon', orderType: 'errand_order', orderId: order.id, status: { not: 'cancelled' } },
    select: { id: true, campaignId: true, userId: true, amount: true, createdAt: true },
  });
  for (const ledger of ledgers) {
    const cancelled = await tx.subsidyLedger.updateMany({
      where: { id: ledger.id, status: { not: 'cancelled' } },
      data: { status: 'cancelled' },
    });
    if (cancelled.count > 0 && ledger.campaignId) {
      await releaseErrandCampaignBudget(tx, {
        campaignId: ledger.campaignId,
        userId: ledger.userId || order.userId,
        amount: Number(ledger.amount || 0),
        dayKey: errandCampaignDayKey(ledger.createdAt),
      });
    }
  }
  return { couponReceiveId };
}
