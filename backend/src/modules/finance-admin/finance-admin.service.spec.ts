import { FinanceAdminService } from './finance-admin.service';

const allRegionScope = () => ({
  getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }),
});

describe('FinanceAdminService withdrawal completion', () => {
  it('requires a transfer number and settles the frozen balance once', async () => {
    const withdraw = { id: 'withdraw-1', userId: 'user-1', amount: 10, channel: 'WX_PAY', status: 'PROCESSING' };
    const tx: any = {
      withdraw: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ ...withdraw, status: 'SUCCESS' }) },
      wallet: { update: jest.fn().mockResolvedValue({ balance: 90 }) },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      withdraw: { findUnique: jest.fn().mockResolvedValue(withdraw) },
      $transaction: jest.fn((fn: any) => fn(tx)),
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.completeWithdrawal('withdraw-1', { transferNo: 'TX-1' }, 'admin-1'))
      .resolves.toEqual(expect.objectContaining({ success: true }));

    expect(tx.withdraw.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'withdraw-1', status: 'PROCESSING' },
    }));
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      orderNo: 'withdraw-1', balance: 90, status: 'SUCCESS',
    }) }));
    await expect(service.completeWithdrawal('withdraw-1', {})).rejects.toThrow('请填写打款流水号');
  });

  it('rejects rider withdrawal approval while an open settlement liability remains', async () => {
    const withdraw = { id: 'withdraw-1', userId: 'rider-1', amount: 10, channel: 'WX_PAY', status: 'PENDING' };
    const prisma: any = {
      withdraw: { findUnique: jest.fn().mockResolvedValue(withdraw) },
      riderLiability: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 8, recoveredAmount: 2 } }) },
      $transaction: jest.fn(),
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.reviewWithdrawal('withdraw-1', { approved: true }))
      .rejects.toThrow('存在未偿还的跑腿退款负债');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('FinanceAdminService region balance adjustment', () => {
  it('increments the balance and records the database result in one transaction', async () => {
    const tx: any = {
      region: { update: jest.fn().mockResolvedValue({ balance: 25 }) },
      regionBalanceLog: { create: jest.fn().mockResolvedValue({ id: 'log-1', balance: 25 }) },
    };
    const prisma: any = {
      region: { findUnique: jest.fn().mockResolvedValue({ id: 'region-a', balance: 20 }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const scope: any = {
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }),
      assertRegionAccess: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinanceAdminService(prisma, {} as any, scope);

    await service.adjustRegionBalance({ regionId: 'region-a', amount: 5, description: '补差' }, 'admin-1');

    expect(scope.assertRegionAccess).toHaveBeenCalledWith('admin-1', 'region-a');
    expect(tx.region.update).toHaveBeenCalledWith({
      where: { id: 'region-a' },
      data: { balance: { increment: 5 } },
      select: { balance: true },
    });
    expect(tx.regionBalanceLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ balance: 25 }),
    }));
  });
});

describe('FinanceAdminService regional user finance scope', () => {
  const regionalScope = () => ({
    getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }),
    regionFieldWhere: jest.fn().mockResolvedValue({ regionId: { in: ['region-a'] } }),
  });

  it('filters wallet logs and withdrawals by durable user-region relations', async () => {
    const prisma: any = {
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      withdraw: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new FinanceAdminService(prisma, {} as any, regionalScope() as any);

    await service.getUserWalletLogs({}, 'admin-a');
    await service.getWithdrawals({}, 'admin-a');

    const expectedUserScope = expect.objectContaining({
      OR: expect.arrayContaining([
        { profile: { is: { regionId: { in: ['region-a'] } } } },
        { addresses: { some: { regionId: { in: ['region-a'] } } } },
      ]),
    });
    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user: { is: expectedUserScope } },
    }));
    expect(prisma.withdraw.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user: { is: expectedUserScope } },
    }));
  });

  it('rejects reviewing a withdrawal owned outside the operator regions', async () => {
    const prisma: any = {
      withdraw: { findUnique: jest.fn().mockResolvedValue({ id: 'w-1', userId: 'user-b', status: 'PENDING' }) },
      user: { findUnique: jest.fn().mockResolvedValue({
        profile: { regionId: 'region-b' }, addresses: [], posts: [], botAccount: null,
      }) },
    };
    const service = new FinanceAdminService(prisma, {} as any, regionalScope() as any);

    await expect(service.reviewWithdrawal('w-1', { approved: false }, 'admin-a'))
      .rejects.toThrow('无权访问该区域数据');
  });
});

describe('FinanceAdminService refund list', () => {
  it('merges legacy and payment refunds so takeaway refunds remain visible to finance', async () => {
    const now = new Date();
    const prisma: any = {
      refund: {
        findMany: jest.fn().mockResolvedValue([{ id: 'legacy-1', refundNo: 'LEG-1', amount: 3, status: 'completed', reason: '历史退款', createdAt: now, order: { orderNo: 'ORD-1', userId: 'user-1', user: { nickname: '小明' } } }]),
        count: jest.fn().mockResolvedValue(1),
      },
      paymentRefund: {
        findMany: jest.fn().mockResolvedValue([{ id: 'pay-1', refundNo: 'REF-1', amount: 12, status: 'processing', reason: '商家未接单', createdAt: new Date(now.getTime() + 1), payment: { orderNo: 'ORD-2', bizType: 'order', bizId: 'order-2', userId: 'user-2' } }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.getRefundOrders({ page: 1, pageSize: 20 })).resolves.toEqual(expect.objectContaining({
      total: 2,
      list: [
        expect.objectContaining({ refundNo: 'REF-1', source: 'payment', bizType: 'order', status: 'PROCESSING' }),
        expect.objectContaining({ refundNo: 'LEG-1', source: 'legacy', status: 'SUCCESS' }),
      ],
    }));

    await service.getRefundOrders({ page: 1, pageSize: 20, status: 'PROCESSING' });
    expect(prisma.refund.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['pending', 'approved', 'processing'] } }),
    }));
  });

  it('limits payment and refund records to orders in the regional operator scope', async () => {
    const prisma: any = {
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'order-a' }]) },
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      paymentOrder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      refund: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      paymentRefund: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new FinanceAdminService(prisma, {} as any, scope as any);

    await service.getPaymentOrders({}, 'regional-admin');
    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ OR: [{ bizType: 'order', bizId: { in: ['order-a'] } }] }] },
    }));

    await service.getRefundOrders({}, 'regional-admin');
    expect(prisma.refund.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { order: { is: { merchant: { regionId: { in: ['region-a'] } } } } },
    }));
    expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ payment: { is: { OR: [{ bizType: 'order', bizId: { in: ['order-a'] } }] } } }] },
    }));
  });
});

describe('FinanceAdminService merchant settlements', () => {
  it('only confirms a pending settlement once and returns the net merchant amount', async () => {
    const settlement = { id: 'settlement-1', status: 'pending', amount: 20, platformFee: 1.5, merchant: { name: '测试商家' } };
    const prisma: any = {
      merchantSettlement: {
        findMany: jest.fn().mockResolvedValue([settlement]), count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.getMerchantSettlements({})).resolves.toEqual(expect.objectContaining({
      list: [expect.objectContaining({ amount: 20, platformFee: 1.5, netAmount: 18.5 })],
    }));
    await expect(service.confirmMerchantSettlement('settlement-1', {}, 'admin-1'))
      .resolves.toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'completed' }) }));
    expect(prisma.merchantSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'settlement-1', status: 'pending' },
    }));
  });

  it('requires a transfer number before recording an offline merchant payout', async () => {
    const settlement = { id: 'settlement-1', status: 'completed', amount: 20, platformFee: 1.5 };
    const prisma: any = {
      merchantSettlement: { findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.payMerchantSettlement('settlement-1', {}, 'admin-1')).rejects.toThrow('请填写线下打款流水号');
    await expect(service.payMerchantSettlement('settlement-1', { transferNo: 'BANK-001' }, 'admin-1'))
      .resolves.toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'paid', transferNo: 'BANK-001' }) }));
    expect(prisma.merchantSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'settlement-1', status: 'completed' }, data: expect.objectContaining({ status: 'paid', transferNo: 'BANK-001' }),
    }));
  });

  it('does not let a refund adjustment be recorded as a merchant payout', async () => {
    const settlement = { id: 'adjustment-1', status: 'completed', amount: -10, platformFee: -1 };
    const prisma: any = {
      merchantSettlement: { findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn() },
      adminOperationLog: { create: jest.fn() },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.payMerchantSettlement('adjustment-1', { transferNo: 'BANK-001' }, 'admin-1'))
      .rejects.toThrow('退款差额调整单请登记抵扣，不能登记打款');
    expect(prisma.merchantSettlement.updateMany).not.toHaveBeenCalled();
  });

  it('records a negative refund adjustment as an auditable offset instead of a merchant payout', async () => {
    const settlement = { id: 'adjustment-1', status: 'completed', amount: -10, platformFee: -1, remark: '退款差额调整：订单 ORD-1' };
    const prisma: any = {
      merchantSettlement: { findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.offsetMerchantSettlement('adjustment-1', { reference: 'MST-202607-02' }, 'admin-1'))
      .resolves.toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'paid', transferNo: 'MST-202607-02' }) }));
    expect(prisma.merchantSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'adjustment-1', status: 'completed' },
      data: expect.objectContaining({ status: 'paid', transferNo: 'MST-202607-02' }),
    }));
    await expect(service.offsetMerchantSettlement('adjustment-1', {})).rejects.toThrow('请填写抵扣凭证或后续结算单号');
  });

  it('limits regional operators to their merchants and rejects cross-region payouts', async () => {
    const settlement = { id: 'settlement-b', status: 'completed', amount: 20, platformFee: 1, merchant: { regionId: 'region-b' } };
    const prisma: any = {
      merchantSettlement: {
        findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn(),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new FinanceAdminService(prisma, {} as any, scope as any);

    await service.getMerchantSettlements({}, 'regional-admin');
    expect(prisma.merchantSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchant: { regionId: { in: ['region-a'] } } },
    }));
    await expect(service.payMerchantSettlement('settlement-b', { transferNo: 'BANK-002' }, 'regional-admin'))
      .rejects.toThrow('无权操作该区域商家结算');
    expect(prisma.merchantSettlement.updateMany).not.toHaveBeenCalled();
  });
});

describe('FinanceAdminService rider settlement payout', () => {
  it('uses actual delivery time so delivered takeaway orders do not wait for buyer receipt to settle', async () => {
    const deliveredAt = new Date('2026-07-17T10:00:00.000Z');
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([{
        id: 'order-1', orderNo: 'ORD-1', riderId: 'rider-1', deliverTime: deliveredAt, completeTime: null,
        freightAmount: 3, originalFreightAmount: 3, merchant: { regionId: 'region-1', name: '测试商家' }, user: { nickname: '用户' },
      }]) },
      subsidyLedger: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    const earnings = await (service as any).getCompletedRiderEarnings({
      start: new Date('2026-07-17T00:00:00.000Z'), end: new Date('2026-07-17T23:59:59.999Z'), includeCovered: true,
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        refundStatus: { notIn: ['refunding', 'refunded'] },
        OR: expect.arrayContaining([{ deliverTime: { gte: expect.any(Date), lte: expect.any(Date) } }]),
      }),
    }));
    expect(earnings).toEqual([expect.objectContaining({ orderId: 'order-1', completeTime: deliveredAt, amount: 3 })]);
  });

  it('does not turn a goods coupon into rider delivery pay when no rider subsidy ledger exists', async () => {
    const deliveredAt = new Date('2026-07-17T10:00:00.000Z');
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([{
        id: 'order-free', orderNo: 'ORD-FREE', riderId: 'rider-1', deliverTime: deliveredAt,
        freightAmount: 0, originalFreightAmount: 2, subsidyAmount: 20,
        merchant: { regionId: 'region-1', name: '测试商家' }, user: { nickname: '用户' },
      }]) },
      subsidyLedger: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    const earnings = await (service as any).getCompletedRiderEarnings({
      start: new Date('2026-07-17T00:00:00.000Z'), end: new Date('2026-07-17T23:59:59.999Z'), includeCovered: true,
    });

    expect(prisma.subsidyLedger.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ receiverType: 'rider', orderId: { in: ['order-free'] } }),
    }));
    expect(earnings).toEqual([expect.objectContaining({ orderId: 'order-free', amount: 2, subsidyAmount: 0 })]);
  });

  it('keeps refunding errand and takeaway orders out of rider settlement sources', async () => {
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await (service as any).getCompletedRiderEarnings({
      start: new Date('2026-07-17T00:00:00.000Z'), end: new Date('2026-07-17T23:59:59.999Z'), includeCovered: true,
    });

    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
  });

  it('excludes errand earnings when settlement v2 is disabled for the order region', async () => {
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([{
        id: 'errand-1', orderNo: 'ERR-1', riderId: 'rider-1', regionId: 'region-1',
        price: 6, tip: 2, completeTime: new Date('2026-07-17T10:00:00.000Z'),
        User: {}, RegionRider: {},
      }]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      config: { findMany: jest.fn().mockResolvedValue([{
        key: 'errand.extended_config.region-1', value: { settlementV2Enabled: false },
      }]) },
      riderSettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect((service as any).getCompletedRiderEarnings({
      start: new Date('2026-07-17T00:00:00.000Z'), end: new Date('2026-07-17T23:59:59.999Z'),
    })).resolves.toEqual([]);
  });

  it('keeps historical settlement detail readable after settlement v2 is disabled', async () => {
    const completedAt = new Date('2026-07-17T10:00:00.000Z');
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([{
        id: 'errand-1', orderNo: 'ERR-1', riderId: 'rider-1', regionId: 'region-1',
        price: 6, tip: 2, completeTime: completedAt, User: {}, RegionRider: {},
      }]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      config: { findMany: jest.fn().mockResolvedValue([{
        key: 'errand.extended_config.region-1', value: { settlementV2Enabled: false },
      }]) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect((service as any).getCompletedRiderEarnings({
      start: new Date('2026-07-17T00:00:00.000Z'), end: new Date('2026-07-17T23:59:59.999Z'), includeCovered: true,
    })).resolves.toEqual([expect.objectContaining({ orderId: 'errand-1', amount: 8 })]);
  });

  it('creates order-level settlement items only for unchallenged earnings', async () => {
    const tx: any = {
      riderSettlement: { create: jest.fn().mockResolvedValue({ id: 'settlement-1' }) },
      riderSettlementItem: { create: jest.fn().mockResolvedValue({}) },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      riderSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([{ orderId: 'appealed-order' }]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([{ orderId: 'risky-order' }]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);
    jest.spyOn(service as any, 'getCompletedRiderEarnings').mockResolvedValue([
      { source: 'errand', orderId: 'eligible-order', orderNo: 'ERR-1', riderId: 'rider-1', regionId: 'region-1', amount: 8, price: 6, tip: 2 },
      { source: 'errand', orderId: 'appealed-order', orderNo: 'ERR-2', riderId: 'rider-1', regionId: 'region-1', amount: 8, price: 6, tip: 2 },
      { source: 'errand', orderId: 'risky-order', orderNo: 'ERR-3', riderId: 'rider-1', regionId: 'region-1', amount: 8, price: 6, tip: 2 },
    ]);

    await expect(service.generateRiderSettlements({
      periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-02T00:00:00.000Z', regionId: 'region-1',
    }, 'admin-1')).resolves.toEqual(expect.objectContaining({ success: true, count: 1 }));

    expect(tx.riderSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderCount: 1, deliveryFeeTotal: 8, payableAmount: 8 }),
    }));
    expect(tx.riderSettlementItem.create).toHaveBeenCalledTimes(1);
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        settlementId: 'settlement-1', orderType: 'errand', orderId: 'eligible-order',
        riderId: 'rider-1', deliveryFeeAmount: 6, tipAmount: 2, payableAmount: 8,
      }),
    });
  });

  it('adds idempotent review, timeout and night rules to the order settlement amounts', async () => {
    const tx: any = {
      riderSettlement: { create: jest.fn().mockResolvedValue({ id: 'settlement-1' }) },
      riderSettlementItem: { create: jest.fn().mockResolvedValue({}) },
      incentiveRecord: { upsert: jest.fn().mockResolvedValue({}) },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      riderSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      errandRewardPunish: { findMany: jest.fn().mockResolvedValue([{
        regionId: 'region-1', timeoutMinutes: 30, timeoutPenalty: 1,
        goodReviewReward: 2, badReviewPenalty: 4, nightReward: 3,
      }]) },
      errandReview: { findMany: jest.fn().mockResolvedValue([{ orderId: 'eligible-order', rating: 5 }]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);
    jest.spyOn(service as any, 'getCompletedRiderEarnings').mockResolvedValue([{
      source: 'errand', orderId: 'eligible-order', orderNo: 'ERR-1', riderId: 'rider-1', regionId: 'region-1',
      amount: 8, price: 6, tip: 2,
      pickupTime: new Date('2026-07-01T15:00:00.000Z'),
      deliverTime: new Date('2026-07-01T16:00:00.000Z'),
    }]);

    await service.generateRiderSettlements({
      periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-02T00:00:00.000Z', regionId: 'region-1',
    }, 'admin-1');

    expect(tx.riderSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      rewardAmount: 5, penaltyAmount: 1, payableAmount: 12,
    }) }));
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId: 'eligible-order', rewardAmount: 5, penaltyAmount: 1, payableAmount: 12,
    }) });
    expect(tx.incentiveRecord.upsert).toHaveBeenCalledTimes(3);
    expect(tx.incentiveRecord.upsert.mock.calls.map((call: any[]) => call[0].create.ruleType)).toEqual([
      'good_review', 'delivery_timeout', 'night_pickup',
    ]);
  });

  it('applies the configured bad-review penalty only to one- and two-star reviews', () => {
    const service = new FinanceAdminService({} as any, {} as any, allRegionScope() as any);
    const config = { goodReviewReward: 2, badReviewPenalty: 4 };

    expect((service as any).errandIncentives({}, config, { rating: 2 })).toEqual([expect.objectContaining({
      ruleType: 'bad_review', type: 'rider_penalty', amount: 4,
    })]);
    expect((service as any).errandIncentives({}, config, { rating: 3 })).toEqual([]);
  });

  it('turns a paid errand settlement refund into one idempotent rider liability', async () => {
    const tx: any = {
      riderSettlementItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      riderLiability: { upsert: jest.fn().mockResolvedValue({ id: 'liability-1' }) },
    };
    const prisma: any = {
      riderSettlementItem: { findUnique: jest.fn().mockResolvedValue({
        id: 'item-1', riderId: 'rider-1', payableAmount: 8, reversalAmount: 0, status: 'included',
        settlement: { id: 'settlement-1', status: 'PAID' },
      }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.reverseErrandSettlement('order-1', 'refund-1', 8, '用户退款'))
      .resolves.toEqual(expect.objectContaining({ success: true, liabilityCreated: true }));
    expect(tx.riderLiability.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderId_refundId: { orderId: 'order-1', refundId: 'refund-1' } },
      create: expect.objectContaining({ riderId: 'rider-1', orderId: 'order-1', refundId: 'refund-1', amount: 8 }),
    }));
  });

  it('claims the confirmed settlement before crediting the rider wallet', async () => {
    const settlement = { id: 'rider-settlement-1', riderId: 'rider-1', settlementNo: 'RS-1', status: 'CONFIRMED', payableAmount: 12.5 };
    const tx: any = {
      riderSettlement: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      riderLiability: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      wallet: { upsert: jest.fn().mockResolvedValue({ balance: 32.5 }) },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      riderSettlement: { findUnique: jest.fn().mockResolvedValue(settlement) },
      $transaction: jest.fn((fn: any) => fn(tx)),
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await expect(service.payRiderSettlement(settlement.id, {}, 'admin-1')).resolves.toEqual(expect.objectContaining({
      success: true, data: expect.objectContaining({ status: 'PAID' }),
    }));
    expect(tx.riderSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: settlement.id, status: 'CONFIRMED' },
    }));
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);

    tx.riderSettlement.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.payRiderSettlement(settlement.id, {})).rejects.toThrow('结算单状态已变更');
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('recovers open rider liabilities before crediting a new settlement', async () => {
    const settlement = { id: 'rider-settlement-2', riderId: 'rider-1', settlementNo: 'RS-2', status: 'CONFIRMED', payableAmount: 12.5 };
    const tx: any = {
      riderSettlement: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      riderLiability: {
        findMany: jest.fn().mockResolvedValue([{ id: 'liability-1', amount: 5, recoveredAmount: 1 }]),
        update: jest.fn().mockResolvedValue({}),
      },
      wallet: { upsert: jest.fn().mockResolvedValue({ balance: 28.5 }) },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      riderSettlement: { findUnique: jest.fn().mockResolvedValue(settlement) },
      $transaction: jest.fn((fn: any) => fn(tx)),
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await service.payRiderSettlement(settlement.id, {}, 'admin-1');

    expect(tx.riderSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paidAmount: 8.5 }),
    }));
    expect(tx.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ balance: 8.5 }),
      update: expect.objectContaining({ balance: { increment: 8.5 } }),
    }));
    expect(tx.riderLiability.update).toHaveBeenCalledWith({
      where: { id: 'liability-1' }, data: { recoveredAmount: 5, status: 'recovered' },
    });
  });

  it('limits regional operators to their rider settlements and generation region', async () => {
    const settlement = { id: 'rider-settlement-b', riderId: 'rider-b', settlementNo: 'RS-B', regionId: 'region-b', status: 'CONFIRMED', payableAmount: 12.5 };
    const prisma: any = {
      riderSettlement: {
        findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(settlement), updateMany: jest.fn(),
      },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new FinanceAdminService(prisma, {} as any, scope as any);

    await service.getRiderSettlements({}, 'regional-admin');
    expect(prisma.riderSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { regionId: { in: ['region-a'] } },
    }));
    await expect(service.payRiderSettlement(settlement.id, {}, 'regional-admin'))
      .rejects.toThrow('无权操作该区域骑手结算');
    expect(prisma.riderSettlement.updateMany).not.toHaveBeenCalled();
    await expect(service.generateRiderSettlements({ periodStart: '2026-07-01', periodEnd: '2026-07-02', regionId: 'region-b' }, 'regional-admin'))
      .rejects.toThrow('无权访问该区域骑手结算');
  });
});

describe('FinanceAdminService abnormal orders', () => {
  it('finds refunded-in-progress takeaway orders by refund status rather than fulfillment status', async () => {
    const prisma: any = { order: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new FinanceAdminService(prisma, {} as any, allRegionScope() as any);

    await service.getAbnormalOrders({ type: 'refund_timeout' });

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: 'refunding' }),
    }));
  });

  it('limits actionable finance warnings to the regional operator scope', async () => {
    const prisma: any = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const scope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }) };
    const service = new FinanceAdminService(prisma, {} as any, scope as any);

    await expect(service.getAbnormalOrders({}, 'regional-admin')).resolves.toEqual(expect.objectContaining({ total: 0 }));
    for (const [args] of prisma.order.findMany.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ merchant: { regionId: { in: ['region-a'] } } }));
    }
    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ regionId: { in: ['region-a'] } }),
    }));
  });
});
