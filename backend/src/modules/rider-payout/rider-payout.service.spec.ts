import { RiderPayoutService } from './rider-payout.service';
import { WechatTransferError } from './wechat-transfer.gateway';

const cfg = { appid: 'wx-app', mchid: 'merchant' };
const auth = { userId: 'rider', appid: cfg.appid, mchid: cfg.mchid, openid: 'open-rider',
  sceneId: '1005', outAuthorizationNo: 'auth-business-no', authorizationId: 'wx-auth', enabled: true, state: 'TAKING_EFFECT' };
const order = { id: 'order-1', orderNo: 'E001', riderId: 'rider', userId: 'buyer',
  status: 'completed', receiptConfirmedAt: new Date(), settlementEligibleAt: new Date(0), refundStatus: 'none' };
const apply = (row: any, data: any) => {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) row[key] += Number(value.increment);
    else if (value && typeof value === 'object' && 'decrement' in value) row[key] -= Number(value.decrement);
    else row[key] = value;
  }
};
function harness() {
  let state: any = { wallet: { balance: 8, freeze: 0, totalOut: 0 }, payouts: [], withdraws: [], logs: [] };
  const db: any = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: { riderAutoPayoutEnabled: true } }) },
    user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', openid: auth.openid }) },
    riderWechatAuthorization: { findUnique: jest.fn().mockResolvedValue(auth) },
    errandOrder: { findUnique: jest.fn().mockResolvedValue(order), findFirst: jest.fn().mockResolvedValue(null) },
    riderSettlementItem: { findFirst: jest.fn().mockResolvedValue({ status: 'included', reversalAmount: 0 }) },
    errandPurchase: { findUnique: jest.fn().mockResolvedValue({ reimbursementStatus: 'paid', reimbursedCents: 500 }) },
    errandSettlementHold: { findFirst: jest.fn().mockResolvedValue(null) },
    deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    riderLiability: { findFirst: jest.fn().mockResolvedValue(null) },
    orderAppeal: { findMany: jest.fn().mockResolvedValue([]) },
    riderWechatPayout: {
      create: jest.fn(async ({ data }) => {
        if (state.payouts.some((r: any) => r.orderId === data.orderId && r.kind === data.kind)) throw new Error('unique order');
        const row = { attempts: 0, firstSentAt: null, createdAt: new Date(), ...data }; state.payouts.push(row); return row;
      }),
      findUnique: jest.fn(async ({ where }) => state.payouts.find((r: any) => r.id === where.id) || null),
      findUniqueOrThrow: jest.fn(async ({ where }) => state.payouts.find((r: any) => r.id === where.id)),
      findMany: jest.fn(async () => state.payouts.filter((r: any) => ['QUEUED', 'SENDING', 'UNKNOWN', 'REVIEW'].includes(r.status))),
      update: jest.fn(async ({ where, data }) => { const row = state.payouts.find((r: any) => r.id === where.id); apply(row, data); return row; }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = state.payouts.find((r: any) => r.id === where.id);
        if (!row || (where.status?.in && !where.status.in.includes(row.status)) ||
          (typeof where.status === 'string' && where.status !== row.status) ||
          (where.firstSentAt === null && row.firstSentAt !== null)) return { count: 0 };
        apply(row, data); return { count: 1 };
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountFen: 0 } }),
    },
    wallet: {
      updateMany: jest.fn(async ({ where, data }) => {
        if ((where.balance && state.wallet.balance < where.balance.gte) ||
          (where.freeze && state.wallet.freeze < where.freeze.gte)) return { count: 0 };
        apply(state.wallet, data); return { count: 1 };
      }),
      findUnique: jest.fn(async () => ({ ...state.wallet })),
      findUniqueOrThrow: jest.fn(async () => ({ ...state.wallet })),
    },
    withdraw: {
      create: jest.fn(async ({ data }) => { state.withdraws.push(data); return data; }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = state.withdraws.find((r: any) => r.id === where.id && r.status === where.status &&
          r.userId === where.userId && r.amount === where.amount && r.channel === where.channel);
        if (!row) return { count: 0 }; apply(row, data); return { count: 1 };
      }),
    },
    walletTransaction: {
      create: jest.fn(async ({ data }) => { state.logs.push(data); return data; }),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = state.logs.filter((r: any) => r.orderNo === where.orderNo && r.status === where.status && r.amount === where.amount);
        rows.forEach((r: any) => apply(r, data)); return { count: rows.length };
      }),
    },
    $transaction: jest.fn(async (fn) => {
      const before = structuredClone(state);
      try { return await fn(db); } catch (error) { state = before; throw error; }
    }),
  };
  const gateway: any = { runtime: jest.fn().mockResolvedValue(cfg), request: jest.fn() };
  const redis: any = { withRenewingLock: jest.fn(async (_k, _ttl, fn) => fn()) };
  const notify: any = { createAndDispatch: jest.fn().mockResolvedValue({}) };
  const service = new RiderPayoutService(db, redis, gateway, notify);
  const reserve = () => db.$transaction((tx: any) => service.reserve(tx, order, 8));
  const result = (row: any, extra = {}) => ({ out_bill_no: row.id, mch_id: cfg.mchid, appid: cfg.appid,
    transfer_amount: 800, transfer_bill_no: 'wx-transfer', openid: auth.openid, state: 'SUCCESS', ...extra });
  return { db, gateway, notify, service, reserve, result, state: () => state };
}

describe('rider WeChat automatic payout financial invariants', () => {
  it.each([8.8, 16.7, 0.1, 11])('settles an exact-balance %.2f payment with decimal database parameters', async amount => {
    const h = harness();
    h.state().wallet.balance = amount;
    const amountFen = Math.round(amount * 100);
    const decimal = (amountFen / 100).toFixed(2);
    await h.db.$transaction((tx: any) => h.service.reserve(tx, order, amount, 'purchase_principal'));
    const row = h.state().payouts[0];
    expect(row.amountFen).toBe(amountFen);
    expect(h.db.wallet.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'rider', balance: { gte: decimal } },
      data: { balance: { decrement: decimal }, freeze: { increment: decimal } },
    });
    expect(h.state().wallet).toEqual({ balance: 0, freeze: amount, totalOut: 0 });
    await h.service.consume(row, h.result(row, { transfer_amount: amountFen }));
    await h.service.consume(row, h.result(row, { transfer_amount: amountFen }));
    expect(h.db.withdraw.updateMany.mock.calls[0][0].where.amount).toBe(decimal);
    expect(h.db.walletTransaction.updateMany.mock.calls[0][0].where.amount).toBe(decimal);
    expect(h.db.wallet.updateMany.mock.calls[1][0].where.freeze.gte).toBe(decimal);
    expect(h.state().wallet).toEqual({ balance: 0, freeze: 0, totalOut: amount });
    expect(h.state().payouts[0].status).toBe('SUCCESS');
    expect(h.state().logs.filter((r: any) => r.type === 'WITHDRAW')).toHaveLength(1);
  });

  it('still rejects a balance that is one cent short, without reserving or paying', async () => {
    const h = harness();
    h.state().wallet.balance = 8.79;
    await expect(h.db.$transaction((tx: any) => h.service.reserve(tx, order, 8.8, 'purchase_principal')))
      .rejects.toThrow('自动转账冻结余额失败');
    expect(h.state().wallet).toEqual({ balance: 8.79, freeze: 0, totalOut: 0 });
    expect(h.state().payouts).toHaveLength(0);
    expect(h.state().withdraws).toHaveLength(0);
    expect(h.gateway.request).not.toHaveBeenCalled();
  });

  it.each([{ amount: 9 }, { userId: 'another-user' }, { channel: 'ALIPAY' }])('rejects a conflicting withdrawal %j', async change => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    Object.assign(h.state().withdraws[0], change);
    await expect(h.service.consume(row, h.result(row))).rejects.toThrow('账目状态冲突');
    expect(h.state().payouts[0].status).toBe('QUEUED');
    expect(h.state().wallet.freeze).toBe(8);
  });
  it('keeps sub-minimum income available without freezing or issuing an invalid WeChat payment', async () => {
    const h = harness(); await h.db.$transaction((tx: any) => h.service.reserve(tx, order, 0.09));
    expect(h.state().payouts[0]).toMatchObject({ amountFen: 9, status: 'WALLET', withdrawId: null });
    expect(h.state().wallet.freeze).toBe(0);
    expect(h.state().withdraws).toHaveLength(0);
    await h.service.process(h.state().payouts[0].id);
    expect(h.gateway.request).not.toHaveBeenCalled();
  });
  it('reserves income exactly at the WeChat minimum', async () => {
    const h = harness(); await h.db.$transaction((tx: any) => h.service.reserve(tx, order, 0.10));
    expect(h.state().payouts[0]).toMatchObject({ amountFen: 10, status: 'QUEUED' });
    expect(h.state().wallet.freeze).toBe(0.10);
  });
  it.each(['missing', 'duplicate', 'wrong-amount'])('rolls back a terminal transition with a %s ledger', async problem => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    if (problem === 'missing') h.state().logs = [];
    if (problem === 'duplicate') h.state().logs.push({ ...h.state().logs[0] });
    if (problem === 'wrong-amount') h.state().logs[0].amount = 9;
    await expect(h.service.consume(row, h.result(row))).rejects.toThrow('流水不一致');
    expect(h.state().payouts[0].status).toBe('QUEUED');
    expect(h.state().withdraws[0].status).toBe('PROCESSING');
    expect(h.state().wallet).toEqual({ balance: 0, freeze: 8, totalOut: 0 });
  });
  it('rejects an authorization lookup belonging to a different recipient', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    h.gateway.request.mockResolvedValue({ state: 'TAKING_EFFECT', authorization_id: auth.authorizationId,
      out_authorization_no: auth.outAuthorizationNo, openid: 'other-recipient' });
    await h.service.process(row.id);
    expect(h.gateway.request.mock.calls.map((c: any[]) => c[0])).toEqual(['GET']);
    expect(h.state().wallet.balance).toBe(8);
  });
  it('checks the new day limit before retrying yesterday\'s missing bill', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    const start = new Date(`${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}T00:00:00+08:00`);
    row.firstSentAt = row.lastSentAt = new Date(start.getTime() - 1000);
    // Keep the original instruction within its 24-hour automatic retry period.
    jest.spyOn(Date, 'now').mockReturnValue(start.getTime() + 3600000);
    try {
      h.gateway.request.mockRejectedValue(new WechatTransferError('NOT_FOUND', 404));
      h.db.riderWechatPayout.aggregate.mockResolvedValue({ _sum: { amountFen: 5000000 } });
      await h.service.process(row.id);
      expect(h.gateway.request).toHaveBeenCalledTimes(1);
      expect(h.gateway.request.mock.calls[0][0]).toBe('GET');
      expect(h.state().wallet.freeze).toBe(8);
      expect(row.reason).toContain('今日自动转账额度');
    } finally { jest.restoreAllMocks(); }
  });
  it('returns an unsent reservation if the merchant changes, without issuing a payment', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    h.gateway.runtime.mockResolvedValue({ ...cfg, mchid: 'replacement-merchant' });
    await h.service.process(row.id);
    expect(h.state().wallet).toEqual({ balance: 8, freeze: 0, totalOut: 0 });
    expect(h.state().payouts[0].status).toBe('CANCELLED');
    expect(h.gateway.request).not.toHaveBeenCalled();
  });
  it('keeps an attempted payment frozen when merchant credentials change', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; row.firstSentAt = new Date();
    h.gateway.runtime.mockResolvedValue({ ...cfg, mchid: 'replacement-merchant' });
    await expect(h.service.process(row.id)).rejects.toThrow('不可使用新商户');
    expect(h.state().wallet.freeze).toBe(8);
    expect(h.gateway.request).not.toHaveBeenCalled();
  });
  it('reserves exactly the credited net income and creates one existing withdrawal record', async () => {
    const h = harness(); await h.reserve();
    expect(h.state().wallet).toEqual({ balance: 0, freeze: 8, totalOut: 0 });
    expect(h.state().withdraws).toHaveLength(1);
    expect(h.state().payouts[0].amountFen).toBe(800);
    await expect(h.reserve()).rejects.toThrow('unique order');
    expect(h.state().wallet.freeze).toBe(8);
  });
  it('does not reserve historical balance when authorization is missing or the switch is off', async () => {
    const h = harness(); h.db.riderWechatAuthorization.findUnique.mockResolvedValue(null);
    await h.reserve(); expect(h.state().wallet.balance).toBe(8); expect(h.state().payouts).toHaveLength(0);
    h.db.config.findUnique.mockResolvedValue({ value: {} }); await h.reserve();
    expect(h.state().payouts).toHaveLength(0);
  });
  it('keeps an over-limit order whole in the wallet without splitting', async () => {
    const h = harness(); h.db.config.findUnique.mockResolvedValue({ value: { riderAutoPayoutEnabled: true, riderTransferMaxAmount: 5 } });
    await h.reserve(); expect(h.state().payouts[0].status).toBe('WALLET');
    expect(h.state().withdraws).toHaveLength(0); expect(h.state().wallet.balance).toBe(8);
  });
  it.each(['errandSettlementHold', 'deliveryRiskEvent', 'riderLiability'])('does not bypass %s', async (model) => {
    const h = harness(); h.db[model].findFirst.mockResolvedValue({ id: 'block' });
    await h.reserve(); expect(h.state().payouts[0].status).toBe('WALLET');
    expect(h.state().wallet.balance).toBe(8);
  });
  it('rejects an identity changed since authorization', async () => {
    const h = harness(); h.db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', openid: 'other-wechat' });
    await h.reserve(); expect(h.state().payouts[0].status).toBe('WALLET');
  });
  it('settles a verified success once even on duplicate concurrent delivery', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; row.firstSentAt = new Date();
    await Promise.all([h.service.consume(row, h.result(row)), h.service.consume(row, h.result(row))]);
    expect(h.state().wallet).toEqual({ balance: 0, freeze: 0, totalOut: 8 });
    expect(h.state().withdraws[0].status).toBe('SUCCESS');
  });
  it('returns money only after a verified terminal failure, and does so once', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; row.firstSentAt = new Date();
    await h.service.consume(row, h.result(row, { state: 'FAIL' }));
    await h.service.consume(row, h.result(row, { state: 'FAIL' }));
    expect(h.state().wallet).toEqual({ balance: 8, freeze: 0, totalOut: 0 });
    expect(h.state().logs.filter((r: any) => r.orderNo.startsWith('WD_RETURN_'))).toHaveLength(1);
  });
  it.each([{ transfer_amount: 801 }, { mch_id: 'other' }, { appid: 'other' }, { openid: 'other' }, { out_bill_no: 'other' }])('never consumes a mismatched result %j', async extra => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    await expect(h.service.consume(row, h.result(row, extra))).rejects.toThrow('不匹配');
    expect(h.state().wallet.freeze).toBe(8);
  });
  it('keeps uncertain or processing money frozen', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    await h.service.consume(row, h.result(row, { state: 'PROCESSING' }));
    expect(h.state().wallet.freeze).toBe(8); expect(row.status).toBe('UNKNOWN');
  });
  it('rolls back local success when the withdrawal or frozen balance disagrees', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; h.state().wallet.freeze = 0;
    await expect(h.service.consume(row, h.result(row))).rejects.toThrow('冻结余额');
    expect(h.state().payouts[0].status).toBe('QUEUED');
    expect(h.state().withdraws[0].status).toBe('PROCESSING');
  });
  it('does not let a queued cancellation release a previously attempted transfer', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; row.firstSentAt = new Date();
    await h.service.finish(row, 'CANCELLED', 'closed'); expect(h.state().wallet.freeze).toBe(8);
  });
  it('does not pay solely on rider arrival', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    h.db.errandOrder.findUnique.mockResolvedValue({ ...order, status: 'arrived', receiptConfirmedAt: null });
    await h.service.process(row.id); expect(h.gateway.request).not.toHaveBeenCalled();
    expect(h.state().wallet.balance).toBe(8);
  });
  it('waits until next Shanghai day at the daily limit without sending', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    h.db.riderWechatPayout.aggregate.mockResolvedValue({ _sum: { amountFen: 5000000 } });
    await h.service.process(row.id); expect(h.gateway.request).not.toHaveBeenCalled();
    expect(row.firstSentAt).toBeNull(); expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
  it('persists a transfer before sending and reconciles a timeout before any resend', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    h.gateway.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return { state: 'TAKING_EFFECT', authorization_id: auth.authorizationId, out_authorization_no: auth.outAuthorizationNo };
      expect(h.state().payouts[0].firstSentAt).toBeInstanceOf(Date);
      throw new Error('timeout');
    });
    await expect(h.service.process(row.id)).rejects.toThrow('timeout');
    expect(h.state().wallet.freeze).toBe(8);
    h.gateway.request.mockReset().mockResolvedValue(h.result(row));
    await h.service.process(row.id);
    expect(h.gateway.request.mock.calls.map((c: any[]) => c[0])).toEqual(['GET']);
    expect(h.state().wallet.totalOut).toBe(8);
  });
  it('retries a verified missing transfer using exactly the original number and body', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0];
    row.firstSentAt = new Date(); row.status = 'UNKNOWN'; row.requestBody = { out_bill_no: row.id, authorization_id: auth.authorizationId, transfer_amount: 800 };
    h.gateway.request.mockRejectedValueOnce(new WechatTransferError('NOT_FOUND', 404)).mockResolvedValueOnce({}).mockResolvedValueOnce(h.result(row));
    await h.service.process(row.id);
    expect(h.gateway.request.mock.calls[1].slice(0, 3)).toEqual(['POST', '/v3/fund-app/mch-transfer/transfer-bills/transfer', row.requestBody]);
    expect(h.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('still reconciles successful transfers after the platform switch is disabled', async () => {
    const h = harness(); await h.reserve(); const row = h.state().payouts[0]; row.firstSentAt = new Date();
    h.db.config.findUnique.mockResolvedValue({ value: { riderAutoPayoutEnabled: false } });
    h.gateway.request.mockResolvedValue(h.result(row)); await h.service.flush();
    expect(h.state().wallet.totalOut).toBe(8);
  });

  describe('purchase goods money', () => {
    const principal = (h: any) => h.db.$transaction((tx: any) => h.service.reserve(tx, order, 5, 'purchase_principal'));

    it('queues the goods money as a second transfer for the same order', async () => {
      const h = harness(); h.state().wallet.balance = 13;
      await h.reserve();
      await expect(principal(h)).resolves.toEqual({ status: 'QUEUED', reason: '' });
      expect(h.state().payouts.map((r: any) => [r.kind, r.amountFen])).toEqual([['delivery_fee', 800], ['purchase_principal', 500]]);
      expect(h.state().wallet).toEqual({ balance: 0, freeze: 13, totalOut: 0 });
      expect(h.state().logs[1].description).toBe('代买垫付货款自动转账 E001');
      await expect(principal(h)).rejects.toThrow('unique order');
    });

    it('transfers with a goods-money remark and tells the rider it reached WeChat', async () => {
      const h = harness(); h.state().wallet.balance = 5; await principal(h);
      const row = h.state().payouts[0];
      h.gateway.request.mockImplementation(async (method: string, url: string) => {
        if (url.includes('user-confirm-authorization')) return { state: 'TAKING_EFFECT', authorization_id: auth.authorizationId, out_authorization_no: auth.outAuthorizationNo };
        if (method === 'POST') return {};
        return h.result(row, { transfer_amount: 500 });
      });
      await h.service.process(row.id);
      expect(row.status).toBe('SUCCESS');
      expect(row.requestBody.transfer_remark).toBe('代买垫付货款返还');
      expect(h.db.riderSettlementItem.findFirst).not.toHaveBeenCalled();
      expect(h.state().logs[0].description).toBe('代买垫付货款已到账微信零钱 E001');
      expect(h.notify.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'rider', title: '代买垫付货款 ¥5.00 已到账微信零钱', linkValue: '/pagesA/wallet/wallet' }),
        `rider_payout:${row.id}`,
      );
    });

    it('keeps the money in the wallet when the reimbursement no longer matches', async () => {
      const h = harness(); h.state().wallet.balance = 5; await principal(h);
      const row = h.state().payouts[0];
      h.db.errandPurchase.findUnique.mockResolvedValue({ reimbursementStatus: 'paid', reimbursedCents: 400 });
      await h.service.process(row.id);
      expect(row.status).toBe('CANCELLED');
      expect(h.state().wallet).toEqual({ balance: 5, freeze: 0, totalOut: 0 });
      expect(h.notify.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ title: '代买垫付货款 ¥5.00 已存入钱包余额' }), `rider_payout:${row.id}`);
    });

    it('reports why money stays in the wallet', async () => {
      const h = harness(); h.db.riderWechatAuthorization.findUnique.mockResolvedValue(null);
      await expect(principal(h)).resolves.toEqual({ status: 'SKIPPED', reason: '你还没有开通微信自动收款' });
      h.db.config.findUnique.mockResolvedValue({ value: { riderAutoPayoutEnabled: true, riderTransferMaxAmount: 4 } });
      h.db.riderWechatAuthorization.findUnique.mockResolvedValue(auth);
      await expect(principal(h)).resolves.toEqual({ status: 'WALLET', reason: '本单超出自动转账额度，请从钱包申请提现' });
    });
  });
});
