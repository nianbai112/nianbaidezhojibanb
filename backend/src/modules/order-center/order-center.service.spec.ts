import { OrderCenterService } from './order-center.service';

describe('OrderCenterService fulfillment alerts', () => {
  const superScope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) };

  it('returns delivery coordinates and proof images to authorized operators', async () => {
    const createdAt = new Date('2026-07-17T12:00:00.000Z');
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', businessType: 'takeaway', deliveryMode: 'rider_delivery', user: {}, merchant: {}, items: [] }) },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([{ id: 'node-1', nodeType: 'arrived', lat: 30.123456, lng: 120.654321, proofImages: ['/proof.jpg'], createdAt }]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrderCenterService(prisma, superScope);

    const detail = await service.getOrderDetail('order-1', 'order');

    expect(detail).toMatchObject({ deliveryNodes: [{ lat: 30.123456, lng: 120.654321, proofImages: ['/proof.jpg'] }] });
    expect(prisma.deliveryOrderNode.findMany).toHaveBeenCalledWith({ where: { orderId: 'order-1', orderType: 'shop' }, orderBy: { createdAt: 'asc' } });
  });

  it('never exposes the raw dorm-shop receipt code to admin order detail', async () => {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', orderNo: 'DORM-1', businessType: 'dorm_shop', deliveryMode: 'self_delivery',
        status: 'COMPLETED', deliveryReceiptCode: '123456', deliveryCodeAttempts: 1, deliveryCodeLockedAt: null,
        user: {}, merchant: {}, items: [],
        shopDeliveryAssignment: {
          id: 'assignment-1', assigneeType: 'staff', source: 'auto', status: 'delivered', attemptNo: 2,
          assignee: { id: 'user-2', nickname: '店员A', phone: '13800138000' },
        },
        orderLogs: [{ id: 'log-1', action: 'DELIVERED_BY_CODE', operatorType: 'merchant_staff', remark: '收货码已验证', createdAt: new Date() }],
      }) },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrderCenterService(prisma, superScope);

    const detail = await service.getOrderDetail('order-1', 'order');

    expect(detail.deliveryReceiptCode).toBeUndefined();
    expect(detail.receiptVerification).toEqual({ method: 'receipt_code', verified: true, attempts: 1, locked: false });
    expect(detail.deliveryAssignment).toMatchObject({ source: 'auto', assignee: { phone: '138****8000' } });
  });

  it('blocks an admin from disabling staff after pickup', async () => {
    const scopedAdmin: any = {
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }),
      assertRegionAccess: jest.fn().mockResolvedValue(undefined),
    };
    const prisma: any = {
      merchantStaff: { findUnique: jest.fn().mockResolvedValue({
        id: 'staff-1', userId: 'user-2', merchantId: 'merchant-1', status: 'active', onDuty: true,
        merchant: { id: 'merchant-1', name: '宿舍小店', regionId: 'region-1', businessType: 'dorm_shop', userId: 'owner-1' },
      }) },
      $transaction: jest.fn((callback: any) => callback({
        shopDeliveryAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'assignment-1', orderId: 'order-1', status: 'picked_up' }]) },
        merchantStaff: { updateMany: jest.fn() },
      })),
    };
    const service = new OrderCenterService(prisma, scopedAdmin);

    await expect(service.updateDormShopDeliveryStaffStatus('staff-1', { status: 'paused', reason: '风险处置' }, 'admin-1'))
      .rejects.toThrow('店员已取货');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('cancels unpicked assignments when an admin pauses delivery staff', async () => {
    const scopedAdmin: any = {
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }),
      assertRegionAccess: jest.fn().mockResolvedValue(undefined),
    };
    const tx: any = {
      merchantStaff: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shopDeliveryAssignment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'assignment-1', orderId: 'order-1', status: 'accepted' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      merchantStaff: { findUnique: jest.fn().mockResolvedValue({
        id: 'staff-1', userId: 'user-2', merchantId: 'merchant-1', status: 'active', onDuty: true,
        merchant: { id: 'merchant-1', name: '宿舍小店', regionId: 'region-1', businessType: 'dorm_shop', userId: 'owner-1' },
      }) },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const notifyService: any = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    const service = new OrderCenterService(prisma, scopedAdmin, notifyService);

    await expect(service.updateDormShopDeliveryStaffStatus('staff-1', { status: 'paused', reason: '账号异常' }, 'admin-1'))
      .resolves.toMatchObject({ success: true, status: 'paused', cancelledAssignments: 1 });
    expect(tx.merchantStaff.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'staff-1', status: 'active' }, data: expect.objectContaining({ status: 'paused', onDuty: false }) }));
    expect(tx.shopDeliveryAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled', cancelReason: '账号异常' }) }));
    expect(tx.orderLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SHOP_STAFF_ADMIN_CANCEL', operatorType: 'admin' }) }));
  });

  it('filters the admin delivery list to real fulfillment exceptions', async () => {
    const prisma: any = { order: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new OrderCenterService(prisma, superScope);

    await service.getOrders({ type: 'delivery', alert: 'fulfillment' });

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ refundStatus: { notIn: ['refunding', 'refunded'] } }, expect.objectContaining({ OR: expect.arrayContaining([
          expect.objectContaining({ status: 'PAID', businessType: 'takeaway', merchantAcceptTime: null, fulfillmentStartTime: { lte: expect.any(Date) } }),
          expect.objectContaining({ status: 'PAID', businessType: 'takeaway', merchantAcceptTime: null, fulfillmentStartTime: null, createdAt: { lte: expect.any(Date) } }),
          expect.objectContaining({ status: 'PAID', businessType: 'takeaway', readyTime: { not: null, lte: expect.any(Date) }, riderId: null }),
          expect.objectContaining({ status: 'SHIPPED', businessType: 'takeaway', riderId: { not: null }, pickupTime: null, acceptTime: { lte: expect.any(Date) } }),
          expect.objectContaining({ status: 'SHIPPED', businessType: 'takeaway', pickupTime: { not: null, lte: expect.any(Date) }, deliverTime: null }),
        ]) })]),
      }),
    }));
  });

  it('paginates delivery operations in the database and keeps the full alert total', async () => {
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'order-21', orderNo: 'ORD-21', businessType: 'takeaway', deliveryMode: 'platform_rider',
          status: 'PAID', refundStatus: 'none', payAmount: 20, freightAmount: 2, createdAt: new Date(), user: {}, merchant: {},
        }]),
        count: jest.fn().mockResolvedValue(67),
      },
    };
    const service = new OrderCenterService(prisma, superScope);

    const result = await service.getOrders({ type: 'delivery', page: 2, pageSize: 20, alert: 'fulfillment' });

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(prisma.order.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
    expect(result).toEqual(expect.objectContaining({ total: 67, page: 2, pageSize: 20, list: [expect.objectContaining({ id: 'order-21' })] }));
  });

  it('filters modern refund states and exposes refund context to the admin order list', async () => {
    const prisma: any = {
      order: { findMany: jest.fn().mockResolvedValue([{
        id: 'order-1', orderNo: 'ORD-1', businessType: 'takeaway', deliveryMode: 'platform_rider',
        status: 'SHIPPED', refundStatus: 'refunding', refundAmount: 12.5, payAmount: 30, freightAmount: 3,
        createdAt: new Date(), user: {}, merchant: {},
      }]) },
    };
    const service = new OrderCenterService(prisma, superScope);

    const result = await service.getOrders({ type: 'delivery', status: 'REFUNDING' });

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        { OR: [{ status: 'REFUNDING' }, { refundStatus: 'refunding' }] },
      ]) }),
    }));
    expect(result.list).toEqual([expect.objectContaining({
      status: 'SHIPPED', refundStatus: 'refunding', refundAmount: 12.5, deliveryDisplayMode: 'live_map',
    })]);
  });

  it('labels only delayed takeaway fulfillment work with an actionable reason', () => {
    const service = new OrderCenterService({} as any, superScope);
    const now = new Date('2026-07-16T12:00:00.000Z');

    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'takeaway', createdAt: new Date('2026-07-16T11:45:00.000Z'), merchantAcceptTime: null,
    }, now)).toMatchObject({ code: 'merchant_unaccepted', waitMinutes: 15 });
    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'takeaway', createdAt: new Date('2026-07-16T10:00:00.000Z'),
      fulfillmentStartTime: new Date('2026-07-16T11:45:00.000Z'), merchantAcceptTime: null,
    }, now)).toMatchObject({ code: 'merchant_unaccepted', waitMinutes: 15 });
    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'takeaway', createdAt: new Date('2026-07-16T10:00:00.000Z'),
      fulfillmentStartTime: new Date('2026-07-16T12:05:00.000Z'), merchantAcceptTime: null,
    }, now)).toBeNull();
    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'takeaway', readyTime: new Date('2026-07-16T11:45:00.000Z'), riderId: null,
    }, now)).toMatchObject({ code: 'rider_unassigned', waitMinutes: 15 });
    expect((service as any).fulfillmentAlertFor({
      status: 'SHIPPED', businessType: 'takeaway', riderId: 'rider-1', acceptTime: new Date('2026-07-16T11:40:00.000Z'), pickupTime: null,
    }, now)).toMatchObject({ code: 'rider_pickup_overdue', waitMinutes: 20 });
    expect((service as any).fulfillmentAlertFor({
      status: 'SHIPPED', businessType: 'takeaway', riderId: 'rider-1', pickupTime: new Date('2026-07-16T11:10:00.000Z'), deliverTime: null,
    }, now)).toMatchObject({ code: 'rider_delivery_overdue', waitMinutes: 50 });
    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'dorm_shop', deliveryMode: 'self_delivery', readyTime: new Date('2026-07-16T11:45:00.000Z'), riderId: null,
    }, now)).toBeNull();
    expect((service as any).fulfillmentAlertFor({
      status: 'PAID', businessType: 'takeaway', refundStatus: 'refunding', createdAt: new Date('2026-07-16T10:00:00.000Z'), merchantAcceptTime: null,
    }, now)).toBeNull();
  });

  it('returns only an overdue unpicked takeaway order to the rider pool', async () => {
    const now = Date.now();
    const tx: any = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
      errandOrder: { count: jest.fn().mockResolvedValue(0) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', businessType: 'takeaway', deliveryMode: 'platform_rider', status: 'SHIPPED', riderId: 'rider-1',
        orderNo: 'ORD-1', userId: 'buyer-1', merchantId: 'merchant-1', acceptTime: new Date(now - 20 * 60 * 1000), pickupTime: null,
        merchant: { regionId: 'region-1', userId: 'merchant-user', name: '测试商家' },
      }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const notifyService: any = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    const shopService: any = { notifyAvailableShopRiders: jest.fn().mockResolvedValue(2) };
    const service = new OrderCenterService(prisma, superScope, notifyService, shopService);

    await expect(service.releaseUnpickedRiderOrder('order-1', 'admin-1')).resolves.toMatchObject({ success: true });
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'PAID', riderId: null, acceptTime: null },
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] }, pickupTime: null, acceptTime: { lte: expect.any(Date) } }),
    }));
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nodeType: 'returned_pool' }) }));
    expect(tx.regionRider.updateMany).toHaveBeenCalledWith({
      where: { userId: 'rider-1', verifyStatus: 'approved', status: 'busy' },
      data: { status: 'online' },
    });
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'buyer-1', scene: 'takeaway_rider_reassigned' }));
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'merchant-user', scene: 'takeaway_rider_reassigned_merchant' }));
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rider-1', scene: 'takeaway_rider_assignment_released', linkValue: '/pagesA/Grab/Grab' }));
    expect(shopService.notifyAvailableShopRiders).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1', status: 'PAID', riderId: null }));
  });

  it('does not return a refunding order to the rider pool', async () => {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', businessType: 'takeaway', deliveryMode: 'platform_rider', status: 'SHIPPED', refundStatus: 'refunding', riderId: 'rider-1',
        acceptTime: new Date(Date.now() - 20 * 60 * 1000), pickupTime: null, merchant: { regionId: 'region-1' },
      }) },
      $transaction: jest.fn(),
    };
    const service = new OrderCenterService(prisma, superScope);

    await expect(service.releaseUnpickedRiderOrder('order-1', 'admin-1')).rejects.toThrow('仅能将骑手超时未取餐的外卖订单退回骑手池');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the rider busy when another delivery is still in progress after a release', async () => {
    const tx: any = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
      errandOrder: { count: jest.fn().mockResolvedValue(1) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', businessType: 'takeaway', deliveryMode: 'platform_rider', status: 'SHIPPED', riderId: 'rider-1',
        acceptTime: new Date(Date.now() - 20 * 60 * 1000), pickupTime: null, merchant: { regionId: 'region-1' },
      }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new OrderCenterService(prisma, superScope);

    await service.releaseUnpickedRiderOrder('order-1', 'admin-1');

    expect(tx.regionRider.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'busy' } }));
  });

  it('scopes takeaway lists and blocks cross-region delivery details for a regional operator', async () => {
    const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-b', businessType: 'takeaway', merchant: { regionId: 'region-b' } }),
      },
      deliveryOrderNode: { findMany: jest.fn() },
      deliveryRiskEvent: { findMany: jest.fn() },
    };
    const service = new OrderCenterService(prisma, scope);

    await service.getOrders({ type: 'delivery' }, 'admin-a');
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchant: { regionId: { in: ['region-a'] } } }),
    }));
    await expect(service.getOrderDetail('order-b', 'delivery', 'admin-a')).rejects.toThrow('无权访问该区域外卖订单');
    expect(prisma.deliveryOrderNode.findMany).not.toHaveBeenCalled();
  });
});
