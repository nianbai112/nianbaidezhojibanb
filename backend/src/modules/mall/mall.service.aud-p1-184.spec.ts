import { BadRequestException } from '@nestjs/common';
import { MallService } from './mall.service';

// AUD-P1-184 回归（商城余额支付）：
// 余额扣减必须走 WalletService.deductBalanceAtomic 的“balance >= amount”原子条件更新，
// 余额不足或并发透支时由数据库约束拒绝，绝不创建支付单/流水/订单终态；
// 钱包流水余额取扣减后的真实余额。
// 这里用共享可变余额 + updateMany 的 gte 条件模拟数据库行级原子约束。
function makeMocks(initialBalance: number) {
  const store = { balance: initialBalance };
  const calls = {
    walletUpdateMany: 0,
    walletTransactionCreate: 0,
    paymentOrderCreate: 0,
    mallOrderUpdate: 0,
  };

  // updateMany 模拟数据库原子条件更新：只有 balance >= amount 才扣减并命中 1 行
  const wallet = {
    findUnique: jest.fn(async () => ({ userId: 'user1', balance: store.balance })),
    update: jest.fn(async () => ({ userId: 'user1' })),
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
  const mallOrder = {
    findUnique: jest.fn(async () => ({
      id: 'order1',
      userId: 'user1',
      status: 'pending_pay',
      payAmount: 80,
      totalAmount: 80,
      orderNo: 'NO1',
    })),
    update: jest.fn(async (q: any) => {
      calls.mallOrderUpdate++;
      return { id: 'order1', ...q.data };
    }),
  };

  const prisma: any = {
    mallOrder,
    wallet,
    walletTransaction,
    paymentOrder,
    user: { findUnique: jest.fn(async () => ({ openid: 'openid1' })) },
    // $transaction 直接执行回调并透传 tx 对象（与真实 Prisma 行为一致）
    $transaction: jest.fn(async (fn: any) => fn({ wallet, walletTransaction, paymentOrder, mallOrder })),
  };

  const redis: any = {
    getLock: jest.fn(async () => true),
    releaseLock: jest.fn(async () => undefined),
  };
  const membership: any = {};
  const userAccess: any = {};
  const paymentService: any = { wxUnifiedOrder: jest.fn(async () => ({ prepayId: 'p1' })) };

  // 模拟 WalletService.deductBalanceAtomic：把扣减委托给 tx.wallet.updateMany（即真正的原子条件更新）
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

  const service = new MallService(prisma, redis, membership, userAccess, paymentService, walletService);
  return { service, calls, store };
}

describe('AUD-P1-184 商城余额支付原子扣款回归', () => {
  it('余额充足：扣减余额并创建流水/支付单/置 paid，流水余额为扣后真实余额', async () => {
    const { service, calls, store } = makeMocks(100);
    const res: any = await service.payOrder('order1', 'user1', { payment_method: 'balance' });

    expect(res.status).toBe('paid');
    expect(res.payChannel).toBe('balance');
    expect(calls.walletUpdateMany).toBe(1);
    expect(calls.walletTransactionCreate).toBe(1);
    expect(calls.paymentOrderCreate).toBe(1);
    expect(calls.mallOrderUpdate).toBe(1);
    expect(store.balance).toBe(20); // 100 - 80
  });

  it('余额不足：拒绝支付且不写订单/流水/支付单（updateMany 命中 0 行即抛错）', async () => {
    const { service, calls } = makeMocks(50);
    await expect(
      service.payOrder('order1', 'user1', { payment_method: 'balance' }),
    ).rejects.toThrow(/余额不足/);

    expect(calls.walletTransactionCreate).toBe(0);
    expect(calls.paymentOrderCreate).toBe(0);
    expect(calls.mallOrderUpdate).toBe(0);
  });

  it('并发双扣（同用户余额100，两笔80）：至多一笔成功，余额不为负，失败无支付单/流水', async () => {
    const { service, calls, store } = makeMocks(100);

    const results = await Promise.all([
      service
        .payOrder('order1', 'user1', { payment_method: 'balance' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
      service
        .payOrder('order2', 'user1', { payment_method: 'balance' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
    ]);

    const okCount = results.filter((r) => r === 'ok').length;
    const failCount = results.filter((r: any) => typeof r === 'string' && r.includes('余额不足')).length;

    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
    expect(store.balance).toBe(20); // 100 - 80，绝不为负
    expect(calls.paymentOrderCreate).toBe(1); // 仅成功那笔创建支付单
    expect(calls.walletTransactionCreate).toBe(1); // 仅成功那笔写流水
    expect(calls.mallOrderUpdate).toBe(1); // 仅成功那笔推进订单
  });
});
