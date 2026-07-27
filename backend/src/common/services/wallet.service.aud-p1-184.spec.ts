import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from './prisma.service';

// AUD-P1-184：原子条件扣款核心逻辑回归（真实 WalletService + 共享状态 mock Prisma）。
// 用共享可变余额 + updateMany 的 balance>=amount 条件，模拟数据库行级原子约束；
// 并发场景下两个请求共享同一余额，只有一个能通过条件更新，杜绝透支。
function makePrisma(balanceStore: { value: number }) {
  const calls = { updateMany: 0, walletTransactionCreate: 0 };
  const prisma: any = {
    wallet: {
      updateMany: jest.fn(async (q: any) => {
        const amt = q.data.balance.decrement;
        calls.updateMany++;
        if (Number(balanceStore.value) >= amt) {
          balanceStore.value = Number(balanceStore.value) - amt;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      findUnique: jest.fn(async () => ({ userId: 'u1', balance: balanceStore.value })),
    },
    walletTransaction: {
      create: jest.fn(async () => {
        calls.walletTransactionCreate++;
        return { id: 'wt' };
      }),
    },
  };
  return { prisma, calls };
}

describe('AUD-P1-184 WalletService.deductBalanceAtomic 原子条件扣款', () => {
  it('余额充足：扣减成功并写入扣后真实余额流水', async () => {
    const store = { value: 100 };
    const { prisma, calls } = makePrisma(store);
    const service = new WalletService(prisma as unknown as PrismaService);

    const res = await service.deductBalanceAtomic('u1', 80, {
      type: 'PAY',
      channel: 'BALANCE',
      description: '商城订单支付: NO1',
    });

    expect(res.balance).toBe(20);
    expect(store.value).toBe(20);
    expect(calls.updateMany).toBe(1);
    expect(calls.walletTransactionCreate).toBe(1);
  });

  it('余额不足：updateMany 返回 0 行，抛余额不足且不写流水', async () => {
    const store = { value: 50 };
    const { prisma, calls } = makePrisma(store);
    const service = new WalletService(prisma as unknown as PrismaService);

    await expect(service.deductBalanceAtomic('u1', 80, {})).rejects.toThrow(/余额不足/);
    expect(store.value).toBe(50);
    expect(calls.updateMany).toBe(1); // 条件更新确实执行了，只是 0 行命中
    expect(calls.walletTransactionCreate).toBe(0);
  });

  it('并发双扣（同用户余额100，两笔80）：至多一笔成功，余额不为负，失败无流水', async () => {
    const store = { value: 100 };
    const { prisma, calls } = makePrisma(store);
    const service = new WalletService(prisma as unknown as PrismaService);

    const results = await Promise.all([
      service
        .deductBalanceAtomic('u1', 80, { description: 'A' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
      service
        .deductBalanceAtomic('u1', 80, { description: 'B' })
        .then(() => 'ok')
        .catch((e: any) => e.message),
    ]);

    const okCount = results.filter((r) => r === 'ok').length;
    const failCount = results.filter((r) => typeof r === 'string' && r.includes('余额不足')).length;

    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
    expect(store.value).toBe(20); // 100 - 80，绝不是负数
    expect(calls.walletTransactionCreate).toBe(1); // 只有成功那笔写流水
    expect(calls.updateMany).toBe(2); // 两次条件更新都执行，但仅一次命中
  });
});
