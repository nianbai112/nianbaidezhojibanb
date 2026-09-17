import { repairRefundedErrandCoupon } from '../../../scripts/repair-errand-refund-coupons';

function fixture() {
  const receive: any = { id: 'receive-1', couponId: 'coupon-1', status: 'used', orderNo: 'ERR-1', userId: 'user-1', coupon: { endAt: new Date('2026-09-01') } };
  const db: any = {
    errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', orderNo: 'ERR-1', userId: 'user-1', status: 'refunded', refundStatus: 'refunded', payAmount: 8 }) },
    paymentOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', amount: 8, refundedAmount: 8 }) },
    paymentRefund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 8 } }) },
    couponReceive: {
      findFirst: jest.fn(async ({ where }: any) => Object.entries(where).every(([key, value]) => receive[key] === value) ? { ...receive } : null),
      updateMany: jest.fn(async ({ data }: any) => { Object.assign(receive, data); return { count: 1 }; }),
    },
    coupon: { update: jest.fn() },
    subsidyLedger: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async fn => fn(db)),
  };
  return { db, receive };
}

describe('historical full refund coupon repair', () => {
  it('defaults to a read-only review and preserves original expiry', async () => {
    const { db, receive } = fixture();
    expect(await repairRefundedErrandCoupon(db, 'ERR-1')).toMatchObject({
      mode: 'dry-run', action: 'restore_coupon', originalExpiry: receive.coupon.endAt,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
    expect(receive.status).toBe('used');
  });

  it.each(['partial', 'refunding', 'none'])('refuses orders with refund status %s', async refundStatus => {
    const { db } = fixture();
    db.errandOrder.findUnique.mockResolvedValue({ status: 'refunded', refundStatus });
    await expect(repairRefundedErrandCoupon(db, 'ERR-1', true)).rejects.toThrow('仅支持已全额退款');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a refunded business flag without matching successful payment refunds', async () => {
    const { db } = fixture();
    db.paymentRefund.aggregate.mockResolvedValue({ _sum: { amount: 4 } });
    await expect(repairRefundedErrandCoupon(db, 'ERR-1', true)).rejects.toThrow('成功退款记录不足');
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  it('applies once without issuing a payment refund or extending an expired coupon', async () => {
    const { db, receive } = fixture();
    const endAt = receive.coupon.endAt;
    await repairRefundedErrandCoupon(db, 'ERR-1', true);
    const second = await repairRefundedErrandCoupon(db, 'ERR-1', true);
    expect(second.action).toBe('no_used_coupon');
    expect(db.coupon.update).toHaveBeenCalledTimes(1);
    expect(receive.status).toBe('unused');
    expect(receive.orderNo).toBeNull();
    expect(receive.coupon.endAt).toEqual(endAt);
  });
});
