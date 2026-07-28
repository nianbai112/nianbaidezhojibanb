import { ErrandAdminService } from './errand-admin.service';

describe('ErrandAdminService closed-loop detail', () => {
  it('returns server-owned actions and financial closure evidence', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', status: 'completed', refundStatus: 'partial', riderId: 'rider-1',
        pricingSnapshot: { payAmount: 8 }, receiptConfirmedAt: new Date(), receiptConfirmedBy: 'user',
        User: {}, RegionRider: {}, tasks: [], remark: null,
      }) },
      errandItemSize: { findMany: jest.fn() },
      errandPickupPoint: { findMany: jest.fn() },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      paymentRefund: { findMany: jest.fn().mockResolvedValue([{ id: 'refund-1', status: 'success' }]) },
      riderSettlementItem: { findUnique: jest.fn().mockResolvedValue({ id: 'item-1', settlementId: 'settlement-1' }) },
      riderLiability: { findMany: jest.fn().mockResolvedValue([{ id: 'liability-1', status: 'open' }]) },
      errandReview: { findUnique: jest.fn().mockResolvedValue({ rating: 5 }) },
    };
    const detail = await new ErrandAdminService(prisma).getOrderDetail('order-1');

    expect(detail).toEqual(expect.objectContaining({
      allowedActions: { assign: false, cancel: false, retryRefund: false, handleRisk: false },
      pricingSnapshot: { payAmount: 8 },
      settlementItem: expect.objectContaining({ id: 'item-1' }),
      liabilities: [expect.objectContaining({ id: 'liability-1' })],
      review: { rating: 5 },
    }));
  });

  it('limits order lists and detail access to the administrator regions', async () => {
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-b', regionId: 'region-b', tasks: [] }),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    await service.getOrders({} as any, 'admin-a');
    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { regionId: { in: ['region-a'] } } }));
    await expect(service.getOrderDetail('order-b', 'admin-a')).rejects.toThrow('无权操作该区域跑腿订单');
  });

  it('delegates an authorized admin cancellation to the existing refund-aware order flow', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', userId: 'user-1', regionId: 'region-a', status: 'pending_accept', refundStatus: 'none',
      }) },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const errandService = { cancelOrder: jest.fn().mockResolvedValue({ success: true, message: '订单已取消，退款处理中' }) };
    const service = new ErrandAdminService(prisma, scope as any, errandService as any);

    await expect(service.cancelOrder('order-1', { reason: '平台核验取消' }, 'admin-a'))
      .resolves.toEqual(expect.objectContaining({ success: true }));
    expect(errandService.cancelOrder).toHaveBeenCalledWith('order-1', 'user-1', { reason: '平台核验取消' });
  });

  it('assigns only an available same-region rider through a guarded state transition', async () => {
    const tx: any = {
      errandOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-1', riderId: 'rider-1', status: 'accepted' }),
      },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
      regionRider: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', regionId: 'region-a', status: 'pending_accept', riderId: null, refundStatus: 'none' }) },
      regionRider: { findFirst: jest.fn().mockResolvedValue({ id: 'rr-1', userId: 'rider-1', regionId: 'region-a', verifyStatus: 'approved', status: 'online', riderType: 'part_time' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    await service.assignOrder('order-1', { riderId: 'rider-1' }, 'admin-a');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'order-1', regionId: 'region-a', status: 'pending_accept', riderId: null,
        refundStatus: { notIn: ['refunding', 'refunded'] },
      },
      data: expect.objectContaining({ riderId: 'rider-1', status: 'accepted' }),
    }));
  });

  it('returns the actionable risk reasons and closes them only inside the admin region', async () => {
    const risk = {
      id: 'risk-1', orderId: 'order-1', orderType: 'errand', eventType: 'delivery_overdue',
      eventLevel: 'error', description: '履约超时', handled: false,
    };
    const prisma: any = {
      deliveryRiskEvent: {
        findMany: jest.fn(({ where, select }: any) => {
          if (where.orderType === 'shop') return Promise.resolve([]);
          return Promise.resolve(select ? [{ orderId: 'order-1' }] : [risk]);
        }),
        findUnique: jest.fn().mockResolvedValue({ ...risk, order: undefined }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1', orderNo: 'ERR-1', regionId: 'region-a', status: 'in_progress', tasks: [] }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-1', regionId: 'region-a' }),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    const result = await service.getAbnormalOrders({} as any, 'admin-a');
    expect(result.list[0]).toEqual(expect.objectContaining({
      abnormalReason: '履约超时',
      openRiskEvents: [expect.objectContaining({ id: 'risk-1', eventType: 'delivery_overdue' })],
    }));
    await expect((service as any).handleRiskEvent('risk-1', 'admin-a')).resolves.toEqual({ success: true });
    expect(prisma.deliveryRiskEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'risk-1', handled: false },
      data: expect.objectContaining({ handled: true, handledBy: 'admin-a' }),
    }));
  });

  it('surfaces and handles rider-reported shop delivery exceptions in the abnormal order menu', async () => {
    const risk = {
      id: 'risk-shop-1', orderId: 'shop-1', orderType: 'shop', riderId: 'rider-1',
      eventType: 'cannot_contact', eventLevel: 'warning', description: '到达后多次联系不上用户',
      handled: false, createdAt: new Date('2026-07-28T10:00:00.000Z'),
    };
    const prisma: any = {
      deliveryRiskEvent: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(where.orderType === 'shop' ? [risk] : [])),
        findUnique: jest.fn().mockResolvedValue(risk),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      errandOrder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      order: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'shop-1', orderNo: 'SHOP-1', status: 'SHIPPED', riderId: 'rider-1',
          payAmount: 26, createdAt: new Date('2026-07-28T09:00:00.000Z'),
          user: { id: 'user-1', nickname: '同学甲', phone: '13800000000' },
          merchant: { id: 'merchant-1', name: '一食堂', regionId: 'region-a' },
        }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'shop-1', merchant: { regionId: 'region-a' } }),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    const result = await service.getAbnormalOrders({} as any, 'admin-a');
    expect(result).toEqual(expect.objectContaining({
      total: 1,
      list: [expect.objectContaining({
        id: 'shop-1', orderType: 'shop', orderNo: 'SHOP-1', title: '一食堂',
        abnormalReason: '到达后多次联系不上用户',
        openRiskEvents: [expect.objectContaining({ id: 'risk-shop-1', eventType: 'cannot_contact' })],
      })],
    }));
    await expect(service.handleRiskEvent('risk-shop-1', 'admin-a')).resolves.toEqual({ success: true });
  });
});
