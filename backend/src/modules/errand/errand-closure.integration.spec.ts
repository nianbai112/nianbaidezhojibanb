import { ErrandService } from './errand.service';
import { ErrandLifecycleService } from './errand-lifecycle.service';
import { PaymentService } from '../payment/payment.service';
import { FinanceAdminService } from '../finance-admin/finance-admin.service';

const { auditErrandClosure } = require('../../../scripts/audit-errand-closure.cjs');
const { runBackfill } = require('../../../scripts/backfill-errand-receipts.cjs');

describe('Errand closure legacy safety', () => {
  it('keeps the audit read-only and reports every legacy conflict bucket', async () => {
    const prisma: any = {
      errandOrder: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'arrived-1' }])
        .mockResolvedValueOnce([{ id: 'completed-1' }])
        .mockResolvedValueOnce([{ id: 'completed-appeal-1' }])
        .mockResolvedValueOnce([{ id: 'refunding-1' }]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([{ orderId: 'completed-appeal-1' }]) },
      riderSettlement: { findMany: jest.fn().mockResolvedValue([{
        id: 'settlement-1',
        remark: JSON.stringify({ sourceOrders: [{ id: 'settled-without-item-1', source: 'errand' }] }),
      }]) },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      errandOrderTask: { findMany: jest.fn().mockResolvedValue([{
        orderId: 'custom-1', budgetAmount: 20, metadata: {},
      }]) },
    };

    const result = await auditErrandClosure(prisma, new Date('2026-07-22T12:00:00.000Z'));

    expect(result.counts).toEqual({
      arrivedWithoutDeadline: 1,
      completedWithoutReceiptSource: 1,
      completedWithOpenAppeal: 1,
      refundingOver30Minutes: 1,
      settlementSourcesWithoutItems: 1,
      unknownCustomBudgetUnits: 1,
    });
    expect(result.orderIds.settlementSourcesWithoutItems).toEqual(['settled-without-item-1']);
    expect(Object.keys(prisma).some(key => /update|create|delete/i.test(key))).toBe(false);
  });

  it('defaults receipt backfill to dry-run', async () => {
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            id: 'arrived-1', deliverTime: new Date('2026-07-20T10:00:00.000Z'), updatedAt: new Date('2026-07-20T10:05:00.000Z'),
          }])
          .mockResolvedValueOnce([{
            id: 'completed-1', receiptConfirmedAt: null, receiptConfirmedBy: null,
            completeTime: new Date('2026-07-20T11:00:00.000Z'), updatedAt: new Date('2026-07-20T11:05:00.000Z'),
          }]),
        updateMany: jest.fn(),
      },
    };

    const result = await runBackfill([], prisma);

    expect(result).toEqual(expect.objectContaining({ applied: false, arrivedCandidates: 1, completedCandidates: 1 }));
    expect(prisma.errandOrder.updateMany).not.toHaveBeenCalled();
  });

  it('updates only receipt fields after explicit apply', async () => {
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            id: 'arrived-1', deliverTime: new Date('2026-07-20T10:00:00.000Z'), updatedAt: new Date('2026-07-20T10:05:00.000Z'),
          }])
          .mockResolvedValueOnce([{
            id: 'completed-1', receiptConfirmedAt: null, receiptConfirmedBy: null,
            completeTime: new Date('2026-07-20T11:00:00.000Z'), updatedAt: new Date('2026-07-20T11:05:00.000Z'),
          }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await runBackfill(['--apply'], prisma);

    expect(result).toEqual(expect.objectContaining({ applied: true, updatedArrived: 1, updatedCompleted: 1 }));
    expect(prisma.errandOrder.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'arrived-1', status: 'arrived', receiptConfirmDeadline: null },
      data: { receiptConfirmDeadline: new Date('2026-07-21T10:00:00.000Z') },
    });
    expect(prisma.errandOrder.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'completed-1', status: 'completed',
        receiptConfirmedAt: null, receiptConfirmedBy: null,
      },
      data: {
        receiptConfirmedAt: new Date('2026-07-20T11:00:00.000Z'),
        receiptConfirmedBy: 'legacy',
      },
    });
    for (const call of prisma.errandOrder.updateMany.mock.calls) {
      expect(call[0].data).not.toHaveProperty('settlementEligibleAt');
    }
  });

  it('fills a missing legacy receipt source without replacing its existing timestamp', async () => {
    const receiptAt = new Date('2026-07-20T11:00:00.000Z');
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            id: 'completed-1', receiptConfirmedAt: receiptAt, receiptConfirmedBy: null,
            completeTime: receiptAt, updatedAt: receiptAt,
          }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(runBackfill(['--apply'], prisma)).resolves.toEqual(expect.objectContaining({ updatedCompleted: 1 }));
    expect(prisma.errandOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'completed-1', status: 'completed', receiptConfirmedBy: null },
      data: { receiptConfirmedBy: 'legacy' },
    });
  });
});

describe('Errand closure acceptance flow', () => {
  it('allows exactly one rider and writes one accept node under a concurrent claim', async () => {
    const state: any = {
      id: 'errand-1', orderNo: 'ERR-1', userId: 'user-1', status: 'pending_accept', riderId: null,
      refundStatus: 'none', regionId: 'region-1', receiverType: 'approved_rider', type: 'pickup', tasks: [],
    };
    const nodes: any[] = [];
    const riders: Record<string, any> = {
      'rider-1': { userId: 'rider-1', regionId: 'region-1', riderType: 'official', verifyStatus: 'approved', status: 'online' },
      'rider-2': { userId: 'rider-2', regionId: 'region-1', riderType: 'official', verifyStatus: 'approved', status: 'online' },
    };
    const tx: any = {
      errandOrder: {
        findUnique: jest.fn(async () => ({ ...state })),
        updateMany: jest.fn(async ({ data }: any) => {
          if (state.status !== 'pending_accept' || state.riderId) return { count: 0 };
          Object.assign(state, data);
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn(async () => ({ ...state, User: {}, RegionRider: {} })),
      },
      regionRider: {
        findUnique: jest.fn(async ({ where }: any) => ({ ...riders[where.userId] })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const rider = riders[where.userId];
          if (!rider || rider.status !== 'online') return { count: 0 };
          Object.assign(rider, data);
          return { count: 1 };
        }),
      },
      deliveryOrderNode: { create: jest.fn(async ({ data }: any) => nodes.push(data)) },
    };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: state.id }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const notifyService = { createAndDispatch: jest.fn().mockResolvedValue({ id: 'notification-1' }) };
    const service = new ErrandService(prisma, {} as any, notifyService as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getOrderTakingPolicy').mockResolvedValue({});
    jest.spyOn(service as any, 'getRiderDispatchContext').mockResolvedValue({ activeOrdersCount: 0 });
    jest.spyOn(service as any, 'formatMiniOrders').mockResolvedValue([{}]);
    jest.spyOn(service as any, 'recordErrandLearningSnapshot').mockResolvedValue(undefined);

    const results = await Promise.allSettled([
      (service as any).acceptOrderUnlocked(state.id, 'rider-1'),
      (service as any).acceptOrderUnlocked(state.id, 'rider-2'),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(nodes.filter(node => node.nodeType === 'accepted')).toHaveLength(1);
    expect(['rider-1', 'rider-2']).toContain(state.riderId);
    expect(notifyService.createAndDispatch).toHaveBeenCalledTimes(1);
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: state.userId,
      scene: 'errand_accepted',
      channelMask: expect.objectContaining({
        inApp: true,
        websocket: true,
        wechatSubscribe: true,
        officialAccount: true,
      }),
    }));
  });

  it('moves rider-arrived to user-confirmed and creates settlement eligibility', async () => {
    const state: any = {
      id: 'errand-1', orderNo: 'ERR-1', userId: 'user-1', riderId: 'rider-1', regionId: 'region-1',
      status: 'in_progress', refundStatus: 'none', deliveryDisplayMode: 'status_nodes', remark: '{}',
    };
    const nodes: any[] = [];
    const tx: any = {
      errandOrder: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (state.status !== where.status) return { count: 0 };
          Object.assign(state, data);
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn(async () => ({ ...state })),
      },
      deliveryOrderNode: { create: jest.fn(async ({ data }: any) => nodes.push(data)) },
    };
    const prisma: any = {
      errandOrder: {
        findUnique: jest.fn(async () => ({ ...state })),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { count: jest.fn().mockResolvedValue(0) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ErrandLifecycleService(prisma);

    await service.markArrived(state.id, 'rider-1', { proof_images: ['/proof.jpg'] });
    await service.confirmReceipt(state.id, 'user-1', 'user');

    expect(state).toEqual(expect.objectContaining({
      status: 'completed', receiptConfirmedBy: 'user',
      receiptConfirmedAt: expect.any(Date), settlementEligibleAt: expect.any(Date),
    }));
    expect(nodes.map(node => node.nodeType)).toEqual(['arrived', 'completed']);
  });

  it('holds an overdue auto receipt while an appeal is open', async () => {
    const dueOrder = {
      id: 'errand-1', orderNo: 'ERR-1', userId: 'user-1', regionId: 'region-1',
      status: 'arrived', refundStatus: 'none', receiptConfirmDeadline: new Date('2026-07-21T00:00:00.000Z'),
    };
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([dueOrder]) },
      config: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([{ orderId: dueOrder.id }]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ErrandLifecycleService(prisma);
    const confirm = jest.spyOn(service, 'confirmReceipt');

    await expect(service.autoConfirmDueOrders(new Date('2026-07-22T00:00:00.000Z')))
      .resolves.toEqual({ checked: 1, completed: 0, held: 1 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('handles partial then full balance refund without WeChat and creates paid-settlement liabilities', async () => {
    const payment: any = {
      id: 'payment-1', paymentNo: 'PAY-1', orderNo: 'ERR-1', userId: 'user-1',
      bizType: 'errand_order', bizId: 'errand-1', amount: 10, refundedAmount: 0,
      status: 'paid', channel: 'balance',
    };
    const errand: any = { id: 'errand-1', status: 'completed', refundStatus: 'none', refundAmount: null };
    let walletBalance = 0;
    let refundSequence = 0;
    const tx: any = {
      paymentRefund: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        updateMany: jest.fn(async ({ data }: any) => {
          walletBalance += Number(data.balance.increment);
          return { count: 1 };
        }),
        findUnique: jest.fn(async () => ({ balance: walletBalance })),
      },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      paymentOrder: { update: jest.fn(async ({ data }: any) => Object.assign(payment, data)) },
      errandOrder: { update: jest.fn(async ({ data }: any) => Object.assign(errand, data)) },
      platformLedger: { create: jest.fn().mockResolvedValue({}) },
      riderSettlementItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1', riderId: 'rider-1', payableAmount: 10, status: 'included',
          settlement: { id: 'settlement-1', status: 'PAID' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      riderLiability: { upsert: jest.fn().mockResolvedValue({}) },
      deliveryRiskEvent: { findFirst: jest.fn(), create: jest.fn() },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      paymentOrder: { findFirst: jest.fn(async () => ({ ...payment })) },
      paymentRefund: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ id: `refund-${++refundSequence}`, ...data })),
        updateMany: jest.fn(),
      },
      errandOrder: { findUnique: jest.fn(async () => ({ ...errand })) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const redis: any = { getLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(undefined) };
    const notify: any = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    const membership: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue({}) };
    const service = new PaymentService({} as any, prisma, redis, notify, membership, {} as any);
    const wxRequest = jest.spyOn(service as any, 'wxPayRequest');
    jest.spyOn(service as any, 'notifyShopRefundSuccess').mockResolvedValue(undefined);

    await service.refund({ bizType: 'errand_order', bizId: 'errand-1', amount: 4, reason: '部分退款' });
    expect(errand).toEqual(expect.objectContaining({ status: 'completed', refundStatus: 'partial', refundAmount: 4 }));
    await service.refund({ bizType: 'errand_order', bizId: 'errand-1', amount: 6, reason: '剩余退款' });

    expect(errand).toEqual(expect.objectContaining({ status: 'refunded', refundStatus: 'refunded', refundAmount: 10 }));
    expect(walletBalance).toBe(10);
    expect(wxRequest).not.toHaveBeenCalled();
    expect(tx.riderLiability.upsert).toHaveBeenCalledTimes(2);
  });

  it('excludes appealed orders when generating settlement items', async () => {
    const tx: any = {
      riderSettlement: { create: jest.fn().mockResolvedValue({ id: 'settlement-1' }) },
      riderSettlementItem: { create: jest.fn().mockResolvedValue({}) },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      riderSettlement: { findFirst: jest.fn().mockResolvedValue(null) },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([{ orderId: 'appealed-1' }]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) };
    const service = new FinanceAdminService(prisma, {} as any, scope);
    jest.spyOn(service as any, 'getCompletedRiderEarnings').mockResolvedValue([
      { source: 'errand', orderId: 'appealed-1', riderId: 'rider-1', regionId: 'region-1', amount: 8, price: 8, tip: 0 },
      { source: 'errand', orderId: 'eligible-1', riderId: 'rider-1', regionId: 'region-1', amount: 8, price: 8, tip: 0 },
    ]);

    await expect(service.generateRiderSettlements({
      periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-02T00:00:00.000Z', regionId: 'region-1',
    }, 'admin-1')).resolves.toEqual(expect.objectContaining({ count: 1 }));
    expect(tx.riderSettlementItem.create).toHaveBeenCalledTimes(1);
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'eligible-1' }),
    });
  });
});
