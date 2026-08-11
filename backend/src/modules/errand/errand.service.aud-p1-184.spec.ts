import { BadRequestException } from '@nestjs/common';
import { ErrandService } from './errand.service';

// AUD-P1-184 回归（跑腿余额支付）：
// 与商城一致，跑腿余额扣减必须走 WalletService.deductBalanceAtomic 的“balance >= amount”原子条件更新，
// 余额不足或并发透支时由数据库约束拒绝，绝不创建支付单/平台入账流水/订单终态；
// 钱包流水余额取扣减后的真实余额。同一原子方法被 mall 与 errand 复用。
// 这里用共享可变余额 + updateMany 的 gte 条件模拟数据库行级原子约束。
function makeMocks(initialBalance: number) {
  const store = { balance: initialBalance };
  const calls = {
    walletUpdateMany: 0,
    walletTransactionCreate: 0,
    paymentOrderCreate: 0,
    platformLedgerCreate: 0,
    errandOrderUpdate: 0,
  };

  const wallet = {
    findUnique: jest.fn(async () => ({ userId: 'user1', balance: store.balance })),
    updateMany: jest.fn(async (q: any) => {
      calls.walletUpdateMany++;
      const amt = q.data.balance.decrement;
      if (Number(store.balance) >= amt) {
        store.balance = Number(store.balance) - amt;
        return { count: 1 };
      }
      return { count: 0 };
    }),
  };
  const walletTransaction = {
    create: jest.fn(async () => {
      calls.walletTransactionCreate++;
      return { id: 'wt' };
    }),
  };
  const paymentOrder = {
    create: jest.fn(async () => {
      calls.paymentOrderCreate++;
      return { id: 'po' };
    }),
  };
  const platformLedger = {
    create: jest.fn(async () => {
      calls.platformLedgerCreate++;
      return { id: 'pl' };
    }),
  };
  const errandOrder = {
    findUnique: jest.fn(async () => ({
      id: 'order1',
      userId: 'user1',
      status: 'pending_pay',
      payAmount: 80,
      orderNo: 'ENO1',
      regionId: undefined,
    })),
    update: jest.fn(async (q: any) => {
      calls.errandOrderUpdate++;
      return { id: 'order1', ...q.data };
    }),
  };

  const prisma: any = {
    errandOrder,
    wallet,
    walletTransaction,
    paymentOrder,
    platformLedger,
    // $transaction 直接执行回调并透传 tx 对象（与真实 Prisma 行为一致）
    $transaction: jest.fn(async (fn: any) =>
      fn({ wallet, walletTransaction, paymentOrder, errandOrder, platformLedger }),
    ),
  };

  const redis: any = {
    getLock: jest.fn(async () => true),
    releaseLock: jest.fn(async () => undefined),
  };
  const notifyService: any = {};
  const membership: any = {};
  const userAccess: any = {};
  const paymentService: any = { wxUnifiedOrder: jest.fn(async () => ({ prepayId: 'p1' })) };

  const walletService: any = {
    deductBalanceAtomic: jest.fn(async (userId: string, amount: number, meta: any, txArg: any) => {
      const amt = Number(amount);
      const res = await txArg.wallet.updateMany({
        where: { userId, balance: { gte: amt } },
        data: { balance: { decrement: amt } },
      });
      if (res.count !== 1) {
        throw new BadRequestException('钱包余额不足');
      }
      const w = await txArg.wallet.findUnique({ where: { userId } });
      const newBalance = Number(w?.balance ?? 0);
      await txArg.walletTransaction.create({
        data: {
          userId,
          type: 'PAY',
          amount: amt,
          balance: newBalance,
          channel: 'BALANCE',
          description: meta?.description,
          status: 'SUCCESS',
        },
      });
      return { balance: newBalance };
    }),
  };

  const service = new ErrandService(
    prisma,
    redis,
    notifyService,
    membership,
    userAccess,
    paymentService,
    walletService,
  );

  // 隔离与扣款无直接关系的私有校验/通知，专注 P1-184 资金安全
  (service as any).assertErrandOrderPayableNow = jest.fn();
  (service as any).notifyAvailableRiders = jest.fn();

  return { service, calls, store };
}

describe('AUD-P1-184 跑腿余额支付原子扣款回归', () => {
  it('余额充足：扣减余额并创建流水/支付单/平台流水/置 pending_accept，流水余额为扣后真实余额', async () => {
    const { service, calls, store } = makeMocks(100);
    const res: any = await service.payOrder('user1', { orderId: 'order1', payChannel: 'balance' });

    expect(res.success).toBe(true);
    expect(res.data.status).toBe('pending_accept');
    expect(res.data.payChannel).toBe('balance');
    expect(calls.walletUpdateMany).toBe(1);
    expect(calls.walletTransactionCreate).toBe(1);
    expect(calls.paymentOrderCreate).toBe(1);
    expect(calls.platformLedgerCreate).toBe(1);
    expect(calls.errandOrderUpdate).toBe(1);
    expect(store.balance).toBe(20); // 100 - 80
  });

  it('余额不足：拒绝支付且不写支付单/平台流水/订单终态/钱包流水', async () => {
    const { service, calls } = makeMocks(50);
    await expect(
      service.payOrder('user1', { orderId: 'order1', payChannel: 'balance' }),
    ).rejects.toThrow(/余额不足/);

    expect(calls.paymentOrderCreate).toBe(0);
    expect(calls.platformLedgerCreate).toBe(0);
    expect(calls.errandOrderUpdate).toBe(0);
    expect(calls.walletTransactionCreate).toBe(0);
  });

  it('并发双扣（同用户余额100，两笔80）：至多一笔成功，余额不为负，失败无支付单/流水', async () => {
    const { service, calls, store } = makeMocks(100);

    const results = await Promise.all([
      service
        .payOrder('user1', { orderId: 'order1', payChannel: 'balance' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
      service
        .payOrder('user1', { orderId: 'order2', payChannel: 'balance' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
    ]);

    const okCount = results.filter((r) => r === 'ok').length;
    const failCount = results.filter((r: any) => typeof r === 'string' && r.includes('余额不足')).length;

    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
    expect(store.balance).toBe(20); // 100 - 80，绝不为负
    expect(calls.paymentOrderCreate).toBe(1);
    expect(calls.platformLedgerCreate).toBe(1);
    expect(calls.walletTransactionCreate).toBe(1);
    expect(calls.errandOrderUpdate).toBe(1);
  });
});
