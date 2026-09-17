jest.mock('../errand/errand.service', () => ({ ErrandService: class {} }));

import { ErrandAdminService } from './errand-admin.service';

describe('ErrandAdminService closed-loop detail', () => {
  it('returns server-owned actions and financial closure evidence', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', status: 'completed', refundStatus: 'partial', riderId: 'rider-1',
        pricingSnapshot: { payAmount: 8 }, receiptCode: '123456', receiptConfirmedAt: new Date(), receiptConfirmedBy: 'user',
        User: {}, RegionRider: {}, tasks: [], remark: null,
      }) },
      errandItemSize: { findMany: jest.fn() },
      errandPickupPoint: { findMany: jest.fn() },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([{ nodeType: 'arrived', proofImages: ['proof.jpg'] }]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      paymentRefund: { findMany: jest.fn().mockResolvedValue([{ id: 'refund-1', status: 'success' }]) },
      riderSettlementItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item-1', settlementId: 'settlement-1' }) },
      riderLiability: { findMany: jest.fn().mockResolvedValue([{ id: 'liability-1', status: 'open' }]) },
      errandSettlementHold: { findUnique: jest.fn().mockResolvedValue(null) },
      errandReview: { findUnique: jest.fn().mockResolvedValue({ rating: 5 }) },
    };
    const detail = await new ErrandAdminService(prisma).getOrderDetail('order-1');

    expect(detail).not.toHaveProperty('receiptCode');
    expect(detail.deliveryNodes[0].proofImages).toEqual(['proof.jpg']);
    prisma.deliveryOrderNode.findMany.mockRejectedValueOnce(new Error('evidence unavailable'));
    await expect(new ErrandAdminService(prisma).getOrderDetail('order-1')).rejects.toThrow('evidence unavailable');
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

  it('returns user UID when selecting approved official riders in an admin region', async () => {
    const prisma: any = {
      regionRider: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    await service.getRiders(
      { regionId: 'region-a', riderType: 'official', auditStatus: 'approved' },
      'admin-a',
    );

    expect(prisma.regionRider.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { regionId: 'region-a', riderType: 'official', verifyStatus: 'approved' },
      include: { User: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, profile: { select: { gender: true } } } } },
    }));
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
        findUnique: jest.fn().mockResolvedValue({ id: 'order-1', userId: 'owner-1', regionId: 'region-a', status: 'pending_accept', riderId: null, refundStatus: 'none' }),
        count: jest.fn().mockResolvedValue(0),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-1', riderId: 'rider-1', status: 'accepted' }),
      },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
      regionRider: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rr-1', userId: 'rider-1', regionId: 'region-a', verifyStatus: 'approved', status: 'online', riderType: 'part_time' }),
        update: jest.fn().mockResolvedValue({}),
      },
      errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({ userId: 'rider-1', version: 1 }) },
      order: { count: jest.fn().mockResolvedValue(0) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', userId: 'owner-1', regionId: 'region-a', status: 'pending_accept', riderId: null, refundStatus: 'none' }) },
      regionRider: { findFirst: jest.fn().mockResolvedValue({ id: 'rr-1', userId: 'rider-1', regionId: 'region-a', verifyStatus: 'approved', status: 'online', riderType: 'part_time' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    await service.assignOrder('order-1', { riderId: 'rider-1' }, 'admin-a');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'order-1', regionId: 'region-a', userId: { not: 'rider-1' }, status: 'pending_accept', riderId: null,
        refundStatus: { notIn: ['refunding', 'refunded'] },
      },
      data: expect.objectContaining({ riderId: 'rider-1', status: 'accepted' }),
    }));
  });

  it('does not let an administrator assign an order to its publisher', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', orderNo: 'ERR-1', userId: 'rider-1', regionId: 'region-a', status: 'pending_accept', riderId: null,
      }) },
      regionRider: { findFirst: jest.fn().mockResolvedValue({
        id: 'rr-1', userId: 'rider-1', regionId: 'region-a', verifyStatus: 'approved', status: 'online',
      }) },
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
      },
      $transaction: jest.fn(),
    };
    const service = new ErrandAdminService(prisma);

    await expect(service.assignOrder('order-1', { riderId: 'rider-1' }))
      .rejects.toThrow('不能接自己发布的跑腿订单');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the actionable risk reasons and closes them only inside the admin region', async () => {
    const risk = {
      id: 'risk-1', orderId: 'order-1', orderType: 'errand', eventType: 'delivery_overdue',
      eventLevel: 'error', description: '履约超时', handled: false,
    };
    const updateRisk = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: any = {
      deliveryRiskEvent: {
        findMany: jest.fn(({ where, select }: any) => {
          if (where.orderType === 'shop') return Promise.resolve([]);
          return Promise.resolve(select ? [{ orderId: 'order-1' }] : [risk]);
        }),
        findUnique: jest.fn().mockResolvedValue({ ...risk, order: undefined }),
        updateMany: updateRisk,
      },
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1', orderNo: 'ERR-1', regionId: 'region-a', status: 'in_progress', tasks: [] }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-1', regionId: 'region-a' }),
      },
      $transaction: jest.fn((fn: any) => fn({
        deliveryRiskEvent: { updateMany: updateRisk },
        errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', riderId: null }) },
      })),
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    const result = await service.getAbnormalOrders({} as any, 'admin-a');
    expect(result.list[0]).toEqual(expect.objectContaining({
      abnormalReason: '履约超时',
      openRiskEvents: [expect.objectContaining({ id: 'risk-1', eventType: 'delivery_overdue' })],
    }));
    await expect(service.handleRiskEvent('risk-1', { resolution: 'release', note: '已核验履约轨迹' }, 'admin-a')).resolves.toEqual({ success: true });
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
    const updateRisk = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: any = {
      deliveryRiskEvent: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(where.orderType === 'shop' ? [risk] : [])),
        findUnique: jest.fn().mockResolvedValue(risk),
        updateMany: updateRisk,
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
      $transaction: jest.fn((fn: any) => fn({ deliveryRiskEvent: { updateMany: updateRisk } })),
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
    await expect(service.handleRiskEvent('risk-shop-1', { resolution: 'release', note: '已联系用户确认' }, 'admin-a')).resolves.toEqual({ success: true });
  });

  it('creates one rider liability when an already-paid errand is rejected by risk review', async () => {
    const risk = {
      id: 'risk-paid-1', orderId: 'order-paid-1', orderType: 'errand', riderId: 'rider-1',
      eventType: 'marketing_related_account_assignment_attempt', eventLevel: 'critical', handled: false,
    };
    const tx: any = {
      deliveryRiskEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-paid-1', riderId: 'rider-1' }) },
      errandSettlementHold: {
        findUnique: jest.fn().mockResolvedValue({ id: 'hold-1', status: 'released' }),
        upsert: jest.fn().mockResolvedValue({ id: 'hold-1', status: 'rejected' }),
      },
      riderSettlementItem: {
        findFirst: jest.fn().mockResolvedValue({ payableAmount: 6, reversalAmount: 1 }),
      },
      riderLiability: { upsert: jest.fn().mockResolvedValue({ id: 'liability-1' }) },
    };
    const prisma: any = {
      deliveryRiskEvent: { findUnique: jest.fn().mockResolvedValue(risk) },
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-paid-1', regionId: 'region-a' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new ErrandAdminService(prisma, scope as any);

    await service.handleRiskEvent('risk-paid-1', { resolution: 'reject', note: '确认关联刷单' }, 'admin-a');

    expect(tx.errandSettlementHold.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'rejected', releaseAt: null }),
    }));
    expect(tx.riderLiability.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ riderId: 'rider-1', amount: 5 }),
    }));
  });
});
