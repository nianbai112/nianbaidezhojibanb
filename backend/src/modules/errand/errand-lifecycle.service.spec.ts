import { ErrandLifecycleService } from './errand-lifecycle.service';

describe('ErrandLifecycleService', () => {
  const tx: any = {
    errandOrder: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    errandSettlementHold: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'hold-1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
    bizFeeConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    deliveryOrderNode: { create: jest.fn().mockResolvedValue({ id: 'node-1' }) },
    riderSettlement: { createMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'settlement-1' }) },
    riderSettlementItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    },
    riderLiability: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    wallet: { createMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 3 }) },
    walletTransaction: { create: jest.fn().mockResolvedValue({ id: 'wallet-tx-1' }) },
    deliveryRiskEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
    },
    subsidyLedger: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    regionRider: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma: any = {
    errandOrder: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
    orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
    errandSettlementHold: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryRiskEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
    },
    regionRider: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ realName: '测试骑手' }),
    },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const notifyService: any = {
    createAndDispatch: jest.fn().mockResolvedValue({ id: 'notification-1' }),
  };

  let service: ErrandLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.bizFeeConfig.findUnique.mockResolvedValue(null);
    prisma.errandOrder.count.mockResolvedValue(0);
    prisma.errandSettlementHold.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);
    prisma.orderAppeal.findFirst.mockResolvedValue(null);
    prisma.deliveryRiskEvent.findFirst.mockResolvedValue(null);
    tx.errandOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.errandSettlementHold.findUnique.mockResolvedValue(null);
    tx.errandSettlementHold.upsert.mockResolvedValue({ id: 'hold-1' });
    tx.errandSettlementHold.updateMany.mockResolvedValue({ count: 1 });
    tx.orderAppeal.findFirst.mockResolvedValue(null);
    tx.riderSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.riderSettlementItem.findFirst.mockResolvedValue(null);
    tx.riderLiability.findMany.mockResolvedValue([]);
    tx.riderLiability.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.findUniqueOrThrow.mockResolvedValue({ balance: 3 });
    tx.deliveryRiskEvent.findFirst.mockResolvedValue(null);
    tx.subsidyLedger.findFirst.mockResolvedValue(null);
    tx.user.findUnique.mockResolvedValue(null);
    tx.regionRider.findUnique.mockResolvedValue(null);
    notifyService.createAndDispatch.mockResolvedValue({ id: 'notification-1' });
    service = new ErrandLifecycleService(prisma);
  });

  it('never lets a rider complete an errand', async () => {
    await expect(
      service.riderTransition('order-1', 'rider-1', { status: 'completed' }),
    ).rejects.toThrow('骑手只能标记送达');
    expect(prisma.errandOrder.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { config: { enabled: true, rate: 0.05, fixedFee: 0 }, fee: 0.6, net: 11.4 },
    { config: { enabled: true, rate: 0.05, fixedFee: 1 }, fee: 1.6, net: 10.4 },
    { config: { enabled: false, rate: 0.05, fixedFee: 1 }, fee: 0, net: 12 },
    { config: null, fee: 0, net: 12 },
    { config: { enabled: true, rate: 1, fixedFee: 100 }, fee: 12, net: 0 },
  ])('deducts the receipt fee $fee before crediting $net', async ({ config, fee, net }) => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'commission-order', userId: 'owner', riderId: 'rider', regionId: 'region',
      status: 'arrived', refundStatus: 'none', price: 10, tip: 2, payAmount: 12,
    });
    tx.bizFeeConfig.findUnique.mockResolvedValue(config);
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({ id: 'commission-order', status: 'completed' });
    await service.confirmReceipt('commission-order', 'owner', 'user');
    expect(tx.errandOrder.update).toHaveBeenCalledWith({ where: { id: 'commission-order' }, data: { platformFee: fee } });
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ deliveryFeeAmount: 10, tipAmount: 2, payableAmount: net }) });
    if (net) expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ balance: { increment: net } }) }));
    else expect(tx.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the held fee snapshot and recovers liabilities after commission', async () => {
    tx.bizFeeConfig.findUnique.mockResolvedValue({ enabled: true, rate: 0.99 });
    tx.riderLiability.findMany.mockResolvedValue([{ id: 'debt', amount: 2, recoveredAmount: 0 }]);
    const result = await (service as any).creditConfirmedRiderIncome(tx, {
      id: 'held', userId: 'owner', riderId: 'rider', price: 10, tip: 2, platformFee: 0.6,
    }, new Date());
    expect(result).toMatchObject({ payableAmount: 11.4, paidAmount: 9.4, liabilityRecovered: 2 });
    expect(tx.bizFeeConfig.findUnique).not.toHaveBeenCalled();
  });

  it('reserves only the net income after fees and debt in the same settlement transaction', async () => {
    const payout: any = { reserve: jest.fn().mockResolvedValue(undefined), kick: jest.fn(), announceKept: jest.fn().mockResolvedValue(undefined) };
    service = new ErrandLifecycleService(prisma, undefined, undefined, payout);
    tx.riderLiability.findMany.mockResolvedValue([{ id: 'debt', amount: 2, recoveredAmount: 0 }]);
    const order = { id: 'auto-payout', userId: 'owner', riderId: 'rider', price: 10, tip: 2, platformFee: 0.6 };
    await (service as any).creditConfirmedRiderIncome(tx, order, new Date());
    expect(payout.reserve).toHaveBeenCalledWith(tx, order, 9.4);
    tx.riderSettlementItem.findFirst.mockResolvedValue({ id: 'existing' });
    await (service as any).creditConfirmedRiderIncome(tx, order, new Date());
    expect(payout.reserve).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'no coupon', discount: 0, member: 0, tip: 0, paid: 10, fee: 1, net: 9, enabled: true },
    { name: 'partial coupon', discount: 8, member: 0, tip: 0, paid: 2, fee: 1, net: 9, enabled: true },
    { name: 'fully subsidized zero-payment order', discount: 10, member: 0, tip: 0, paid: 0, fee: 1, net: 9, enabled: true },
    { name: 'coupon plus membership discount', discount: 4, member: 3, tip: 0, paid: 3, fee: 1, net: 9, enabled: true },
    { name: 'fully discounted delivery with a tip', discount: 10, member: 0, tip: 2, paid: 2, fee: 1.2, net: 10.8, enabled: true },
    { name: 'coupon with commission disabled', discount: 8, member: 0, tip: 0, paid: 2, fee: 0, net: 10, enabled: false },
  ])('uses the gross fee and reserves the rider payout immediately on receipt: $name', async scenario => {
    const payout: any = { reserve: jest.fn().mockResolvedValue(undefined), kick: jest.fn(), announceKept: jest.fn().mockResolvedValue(undefined) };
    service = new ErrandLifecycleService(prisma, undefined, undefined, payout);
    const order = { id: 'coupon-payout', orderNo: 'COUPON-001', userId: 'owner', riderId: 'rider',
      regionId: 'region', status: 'arrived', refundStatus: 'none', price: 10, tip: scenario.tip,
      couponDiscount: scenario.discount + scenario.member, payAmount: scenario.paid,
      pricingSnapshot: { discounts: { coupon: scenario.discount, member: scenario.member } } };
    prisma.errandOrder.findUnique.mockResolvedValue(order);
    tx.bizFeeConfig.findUnique.mockResolvedValue({ enabled: scenario.enabled, rate: 0.1, fixedFee: 0 });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({ ...order, status: 'completed', receiptConfirmedAt: new Date() });
    await service.confirmReceipt(order.id, 'owner', 'user');
    expect(tx.errandOrder.update).toHaveBeenCalledWith({ where: { id: order.id }, data: { platformFee: scenario.fee } });
    expect(tx.errandSettlementHold.upsert).not.toHaveBeenCalled();
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      deliveryFeeAmount: 10, tipAmount: scenario.tip, payableAmount: scenario.net,
    }) });
    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ balance: { increment: scenario.net } }),
    }));
    expect(payout.reserve).toHaveBeenCalledWith(tx, expect.objectContaining({ id: order.id }), scenario.net);
    expect(payout.kick).toHaveBeenCalledTimes(1);

    prisma.errandOrder.findUnique.mockResolvedValue({ ...order, status: 'completed', receiptConfirmedAt: new Date() });
    await service.confirmReceipt(order.id, 'owner', 'user');
    expect(payout.reserve).toHaveBeenCalledTimes(1);
    expect(tx.wallet.updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails receipt settlement when the fee configuration cannot be read', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({ id: 'fee-error', userId: 'owner', riderId: 'rider', status: 'arrived', refundStatus: 'none', price: 12, payAmount: 12 });
    tx.bizFeeConfig.findUnique.mockRejectedValue(new Error('database unavailable'));
    await expect(service.confirmReceipt('fee-error', 'owner', 'user')).rejects.toThrow('database unavailable');
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { reason: 'marketing_cooling_period', risk: false, settled: false, releases: 1, credits: 1 },
    { reason: 'marketing_cooling_period_backfill', risk: false, settled: false, releases: 1, credits: 1 },
    { reason: 'marketing_cooling_period', risk: true, settled: false, releases: 0, credits: 0 },
    { reason: 'marketing_cooling_period', risk: false, settled: true, releases: 1, credits: 0 },
    { reason: 'admin_review_required', risk: false, settled: false, releases: 0, credits: 0 },
  ])('rechecks old holds without bypassing risk or repeating a settlement: %j', async scenario => {
    const now = new Date();
    const hold = { id: 'old-hold', orderId: 'old-coupon', riderId: 'rider', status: 'holding',
      reasonCode: scenario.reason, releaseAt: new Date(now.getTime() + 48 * 3600000) };
    prisma.errandSettlementHold.findMany.mockResolvedValue([hold]);
    tx.errandSettlementHold.findUnique.mockResolvedValue(hold);
    tx.errandOrder.findUnique.mockResolvedValue({ id: hold.orderId, userId: 'owner', riderId: 'rider',
      status: 'completed', receiptConfirmedAt: now, refundStatus: 'none', couponDiscount: 10,
      price: 10, tip: 0, payAmount: 0, platformFee: 0 });
    tx.bizFeeConfig.findUnique.mockResolvedValue({ enabled: true, rate: 0.1, fixedFee: 0 });
    tx.deliveryRiskEvent.findFirst.mockResolvedValue(scenario.risk ? { id: 'risk', eventType: 'related_account' } : null);
    tx.riderSettlementItem.findFirst.mockResolvedValue(scenario.settled ? { id: 'already-paid' } : null);
    const payout: any = { reserve: jest.fn().mockResolvedValue(undefined), kick: jest.fn(), announceKept: jest.fn().mockResolvedValue(undefined) };
    service = new ErrandLifecycleService(prisma, undefined, undefined, payout);
    const result = await service.releaseMaturedSettlementHolds(now);
    expect(result.released).toBe(scenario.releases);
    expect(tx.wallet.updateMany).toHaveBeenCalledTimes(scenario.credits);
    expect(payout.reserve).toHaveBeenCalledTimes(scenario.credits);
    if (scenario.credits) expect(payout.reserve).toHaveBeenCalledWith(tx, expect.objectContaining({ platformFee: 1 }), 9);
    if (scenario.settled) expect(tx.bizFeeConfig.findUnique).not.toHaveBeenCalled();
    if (!scenario.releases) expect(tx.errandSettlementHold.updateMany).not.toHaveBeenCalled();
  });

  it('clears a legacy coupon-only hold in the receipt transaction before reserving payout', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({ id: 'arrived-coupon', userId: 'owner', riderId: 'rider',
      status: 'arrived', refundStatus: 'none', couponDiscount: 10, price: 10, tip: 0, payAmount: 0 });
    tx.errandSettlementHold.findUnique.mockResolvedValue({ id: 'legacy-hold', status: 'holding',
      reasonCode: 'marketing_cooling_period_backfill', releaseAt: new Date(Date.now() + 86400000) });
    tx.bizFeeConfig.findUnique.mockResolvedValue({ enabled: true, rate: 0.1, fixedFee: 0 });
    const payout: any = { reserve: jest.fn().mockResolvedValue(undefined), kick: jest.fn(), announceKept: jest.fn().mockResolvedValue(undefined) };
    service = new ErrandLifecycleService(prisma, undefined, undefined, payout);
    await service.confirmReceipt('arrived-coupon', 'owner');
    expect(tx.errandSettlementHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'legacy-hold', status: 'holding' }),
      data: expect.objectContaining({ status: 'released' }),
    }));
    expect(payout.reserve).toHaveBeenCalledWith(tx, expect.objectContaining({ platformFee: 1 }), 9);
  });

  it('marks an in-progress order arrived and starts the receipt clock', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'in_progress',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
      remark: '{}',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'arrived',
    });

    const result = await service.markArrived('order-1', 'rider-1', {
      proof_images: ['https://example.com/proof.jpg'],
    });

    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'in_progress', riderId: 'rider-1' }),
      data: expect.objectContaining({
        status: 'arrived',
        deliverTime: expect.any(Date),
        receiptConfirmDeadline: expect.any(Date),
      }),
    }));
    expect(result.status).toBe('arrived');
  });

  it('confirms only the owner arrived order without a hold', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      riderId: 'rider-1',
      status: 'arrived',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      status: 'completed',
      receiptConfirmedBy: 'user',
    });

    const result = await service.confirmReceipt('order-1', 'user-1', 'user');

    expect(result.status).toBe('completed');
    expect(result.receiptConfirmedBy).toBe('user');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'order-1', userId: 'user-1', status: 'arrived' }),
      data: expect.objectContaining({
        status: 'completed',
        receiptConfirmedAt: expect.any(Date),
        receiptConfirmedBy: 'user',
        settlementEligibleAt: expect.any(Date),
      }),
    }));
  });

  it('credits the confirmed rider fee and tip to the withdrawable wallet atomically', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      price: 2,
      tip: 1,
      payAmount: 3,
      deliveryDisplayMode: 'status_nodes',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      status: 'completed',
    });

    await service.confirmReceipt('order-1', 'user-1', 'user');

    expect(tx.riderSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        periodKey: expect.stringMatching(/^auto:daily:rider-1:\d{4}-\d{2}-\d{2}$/),
      },
      data: expect.objectContaining({
        orderCount: { increment: 1 },
        deliveryFeeTotal: { increment: 3 },
        payableAmount: { increment: 3 },
        paidAmount: { increment: 3 },
      }),
    });
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        deliveryFeeAmount: 2,
        tipAmount: 1,
        payableAmount: 3,
      }),
    });
    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'rider-1' },
      data: expect.objectContaining({ balance: { increment: 3 } }),
    }));
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'rider-1',
        type: 'COMMISSION',
        amount: 3,
        balance: 3,
        orderNo: 'ERRAND-001',
        status: 'SUCCESS',
      }),
    });
  });

  it('does not credit an order already present in a non-rejected historical settlement', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-legacy',
      orderNo: 'ERRAND-LEGACY',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      price: 2,
      tip: 0,
      deliveryDisplayMode: 'status_nodes',
    });
    tx.riderSettlementItem.findFirst.mockResolvedValueOnce({
      id: 'legacy-item',
      settlementId: 'legacy-pending-settlement',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-legacy',
      status: 'completed',
    });

    await service.confirmReceipt('order-legacy', 'user-1', 'user');

    expect(tx.riderSettlement.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('completes but never credits a legacy self-fulfilled errand', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-self',
      orderNo: 'ERRAND-SELF',
      userId: 'user-1',
      riderId: 'user-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      price: 2,
      tip: 1,
      deliveryDisplayMode: 'status_nodes',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-self',
      status: 'completed',
    });

    await service.confirmReceipt('order-self', 'user-1', 'user');

    expect(tx.riderSettlement.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-self',
        riderId: 'user-1',
        eventType: 'self_assignment_attempt',
        eventLevel: 'critical',
      }),
    });
    expect(tx.errandSettlementHold.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        orderId: 'order-self',
        riderId: 'user-1',
        status: 'holding',
        reasonCode: 'self_assignment',
        releaseAt: null,
      }),
    }));
  });

  it('credits an unrelated marketing order immediately without a timed hold', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-marketing', orderNo: 'ERRAND-MARKETING', userId: 'owner-1',
      riderId: 'rider-1', regionId: 'region-1', status: 'arrived', refundStatus: 'none',
      couponDiscount: 2, price: 4, tip: 1, deliveryDisplayMode: 'status_nodes',
    });
    tx.user.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'owner-1'
      ? { phone: '13800000001', unionid: 'union-owner', studentVerify: null, withdraws: [] }
      : { phone: '13800000002', unionid: 'union-rider', studentVerify: null, withdraws: [] }));
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({ id: 'order-marketing', status: 'completed' });

    await service.confirmReceipt('order-marketing', 'owner-1', 'user');

    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ balance: { increment: 5 } }),
    }));
    expect(tx.errandSettlementHold.upsert).not.toHaveBeenCalled();
  });

  it('holds settlement when a discounted errand was fulfilled by a strongly related account', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-related',
      orderNo: 'ERRAND-RELATED',
      userId: 'owner-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      couponDiscount: 2,
      price: 2,
      tip: 1,
      deliveryDisplayMode: 'status_nodes',
    });
    tx.user.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'owner-1'
      ? { phone: '13800000000', studentVerify: null }
      : { phone: '138-0000-0000', studentVerify: null }));
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-related',
      status: 'completed',
    });

    await service.confirmReceipt('order-related', 'owner-1', 'user');

    expect(tx.riderSettlement.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-related',
        riderId: 'rider-1',
        eventType: 'marketing_related_account_assignment_attempt',
        eventLevel: 'critical',
      }),
    });
  });

  it('recovers existing rider liabilities before increasing the withdrawable wallet', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-liability',
      orderNo: 'ERRAND-LIABILITY',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      price: 5,
      tip: 1,
      deliveryDisplayMode: 'status_nodes',
    });
    tx.riderLiability.findMany.mockResolvedValueOnce([
      { id: 'liability-1', amount: 2, recoveredAmount: 0 },
    ]);
    tx.wallet.findUniqueOrThrow.mockResolvedValueOnce({ balance: 4 });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-liability',
      status: 'completed',
    });

    await service.confirmReceipt('order-liability', 'user-1', 'user');

    expect(tx.riderSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payableAmount: { increment: 6 },
        paidAmount: { increment: 4 },
      }),
    }));
    expect(tx.riderLiability.updateMany).toHaveBeenCalledWith({
      where: { id: 'liability-1', status: 'open', amount: 2, recoveredAmount: 0 },
      data: { recoveredAmount: 2, status: 'recovered' },
    });
    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ balance: { increment: 4 } }),
    }));
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 4, balance: 4 }),
    });
  });

  it('aggregates confirmed orders for the same rider into one Shanghai calendar-day settlement', async () => {
    const completedAt = new Date('2026-08-31T15:30:00.000Z');

    await (service as any).creditConfirmedRiderIncome(tx, {
      id: 'order-day-1',
      orderNo: 'ERRAND-DAY-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      price: 2,
      tip: 0,
    }, completedAt);
    await (service as any).creditConfirmedRiderIncome(tx, {
      id: 'order-day-2',
      orderNo: 'ERRAND-DAY-2',
      riderId: 'rider-1',
      regionId: 'region-1',
      price: 3,
      tip: 1,
    }, completedAt);

    const first = tx.riderSettlement.updateMany.mock.calls[0][0];
    const second = tx.riderSettlement.updateMany.mock.calls[1][0];
    expect(first.where.periodKey).toBe('auto:daily:rider-1:2026-08-31');
    expect(second.where.periodKey).toBe(first.where.periodKey);
    expect(tx.riderSettlement.createMany.mock.calls[0][0].data[0].periodStart).toEqual(new Date('2026-08-30T16:00:00.000Z'));
    expect(tx.riderSettlement.createMany.mock.calls[0][0].data[0].periodEnd).toEqual(new Date('2026-08-31T15:59:59.999Z'));
    expect(second.data).toEqual(expect.objectContaining({
      orderCount: { increment: 1 },
      deliveryFeeTotal: { increment: 4 },
      payableAmount: { increment: 4 },
      paidAmount: { increment: 4 },
    }));
  });

  it('rejects the wrong owner and open after-sale holds', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      riderId: 'rider-1',
      status: 'arrived',
      refundStatus: 'none',
    });

    await expect(service.confirmReceipt('order-1', 'user-2', 'user')).rejects.toThrow('无权确认该订单');

    prisma.orderAppeal.findFirst.mockResolvedValueOnce({ id: 'appeal-1', status: 'pending' });
    await expect(service.confirmReceipt('order-1', 'user-1', 'user')).rejects.toThrow('订单售后处理中');
  });

  it('requires delivery proof when the risk snapshot requires it', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'in_progress',
      refundStatus: 'none',
      remark: JSON.stringify({
        risk_assessment: { required_evidence: ['delivery_photo'] },
      }),
    });

    await expect(service.markArrived('order-1', 'rider-1', {})).rejects.toThrow('请上传送达凭证');
    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId: 'order-1', orderType: 'errand', riderId: 'rider-1',
      eventType: 'delivery_evidence_rejected', eventLevel: 'error',
    }) });
  });

  it('dispatches the configured picked template event after pickup is committed', async () => {
    service = new ErrandLifecycleService(prisma, undefined, notifyService);
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'accepted',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'in_progress',
      pickupTime: new Date('2026-08-25T00:00:00.000Z'),
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
    });

    await service.markInProgress('order-1', 'rider-1');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      scene: 'errand_picked',
      data: expect.objectContaining({
        orderNo: 'ERRAND-001',
        riderName: '测试骑手',
        pickupAddress: '一号取件点',
      }),
      channelMask: expect.objectContaining({ officialAccount: true, wechatSubscribe: true }),
    }));
  });

  it('dispatches a distinct arrived notification while preserving completed for receipt', async () => {
    service = new ErrandLifecycleService(prisma, undefined, notifyService);
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'in_progress',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
      remark: '{}',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      deliverTime: new Date('2026-08-25T00:05:00.000Z'),
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
    });

    await service.markArrived('order-1', 'rider-1');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      scene: 'errand_arrived',
      title: '骑手已送达，请确认收货',
      content: expect.stringContaining('已送达，请确认收货'),
      data: expect.objectContaining({
        orderNo: 'ERRAND-001',
        remark: '已送达，请确认收货',
      }),
      channelMask: expect.objectContaining({
        inApp: true,
        websocket: true,
        wechatSubscribe: false,
        officialAccount: true,
      }),
    }));
  });

  it('dispatches the configured completed template event after receipt is committed', async () => {
    service = new ErrandLifecycleService(prisma, undefined, notifyService);
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'arrived',
      refundStatus: 'none',
      payAmount: 8,
      deliveryDisplayMode: 'status_nodes',
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ERRAND-001',
      userId: 'user-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      status: 'completed',
      completeTime: new Date('2026-08-25T00:10:00.000Z'),
      pickupAddress: '一号取件点',
      deliverAddress: '二号宿舍',
    });

    await service.confirmReceipt('order-1', 'user-1', 'user');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      scene: 'errand_delivered',
      data: expect.objectContaining({
        orderNo: 'ERRAND-001',
        deliveryAddress: '二号宿舍',
        finishedAt: expect.any(String),
      }),
      channelMask: expect.objectContaining({ officialAccount: true, wechatSubscribe: true }),
    }));
  });

  it('releases a combined device/IP review only after that exact risk was manually approved', async () => {
    const dueAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.errandSettlementHold.findMany.mockResolvedValue([{
      id: 'hold-reviewed', orderId: 'order-reviewed', riderId: 'rider-1',
    }]);
    tx.errandSettlementHold.findUnique.mockResolvedValue({
      id: 'hold-reviewed', orderId: 'order-reviewed', riderId: 'rider-1',
      status: 'holding', releaseAt: dueAt,
      reasonCode: 'admin_release:marketing_shared_device_and_ip',
      resolvedBy: 'admin-1',
    });
    tx.errandOrder.findUnique.mockResolvedValue({
      id: 'order-reviewed', orderNo: 'ERRAND-REVIEWED', userId: 'owner-1',
      riderId: 'rider-1', regionId: 'region-1', status: 'completed', refundStatus: 'none',
      couponDiscount: 2, price: 4, tip: 1,
    });
    tx.user.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'owner-1'
      ? { phone: '13800000001', lastLoginDevice: 'iPhone 15', lastLoginIp: '10.0.0.8', withdraws: [] }
      : { phone: '13800000002', lastLoginDevice: 'iPhone 15', lastLoginIp: '10.0.0.8', withdraws: [] }));

    await expect(service.releaseMaturedSettlementHolds(new Date('2026-09-01T00:01:00.000Z')))
      .resolves.toEqual({ checked: 1, released: 1, blocked: 0 });
    expect(tx.errandSettlementHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'hold-reviewed', status: 'holding' }),
      data: expect.objectContaining({ status: 'released', resolvedBy: 'system:risk_recheck' }),
    }));
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderId: 'order-reviewed', riderId: 'rider-1' }),
    }));
  });
});
