import { ErrandService } from './errand.service';

describe('ErrandService shop delivery bridge', () => {
  it('rejects a rider taking a shop order before the merchant marks it ready', async () => {
    const order = { id: 'shop-1', riderId: null, status: 'PAID', readyTime: null, deliveryMode: 'platform_rider', merchant: {} };
    const tx: any = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
    const prisma: any = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).acceptShopOrder('shop-1', 'rider-1')).rejects.toThrow('商家尚未备餐完成');
  });

  it('does not let a rider take a shop order while its refund is processing', async () => {
    const order = { id: 'shop-1', riderId: null, status: 'PAID', readyTime: new Date(), refundStatus: 'refunding', deliveryMode: 'platform_rider', merchant: {} };
    const tx: any = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).acceptShopOrder('shop-1', 'rider-1')).rejects.toThrow('订单已被接走或状态不允许接单');
  });

  it('does not let a rider go offline while a takeaway order is being delivered', async () => {
    const prisma: any = {
      errandOrder: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(1) },
      regionRider: {
        findUnique: jest.fn().mockResolvedValue({ verifyStatus: 'approved', realName: '骑手', idCard: '110101199001010000' }),
        update: jest.fn(),
      },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.updateRiderInfo('rider-1', { status: 'offline' }))
      .rejects.toThrow('还有进行中的订单，完成后才能下线');
    expect(prisma.order.count).toHaveBeenCalledWith({ where: { riderId: 'rider-1', status: 'SHIPPED' } });
  });

  it('keeps a rider busy after marking an errand arrived when a takeaway order is still being delivered', async () => {
    const order = { id: 'errand-1', riderId: 'rider-1', status: 'in_progress', orderNo: 'ERR-1', regionId: 'region-1', type: 'pickup' };
    const tx: any = {
      errandOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: 'arrived' }),
      },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({ id: 'node-1' }) },
    };
    const prisma: any = {
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { count: jest.fn().mockResolvedValue(1) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'recordDeliveryNode').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'recordErrandLearningSnapshot').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'formatMiniOrders').mockResolvedValue([{}]);

    await (service as any).updateRiderStatusUnlocked('errand-1', 'rider-1', {
      status: 'arrived',
      proof_images: ['https://example.com/proof.jpg'],
    });

    expect(prisma.regionRider.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'busy' },
    }));
  });

  it('does not let a rider advance a run-errand order while its full refund is processing', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'errand-1', riderId: 'rider-1', status: 'accepted', refundStatus: 'refunding' }) },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).updateRiderStatusUnlocked('errand-1', 'rider-1', { status: 'in_progress' }))
      .rejects.toThrow('订单退款处理中，不能继续配送');
  });

  it('uses a refund-aware compare-and-swap when a rider advances an errand order', async () => {
    const order = { id: 'errand-1', riderId: 'rider-1', status: 'accepted', refundStatus: 'none' };
    const tx: any = { errandOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      regionRider: { findUnique: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).updateRiderStatusUnlocked('errand-1', 'rider-1', { status: 'in_progress' }))
      .rejects.toThrow('订单状态已变化，请刷新后重试');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
  });

  it('returns only unpicked errand orders to the pool and restores an idle rider to online', async () => {
    const order = { id: 'errand-1', riderId: 'rider-1', status: 'accepted', deliveryDisplayMode: 'status_nodes' };
    const tx: any = {
      errandOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, riderId: null, status: 'pending_accept' }),
      },
      order: { count: jest.fn().mockResolvedValue(0) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { errandOrder: { findUnique: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await (service as any).returnToPoolUnlocked('errand-1', 'rider-1', {});

    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'errand-1', riderId: 'rider-1', status: 'accepted', refundStatus: { notIn: ['refunding', 'refunded'] } },
    }));
    expect(tx.regionRider.updateMany).toHaveBeenCalledWith({
      where: { userId: 'rider-1', verifyStatus: 'approved', status: 'busy' }, data: { status: 'online' },
    });
  });

  it('claims a pending errand refund before calling the payment channel', async () => {
    const order = { id: 'errand-1', userId: 'user-1', riderId: null, status: 'pending_accept', refundStatus: 'none', payAmount: 8.8 };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const redis: any = { getLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(undefined) };
    const paymentService: any = { refund: jest.fn().mockResolvedValue({ success: true, status: 'processing' }) };
    const service = new ErrandService(prisma, redis, {} as any, {} as any, {} as any, paymentService, {} as any);

    await expect(service.refundOrder('errand-1', 'user-1', { reason: '临时有事' }))
      .resolves.toEqual({ success: true, message: '退款申请已提交' });

    expect(prisma.errandOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'errand-1', userId: 'user-1', status: 'pending_accept', riderId: null, refundStatus: 'none' },
      data: { refundStatus: 'refunding', refundAmount: 8.8 },
    });
    expect(paymentService.refund).toHaveBeenCalledWith(expect.objectContaining({ bizType: 'errand_order', bizId: 'errand-1', amount: 8.8 }));
  });

  it('shows a processing refund before an unassigned errand can be cancelled again', async () => {
    const prisma: any = {
      errandOrderTask: { findMany: jest.fn().mockResolvedValue([]) },
      errandItemSize: { findMany: jest.fn().mockResolvedValue([]) },
      errandPickupPoint: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const [order] = await (service as any).formatMiniOrders([{
      id: 'errand-1', orderNo: 'ERR-1', type: 'pickup', status: 'pending_accept', refundStatus: 'refunding',
      refundAmount: 8.8, payAmount: 8.8, tasks: [], createdAt: new Date(), updatedAt: new Date(),
    }]);

    expect(order).toEqual(expect.objectContaining({ status: 'refunding', refund_status: 'refunding', refund_amount: '8.80' }));
  });

  it('automatically starts a refund after cancelling a paid unassigned errand', async () => {
    const order = { id: 'errand-1', userId: 'user-1', status: 'pending_accept', refundStatus: 'none', payAmount: 8.8, regionId: 'region-1', type: 'pickup', orderNo: 'ERR-1' };
    const tx: any = {
      errandOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: 'cancelled', refundStatus: 'refunding' }),
      },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = { errandOrder: { findUnique: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue(undefined) };
    const paymentService: any = { refund: jest.fn().mockResolvedValue({ success: true, status: 'processing' }) };
    const service = new ErrandService(prisma, {} as any, {} as any, membershipService, {} as any, paymentService, {} as any);
    jest.spyOn(service as any, 'restoreErrandOrderCoupon').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'formatMiniOrders').mockResolvedValue([{}]);
    jest.spyOn(service as any, 'recordErrandLearningSnapshot').mockResolvedValue(undefined);

    await expect((service as any).cancelOrderUnlocked('errand-1', 'user-1', { reason: '临时有事' }))
      .resolves.toEqual(expect.objectContaining({ message: '订单已取消，退款处理中' }));

    expect(paymentService.refund).toHaveBeenCalledWith(expect.objectContaining({
      bizType: 'errand_order', bizId: 'errand-1', amount: 8.8, reason: '临时有事', operatorId: 'user-1',
    }));
  });

  it('claims the receiving rider atomically and releases the source rider after a transfer', async () => {
    const transfer = { id: 'transfer-1', orderId: 'errand-1', fromRiderId: 'rider-a', toRiderId: 'rider-b', status: 'pending' };
    const tx: any = {
      transferRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      errandOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { transferRequest: { findUnique: jest.fn().mockResolvedValue(transfer) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await (service as any).respondToTransferUnlocked('transfer-1', 'rider-b', { action: 'accept' });

    expect(tx.regionRider.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'rider-b', verifyStatus: 'approved', status: 'online' }, data: { status: 'busy' },
    });
    expect(tx.regionRider.updateMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'rider-a', verifyStatus: 'approved', status: 'busy' }, data: { status: 'online' },
    });
  });

  it('blocks and records a cross-region errand transfer attempt', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'errand-1', orderNo: 'ERR-1', riderId: 'rider-a', regionId: 'region-1', status: 'accepted',
      }) },
      regionRider: { findFirst: jest.fn().mockResolvedValue({
        id: 'region-rider-b', userId: 'rider-b', regionId: 'region-2', verifyStatus: 'approved',
      }) },
      transferRequest: { create: jest.fn() },
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
      },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.requestTransfer('errand-1', 'rider-a', { target_rider_id: 'rider-b' }))
      .rejects.toThrow('目标骑手不属于订单区域');
    expect(prisma.transferRequest.create).not.toHaveBeenCalled();
    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId: 'errand-1', orderType: 'errand', riderId: 'rider-a', eventType: 'cross_region_transfer_attempt', eventLevel: 'critical',
    }) });
  });

  it('notifies only the order merchant about rider progress', async () => {
    const notifyService = { createAndDispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new ErrandService({} as any, {} as any, notifyService as any, {} as any, {} as any, {} as any, {} as any);

    await (service as any).notifyShopMerchant({
      id: 'shop-1', orderNo: 'ORD-1', merchantId: 'merchant-1', status: 'SHIPPED',
      merchant: { userId: 'merchant-user', regionId: 'region-1' },
    }, '骑手已取餐', '骑手已取餐，正在配送');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'merchant-user', scene: 'takeaway_rider_status',
      data: expect.objectContaining({ orderId: 'shop-1', status: 'SHIPPED' }),
      linkValue: '/pagesA/MerchantManagement/Order?merchant_id=merchant-1',
    }));
  });

  it('opens the exact order when notifying a buyer about rider progress', async () => {
    const notifyService = { createAndDispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new ErrandService({} as any, {} as any, notifyService as any, {} as any, {} as any, {} as any, {} as any);

    await (service as any).notifyShopBuyer({
      id: 'shop-1', orderNo: 'ORD-1', userId: 'buyer-1', merchantId: 'merchant-1', status: 'SHIPPED', merchant: { regionId: 'region-1' },
    }, '骑手已取餐', '骑手已取餐，正在配送');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'buyer-1', scene: 'takeaway_delivery_status',
      linkValue: '/pagesA/order/order-detail/order-detail?id=shop-1',
    }));
  });

  it('enables live tracking only when an official rider takes a takeaway order', async () => {
    const order = { id: 'shop-1', riderId: null, status: 'PAID', readyTime: new Date(), refundStatus: 'partial', deliveryMode: 'platform_rider', merchant: {}, user: {}, items: [] };
    const tx: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, riderId: 'rider-1', status: 'SHIPPED' }) },
      regionRider: { findUnique: jest.fn().mockResolvedValue({ userId: 'rider-1', riderType: 'official', verifyStatus: 'approved', status: 'online', regionId: null }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLog: { create: jest.fn() }, deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)), regionRider: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'notifyShopBuyer').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'formatShopOrdersForRider').mockResolvedValue([{}]);

    await (service as any).acceptShopOrder('shop-1', 'rider-1');

    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        refundStatus: { notIn: ['refunding', 'refunded'] },
        readyTime: { not: null },
        OR: [{ fulfillmentStartTime: null }, { fulfillmentStartTime: { lte: expect.any(Date) } }],
      }),
    }));
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveryDisplayMode: 'live_map' }) }));
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ displayMode: 'live_map' }) }));
  });

  it('rejects a second concurrent shop-order claim when the rider is no longer online', async () => {
    const order = { id: 'shop-1', riderId: null, status: 'PAID', readyTime: new Date(), refundStatus: 'none', deliveryMode: 'platform_rider', merchant: {}, user: {}, items: [] };
    const tx: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, riderId: 'rider-1', status: 'SHIPPED' }) },
      regionRider: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'rider-1', riderType: 'official', verifyStatus: 'approved', status: 'online', regionId: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orderLog: { create: jest.fn() }, deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).acceptShopOrder('shop-1', 'rider-1')).rejects.toThrow('骑手状态已变化，请刷新后再接单');
    expect(tx.regionRider.updateMany).toHaveBeenCalledWith({
      where: { userId: 'rider-1', verifyStatus: 'approved', status: 'online' }, data: { status: 'busy' },
    });
  });

  it('rejects a concurrent approved-rider errand claim when the rider is no longer online', async () => {
    const order = { id: 'errand-1', status: 'pending_accept', riderId: null, refundStatus: 'partial', regionId: 'region-1', receiverType: 'approved_rider', type: 'pickup', tasks: [] };
    const tx: any = {
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, riderId: 'rider-1', status: 'accepted' }),
      },
      regionRider: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'rider-1', riderType: 'official', verifyStatus: 'approved', status: 'online', regionId: 'region-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'errand-1' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getOrderTakingPolicy').mockResolvedValue({});
    jest.spyOn(service as any, 'getRiderDispatchContext').mockResolvedValue({ activeOrdersCount: 0 });
    jest.spyOn(service as any, 'recordDeliveryNode').mockResolvedValue(undefined);

    await expect((service as any).acceptOrderUnlocked('errand-1', 'rider-1')).rejects.toThrow('骑手状态已变化，请刷新后再接单');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
    expect(tx.regionRider.updateMany).toHaveBeenCalledWith({
      where: { userId: 'rider-1', verifyStatus: 'approved', status: 'online' }, data: { status: 'busy' },
    });
  });

  it('records pickup only once for the rider who accepted the shop order', async () => {
    const order = { id: 'shop-1', riderId: 'rider-1', status: 'SHIPPED', pickupTime: null };
    const tx: any = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, pickupTime: new Date(), merchant: {}, user: {}, items: [] }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      errandOrder: { findUnique: jest.fn() },
      regionRider: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await (service as any).updateShopOrderRiderStatus('shop-1', 'rider-1', 'in_progress', { lat: 30.1, lng: 120.1, address: '食堂一楼', proof_images: ['/proof.jpg'] });

    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shop-1', riderId: 'rider-1', status: 'SHIPPED', pickupTime: null, refundStatus: { notIn: ['refunding', 'refunded'] } },
      data: expect.objectContaining({ pickupTime: expect.any(Date) }),
    }));
    expect(tx.orderLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RIDER_PICKED_UP' }) }));
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lat: 30.1, lng: 120.1, address: '食堂一楼', proofImages: ['/proof.jpg'] }) }));
  });

  it('does not let a rider advance a shop order while a full refund is processing', async () => {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: 'shop-1', riderId: 'rider-1', status: 'SHIPPED', refundStatus: 'refunding' }) },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect((service as any).updateShopOrderRiderStatus('shop-1', 'rider-1', 'in_progress'))
      .rejects.toThrow('订单退款处理中，不能继续配送');
  });

  it('gives riders the merchant contact and correct map coordinates for a takeaway order', async () => {
    const prisma: any = { regionRider: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const [row] = await (service as any).formatShopOrdersForRider([{
      id: 'shop-1', orderNo: 'ORD-1', businessType: 'takeaway', deliveryMode: 'platform_rider', status: 'PAID', payAmount: 20, freightAmount: 2,
      createdAt: new Date(), merchant: { name: '测试商家', address: '食堂一楼', phone: '13800000000', latitude: 30.5728, longitude: 114.2301 }, user: {}, items: [],
    }]);

    expect(row).toMatchObject({ merchant_name: '测试商家', merchant_address: '食堂一楼', merchant_phone: '13800000000', latitude: 30.5728, longitude: 114.2301 });
  });

  it('marks a full-refund shop delivery as paused for its assigned rider', async () => {
    const prisma: any = { regionRider: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const [row] = await (service as any).formatShopOrdersForRider([{
      id: 'shop-1', orderNo: 'ORD-1', businessType: 'takeaway', deliveryMode: 'platform_rider', status: 'SHIPPED', refundStatus: 'refunding', refundAmount: 20,
      payAmount: 20, freightAmount: 2, createdAt: new Date(), merchant: {}, user: {}, items: [],
    }]);

    expect(row).toMatchObject({ status: 'refunding', refund_status: 'refunding', refund_amount: '20.00' });
  });
});
