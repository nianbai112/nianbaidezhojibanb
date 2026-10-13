import { ErrandLifecycleService } from './errand-lifecycle.service';
import { inspectErrandAssignmentRisk } from './errand-assignment-guard';

jest.mock('./errand-assignment-guard', () => ({
  inspectErrandAssignmentRisk: jest.fn(),
  recordErrandAssignmentRisk: jest.requireActual('./errand-assignment-guard').recordErrandAssignmentRisk,
}));

describe('代买送达期限与管理员确认收货', () => {
  const now = new Date('2026-10-09T08:00:00Z');
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    (inspectErrandAssignmentRisk as jest.Mock).mockResolvedValue({ allowed: true, blocked: false, signals: [] });
  });
  afterEach(() => jest.useRealTimers());

  function fixture(patch: any = {}) {
    const state: any = {
      id: 'purchase-1', type: 'purchase', orderNo: 'P-001', userId: 'buyer', riderId: 'rider',
      regionId: 'school', status: 'arrived', refundStatus: 'none', price: 10, tip: 0,
      receiptConfirmDeadline: new Date(now.getTime() - 1000), receiptConfirmedAt: null,
      ...patch,
    };
    const account = { balance: 0, transactions: [] as any[], events: [] as any[], audits: [] as any[], risks: [] as any[] };
    const tx: any = {
      errandOrder: {
        findUnique: jest.fn(async () => ({ ...state })),
        findUniqueOrThrow: jest.fn(async () => ({ ...state })),
        update: jest.fn(async ({ data }: any) => Object.assign(state, data)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (state.status !== where.status || ['refunding', 'refunded'].includes(state.refundStatus)
            || (where.receiptConfirmDeadline && (!state.receiptConfirmDeadline || state.receiptConfirmDeadline > where.receiptConfirmDeadline.lte))) return { count: 0 };
          Object.assign(state, data);
          return { count: 1 };
        }),
      },
      errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({}) },
      errandPurchase: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(async () => ({ order: { ...state }, stops: [], changes: [], refunds: [] })),
      },
      config: { findUnique: jest.fn().mockResolvedValue(null) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: {
        findFirst: jest.fn(async ({ where }: any) => account.risks.find(row =>
          !row.handled && (!where.eventType || row.eventType === where.eventType)
          && (!where.eventLevel || where.eventLevel.in.includes(row.eventLevel))) || null),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `risk-${account.risks.length + 1}`, handled: false, ...data };
          account.risks.push(row);
          return row;
        }),
      },
      errandSettlementHold: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      bizFeeConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
      purchaseEvent: { create: jest.fn(async ({ data }: any) => { account.events.push(data); return data; }) },
      adminOperationLog: { create: jest.fn(async ({ data }: any) => { account.audits.push(data); return data; }) },
      riderSettlementItem: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      riderSettlement: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'settlement' }),
      },
      riderLiability: { findMany: jest.fn().mockResolvedValue([]) },
      wallet: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn(async ({ data }: any) => { account.balance += data.balance.increment; return { count: 1 }; }),
        findUniqueOrThrow: jest.fn(async () => ({ balance: account.balance })),
      },
      walletTransaction: { create: jest.fn(async ({ data }: any) => { account.transactions.push(data); return data; }) },
    };
    let queue = Promise.resolve();
    const prisma: any = {
      errandOrder: { findUnique: jest.fn(async () => ({ ...state })), count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      config: { findUnique: jest.fn().mockResolvedValue(null) },
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((callback: any) => {
        const result = queue.then(async () => {
          const snapshot = { ...state };
          const balance = account.balance;
          const lengths = [account.transactions.length, account.events.length, account.audits.length, account.risks.length];
          try { return await callback(tx); }
          catch (error) {
            Object.assign(state, snapshot); account.balance = balance;
            account.transactions.length = lengths[0]; account.events.length = lengths[1]; account.audits.length = lengths[2]; account.risks.length = lengths[3];
            throw error;
          }
        });
        queue = result.then(() => undefined, () => undefined);
        return result;
      }),
    };
    return { state, prisma, tx, account, service: new ErrandLifecycleService(prisma) };
  }

  it.each([1, 6, 24, 720])('代买在送达时读取当前校区 %s 小时，不使用下单快照', async hours => {
    const { state, prisma, service } = fixture({ status: 'in_progress', receiptConfirmDeadline: null });
    prisma.config.findUnique.mockResolvedValue({ value: { autoReceiptHours: hours } });
    await service.markArrived(state.id, 'rider');
    expect(prisma.config.findUnique).toHaveBeenCalledWith({ where: { key: 'errand_purchase:school' }, select: { value: true } });
    expect(state.receiptConfirmDeadline).toEqual(new Date(now.getTime() + hours * 3600000));
  });

  it('未配置代买时沿用24小时，普通跑腿保持24小时且不读取代买配置', async () => {
    const purchase = fixture({ status: 'in_progress' });
    await purchase.service.markArrived(purchase.state.id, 'rider');
    expect(purchase.state.receiptConfirmDeadline).toEqual(new Date(now.getTime() + 24 * 3600000));
    const errand = fixture({ type: 'pickup', status: 'in_progress' });
    await errand.service.markArrived(errand.state.id, 'rider');
    expect(errand.state.receiptConfirmDeadline).toEqual(new Date(now.getTime() + 24 * 3600000));
    expect(errand.prisma.config.findUnique).not.toHaveBeenCalled();
  });

  it('重复送达不改已有截止时间', async () => {
    const { state, prisma, service } = fixture();
    const deadline = state.receiptConfirmDeadline;
    await expect(service.markArrived(state.id, 'rider')).rejects.toThrow('状态');
    expect(state.receiptConfirmDeadline).toBe(deadline);
    expect(prisma.config.findUnique).not.toHaveBeenCalled();
  });

  it.each(['', '  ', 'a'.repeat(501)])('管理员必须提供1至500字原因', async reason => {
    const { service, prisma } = fixture();
    await expect(service.confirmReceipt('purchase-1', 'admin', 'admin', undefined, { adminReason: reason })).rejects.toThrow('原因');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('管理员完成和配送收益、节点、审计、代买记录在同一事务，重试不重复入账', async () => {
    const { service, state, tx, account, prisma } = fixture();
    await service.confirmReceipt(state.id, 'admin-1', 'admin', undefined, { adminReason: ' 电话核实买家已收到 ' });
    expect(state).toMatchObject({ status: 'completed', receiptConfirmedBy: 'admin', receiptConfirmedAt: now });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' });
    expect(account.balance).toBe(10);
    expect(account.transactions).toHaveLength(1);
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operatorId: 'admin-1', operatorType: 'admin', remark: '电话核实买家已收到', nodeLabel: '管理员代确认收货' }) });
    expect(account.audits).toEqual([expect.objectContaining({ accountId: 'admin-1', action: 'CONFIRM_ERRAND_RECEIPT', targetId: state.id, detail: expect.objectContaining({ reason: '电话核实买家已收到' }) })]);
    expect(account.events).toEqual([expect.objectContaining({ actorId: 'admin-1', kind: 'receipt_confirmed', data: expect.objectContaining({ source: 'admin' }) })]);
    await service.confirmReceipt(state.id, 'admin-1', 'admin', undefined, { adminReason: '重复点击' });
    expect(account.balance).toBe(10);
    expect(account.audits).toHaveLength(1);
    expect(account.events).toHaveLength(1);
  });

  it.each(['admin', 'system'] as const)('%s事务重新检查退款、申诉与严重风险', async source => {
    for (const blocked of ['refund', 'appeal', 'risk']) {
      const { service, state, tx, account } = fixture();
      if (blocked === 'refund') tx.errandPurchase.findUnique.mockImplementation(async () => ({ order: { ...state, refundStatus: 'refunding' } }));
      if (blocked === 'appeal') tx.orderAppeal.findFirst.mockResolvedValue({ id: 'appeal' });
      if (blocked === 'risk') tx.deliveryRiskEvent.findFirst.mockResolvedValue({ id: 'risk', eventType: 'fraud' });
      await expect(service.confirmReceipt(state.id, source === 'admin' ? 'admin' : 'buyer', source, undefined, { adminReason: '核实' })).rejects.toThrow();
      expect(tx.errandOrder.updateMany).not.toHaveBeenCalled();
      expect(account.balance).toBe(0);
      expect(account.audits).toHaveLength(0);
    }
  });

  it.each(['admin', 'system'] as const)('%s发现新严重风险后保留可处理事件，重复阻断不入账，处理后才完成', async source => {
    const { service, state, tx, account } = fixture();
    (inspectErrandAssignmentRisk as jest.Mock).mockResolvedValue({
      allowed: false, blocked: true, eventType: 'related_account', eventLevel: 'error', signals: ['shared_device'],
    });
    const confirm = () => service.confirmReceipt(state.id, source === 'admin' ? 'admin' : 'buyer', source, undefined, { adminReason: '人工核实' });
    for (let retry = 0; retry < 2; retry += 1) {
      await expect(confirm()).rejects.toThrow('严重风险');
      expect(state.status).toBe('arrived');
      expect(account.balance).toBe(0);
      expect(account.transactions).toHaveLength(0);
      expect(account.audits).toHaveLength(0);
      expect(account.events).toHaveLength(0);
      expect(account.risks).toEqual([expect.objectContaining({ eventType: 'related_account', handled: false })]);
      expect(tx.errandOrder.updateMany).not.toHaveBeenCalled();
    }
    expect(tx.deliveryRiskEvent.create).toHaveBeenCalledTimes(1);
    account.risks[0].handled = true;
    (inspectErrandAssignmentRisk as jest.Mock).mockResolvedValue({ allowed: true, blocked: false, signals: [] });
    await expect(confirm()).resolves.toMatchObject({ status: 'completed', receiptConfirmedBy: source });
    await confirm();
    expect(account.balance).toBe(10);
    expect(account.transactions).toHaveLength(1);
    expect(account.events).toHaveLength(1);
    expect(account.audits).toHaveLength(source === 'admin' ? 1 : 0);
  });

  it('用户自行确认遇严重风险仍保持原有完成但冻结收益规则', async () => {
    const { service, state, tx, account } = fixture();
    (inspectErrandAssignmentRisk as jest.Mock).mockResolvedValue({
      allowed: false, blocked: true, eventType: 'related_account', eventLevel: 'error', signals: ['shared_device'],
    });
    await expect(service.confirmReceipt(state.id, 'buyer', 'user')).resolves.toMatchObject({ status: 'completed' });
    expect(account.risks).toHaveLength(1);
    expect(account.balance).toBe(0);
    expect(tx.errandSettlementHold.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'holding' }) }));
  });

  it('系统仍按该订单原截止时间判断，不按最新设置提前完成', async () => {
    for (const deadline of [null, new Date(now.getTime() + 3600000)]) {
      const { service, state, tx } = fixture({ receiptConfirmDeadline: deadline });
      await expect(service.confirmReceipt(state.id, 'buyer', 'system')).rejects.toThrow('自动确认收货时间');
      expect(tx.errandOrder.updateMany).not.toHaveBeenCalled();
    }
  });

  it('系统事务内重新检查自动确认开关', async () => {
    const { service, state, tx } = fixture();
    tx.config.findUnique.mockResolvedValue({ value: { autoReceiptEnabled: false } });
    await expect(service.confirmReceipt(state.id, 'buyer', 'system')).rejects.toThrow('已关闭');
    expect(tx.errandOrder.updateMany).not.toHaveBeenCalled();
  });

  it('用户与管理员、系统并发确认只入账一次', async () => {
    const { service, state, account } = fixture();
    const results = await Promise.allSettled([
      service.confirmReceipt(state.id, 'buyer', 'user'),
      service.confirmReceipt(state.id, 'admin', 'admin', undefined, { adminReason: '核实完成' }),
      service.confirmReceipt(state.id, 'buyer', 'system'),
    ]);
    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    expect(state.status).toBe('completed');
    expect(account.balance).toBe(10);
    expect(account.transactions).toHaveLength(1);
    expect(account.events).toHaveLength(1);
    expect(account.audits.length).toBeLessThanOrEqual(1);
  });

  it('入账失败则完成状态回滚，不留下假完成订单', async () => {
    const { service, state, tx, account } = fixture();
    tx.wallet.updateMany.mockRejectedValue(new Error('wallet unavailable'));
    await expect(service.confirmReceipt(state.id, 'admin', 'admin', undefined, { adminReason: '核实' })).rejects.toThrow('wallet unavailable');
    expect(state.status).toBe('arrived');
    expect(account.balance).toBe(0);
    expect(account.audits).toHaveLength(0);
    expect(account.events).toHaveLength(0);
  });
});
