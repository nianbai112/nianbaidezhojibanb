jest.mock('../errand/errand.service', () => ({ ErrandService: class {} }));
import { ErrandAdminService } from './errand-admin.service';
import { ErrandAdminController } from './errand-admin.controller';
import { AdminPermissionGuard } from '../../guards/admin.guard';

function fixture() {
  const order: any = { id: 'order-1', orderNo: 'ERR-1', userId: 'user-1', regionId: 'region-a', status: 'refunded', refundStatus: 'refunded', payAmount: 8, couponDiscount: 2 };
  const receive: any = { id: 'receive-1', couponId: 'coupon-1', userId: order.userId, orderNo: order.orderNo, status: 'used', usedAt: new Date(), coupon: { name: '跑腿优惠券', endAt: new Date('2026-01-01') } };
  const ledger: any = { id: 'ledger-1', status: 'pending', campaignId: 'campaign-1', userId: order.userId, amount: 2, createdAt: new Date('2026-09-11') };
  const db: any = {
    errandOrder: { findUnique: jest.fn(async () => ({ ...order })) },
    paymentOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', refundedAmount: 8 }) },
    paymentRefund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 8 } }) },
    couponReceive: {
      findFirst: jest.fn(async ({ where }: any) => Object.entries(where).every(([key, value]) => receive[key] === value) ? { ...receive } : null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!Object.entries(where).every(([key, value]) => receive[key] === value)) return { count: 0 };
        Object.assign(receive, data);
        return { count: 1 };
      }),
    },
    coupon: { update: jest.fn() },
    subsidyLedger: {
      findMany: jest.fn(async () => ledger.status !== 'cancelled' ? [{ ...ledger }] : []),
      updateMany: jest.fn(async ({ data }: any) => {
        if (ledger.status === 'cancelled') return { count: 0 };
        Object.assign(ledger, data);
        return { count: 1 };
      }),
    },
    marketingCampaignBudgetCounter: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    adminOperationLog: { create: jest.fn() },
    $transaction: jest.fn(async handler => handler(db)),
  };
  const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
  return { db, scope, order, receive, service: new ErrandAdminService(db, scope) };
}

describe('admin order detail coupon repair', () => {
  it('protects checking and writing with separate admin permissions', () => {
    expect(Reflect.getMetadata('admin_permissions', ErrandAdminController.prototype.getCouponRepair)).toEqual(['errand:view']);
    expect(Reflect.getMetadata('admin_permissions', ErrandAdminController.prototype.repairCoupon)).toEqual(['errand:config']);
    expect(Reflect.getMetadata('__guards__', ErrandAdminController)).toContain(AdminPermissionGuard);
  });

  it('shows the refundable coupon and expiry without changing any data', async () => {
    const { service, db } = fixture();
    const result = await service.getCouponRepair('order-1', 'admin-a');
    expect(result).toMatchObject({ eligible: true, refundedAmount: 8, coupon: { name: '跑腿优惠券', expired: true } });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  it.each(['none', 'partial', 'refunding'])('explains why refundStatus=%s cannot be repaired', async refundStatus => {
    const { service, db, order } = fixture();
    order.refundStatus = refundStatus;
    expect(await service.getCouponRepair('order-1', 'admin-a')).toMatchObject({ eligible: false, status: 'not_refunded' });
    expect(db.paymentOrder.findFirst).not.toHaveBeenCalled();
    await expect(service.repairCoupon('order-1', { note: '核实补券' }, 'admin-a')).rejects.toThrow('仅支持已全额退款');
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  it('rejects both reading and writing outside the administrator region', async () => {
    const { service, order, db } = fixture();
    order.regionId = 'region-b';
    await expect(service.getCouponRepair(order.id, 'admin-a')).rejects.toThrow('无权操作该区域');
    await expect(service.repairCoupon(order.id, { note: '核实补券' }, 'admin-a')).rejects.toThrow('无权操作该区域');
    expect(db.paymentOrder.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('requires successful refund records even when the business order says refunded', async () => {
    const { service, db } = fixture();
    db.paymentRefund.aggregate.mockResolvedValue({ _sum: { amount: 3 } });
    expect(await service.getCouponRepair('order-1', 'admin-a')).toMatchObject({ eligible: false, status: 'payment_unverified' });
    await expect(service.repairCoupon('order-1', { note: '核实补券' }, 'admin-a')).rejects.toThrow('成功退款记录不足');
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  it('revalidates after preview and refuses a payment state changed before writing', async () => {
    const { service, db } = fixture();
    expect((await service.getCouponRepair('order-1', 'admin-a')).eligible).toBe(true);
    db.paymentOrder.findFirst.mockResolvedValue(null);
    await expect(service.repairCoupon('order-1', { note: '核实补券' }, 'admin-a')).rejects.toThrow('缺少已全额退款');
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  it('restores once, returns budget once and records the operator and reason', async () => {
    const { service, db, receive } = fixture();
    const result = await service.repairCoupon('order-1', { note: '历史退款未退券' }, 'admin-a');
    expect(result.restored).toBe(true);
    expect(receive).toMatchObject({ status: 'unused', orderNo: null, usedAt: null });
    expect(db.adminOperationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      accountId: 'admin-a', action: 'RESTORE_ERRAND_COUPON', targetId: 'order-1',
      detail: { orderNo: 'ERR-1', couponReceiveId: 'receive-1', note: '历史退款未退券', refundedAmount: 8 },
    }) });
    expect((await service.repairCoupon('order-1', { note: '重试' }, 'admin-a')).restored).toBe(false);
    expect(db.coupon.update).toHaveBeenCalledTimes(1);
    expect(db.marketingCampaignBudgetCounter.updateMany).toHaveBeenCalledTimes(3);
    expect(db.adminOperationLog.create).toHaveBeenCalledTimes(1);
    expect((await service.getCouponRepair('order-1', 'admin-a')).eligible).toBe(false);
  });

  it('does not double restore or log when two administrators submit concurrently', async () => {
    const { service, db } = fixture();
    const results = await Promise.all([
      service.repairCoupon('order-1', { note: '核实补券' }, 'admin-a'),
      service.repairCoupon('order-1', { note: '核实补券' }, 'admin-b'),
    ]);
    expect(results.filter(result => result.restored)).toHaveLength(1);
    expect(db.coupon.update).toHaveBeenCalledTimes(1);
    expect(db.marketingCampaignBudgetCounter.updateMany).toHaveBeenCalledTimes(3);
    expect(db.adminOperationLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not report success when the operation audit cannot be saved', async () => {
    const { service, db } = fixture();
    db.adminOperationLog.create.mockRejectedValue(new Error('audit write failed'));
    await expect(service.repairCoupon('order-1', { note: '核实补券' }, 'admin-a')).rejects.toThrow('audit write failed');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['', '   ', 'a'.repeat(501)])('requires an audit reason within the limit', async note => {
    const { service, db } = fixture();
    await expect(service.repairCoupon('order-1', { note }, 'admin-a')).rejects.toThrow('补券说明');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
