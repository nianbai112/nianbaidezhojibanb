import { FinanceService } from './finance.service';

describe('FinanceService withdrawal compatibility', () => {
  it('accepts the mini-program withdrawal fields and freezes the exact balance once', async () => {
    const tx: any = {
      withdraw: { create: jest.fn().mockResolvedValue({ id: 'withdraw-1', amount: 10 }) },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 20 }) },
      withdraw: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new FinanceService(prisma, {
      getLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    } as any);

    await expect(service.withdraw('user-1', {
      amount: 10, withdraw_type: 'wechat', receiver_name: '微信收款人',
    } as any)).resolves.toEqual(expect.objectContaining({ id: 'withdraw-1', amount: 10 }));

    expect(tx.withdraw.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      channel: 'WX_PAY', account: '微信收款人', realName: '微信收款人',
    }) }));
    expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', balance: { gte: 10 } },
    }));
  });
});
