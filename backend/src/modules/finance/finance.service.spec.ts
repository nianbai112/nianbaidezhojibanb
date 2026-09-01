import { FinanceService } from './finance.service';

describe('FinanceService withdrawal compatibility', () => {
  it('accepts the mini-program withdrawal fields and freezes the exact balance once', async () => {
    const tx: any = {
      withdraw: {
        create: jest.fn().mockResolvedValue({ id: 'withdraw-1', amount: 10 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      errandSettlementHold: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([]) },
      errandOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      riderLiability: { findFirst: jest.fn().mockResolvedValue(null) },
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({ version: 1 }) },
    };
    const prisma: any = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 20 }) },
      withdraw: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceService(prisma, {
      withRenewingLock: jest.fn((_key, _ttl, task) => task()),
    } as any);

    await expect(service.withdraw('user-1', {
      amount: 10, withdraw_type: 'wechat', receiver_name: '微信收款人', receiver_mobile: '13800138000',
    } as any)).resolves.toEqual(expect.objectContaining({ id: 'withdraw-1', amount: 10 }));

    expect(tx.withdraw.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      channel: 'WX_PAY', account: '13800138000', realName: '微信收款人',
    }) }));
    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', balance: { gte: 10 } },
    }));
  });

  it('blocks a rider withdrawal while one of their errand orders has an open appeal', async () => {
    const tx: any = {
      withdraw: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      wallet: { updateMany: jest.fn() },
      walletTransaction: { create: jest.fn() },
      errandSettlementHold: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([{ orderId: 'errand-1' }]) },
      errandOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'errand-1' }) },
      riderLiability: { findFirst: jest.fn().mockResolvedValue(null) },
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({ version: 1 }) },
    };
    const prisma: any = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 20 }) },
      withdraw: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceService(prisma, {
      withRenewingLock: jest.fn((_key, _ttl, task) => task()),
    } as any);

    await expect(service.withdraw('rider-1', {
      amount: 10, channel: 'WX_PAY', account: '13800138000', realName: '骑手甲',
    } as any)).rejects.toThrow('存在冻结收益、未结申诉、退款负债或未处理跑腿风险');
    expect(tx.withdraw.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported balance payouts and missing recipient identity', async () => {
    const service = new FinanceService({} as any, {
      withRenewingLock: jest.fn((_key, _ttl, task) => task()),
    } as any);

    await expect(service.withdraw('user-1', {
      amount: 10, channel: 'BALANCE', account: 'wallet', realName: '骑手甲',
    } as any)).rejects.toThrow('不支持的提现渠道');
    await expect(service.withdraw('user-1', {
      amount: 10, channel: 'WX_PAY', account: 'wx-id-1',
    } as any)).rejects.toThrow('收款人姓名不能为空');
  });

  it('does not enter the withdrawal transaction when the owned lock is busy', async () => {
    const prisma: any = { wallet: { findUnique: jest.fn() } };
    const service = new FinanceService(prisma, {
      withRenewingLock: jest.fn().mockResolvedValue(undefined),
    } as any);

    await expect(service.withdraw('user-1', {
      amount: 10, channel: 'WX_PAY', account: 'wx-id-1', realName: '骑手甲',
    } as any)).rejects.toThrow('提现申请正在处理中');
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });
});
