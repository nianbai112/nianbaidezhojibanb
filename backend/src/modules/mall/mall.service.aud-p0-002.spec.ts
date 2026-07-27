import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { MallService } from './mall.service';

// 针对 AUD-P0-002（商城支付绕过）的最小闭环回归测试。
// 不依赖真实数据库/Redis/微信：用轻量 mock 验证“直付绕过”已被关闭。
// AUD-P1-184 后：余额扣减统一走 WalletService.deductBalanceAtomic（此处以 walletService mock 模拟原子条件扣款）。
function makeMocks(initialBalance: string) {
  let tx: any;
  let cur = initialBalance;
  const calls = {
    walletUpdate: 0,
    walletTransactionCreate: 0,
    paymentOrderCreate: 0,
    mallOrderUpdate: 0,
  };

  const wallet = {
    findUnique: jest.fn(async () => ({ userId: 'user1', balance: cur })),
    update: jest.fn(async () => {
      calls.walletUpdate++;
      return { userId: 'user1' };
    }),
    updateMany: jest.fn(async () => {
      calls.walletUpdate++;
      return { count: 1 };
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
      payAmount: 10,
      totalAmount: 10,
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
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  tx = { wallet, walletTransaction, paymentOrder, mallOrder };

  const redis: any = {
    getLock: jest.fn(async () => true),
    releaseLock: jest.fn(async () => undefined),
  };
  const membership: any = {};
  const userAccess: any = {};
  const paymentService: any = {
    wxUnifiedOrder: jest.fn(async () => ({ prepayId: 'p1' })),
  };

  // AUD-P1-184：模拟原子条件扣款——余额不足时抛错，否则扣减并返回真实新余额
  const walletService: any = {
    deductBalanceAtomic: jest.fn(async (userId: string, amount: number, meta: any, txArg: any) => {
      const amt = Number(amount);
      if (Number(cur) < amt) {
        throw new BadRequestException('钱包余额不足');
      }
      cur = String(Number(cur) - amt);
      await txArg.wallet.updateMany({
        where: { userId, balance: { gte: amt } },
        data: { balance: { decrement: amt } },
      });
      const w = await txArg.wallet.findUnique({ where: { userId } });
      const newBalance = Number(w?.balance ?? 0);
      await txArg.walletTransaction.create({
        data: { userId, type: 'PAY', amount: amt, balance: newBalance, channel: 'BALANCE', description: meta?.description, status: 'SUCCESS' },
      });
      return { balance: newBalance };
    }),
  };

  const service = new MallService(prisma, redis, membership, userAccess, paymentService, walletService);
  return { service, calls, paymentService };
}

describe('AUD-P0-002 商城支付绕过修复回归', () => {
  it('余额不足：拒绝支付且不写订单/流水/支付单', async () => {
    const { service, calls } = makeMocks('0');
    await expect(
      service.payOrder('order1', 'user1', { payment_method: 'balance' }),
    ).rejects.toThrow(/余额不足/);
    expect(calls.walletUpdate).toBe(0);
    expect(calls.walletTransactionCreate).toBe(0);
    expect(calls.paymentOrderCreate).toBe(0);
    expect(calls.mallOrderUpdate).toBe(0);
  });

  it('余额充足：扣减余额并创建流水/支付单/置 paid', async () => {
    const { service, calls } = makeMocks('100');
    const res: any = await service.payOrder('order1', 'user1', { payment_method: 'balance' });
    expect(res.status).toBe('paid');
    expect(res.payChannel).toBe('balance');
    expect(calls.walletUpdate).toBe(1);
    expect(calls.walletTransactionCreate).toBe(1);
    expect(calls.paymentOrderCreate).toBe(1);
    expect(calls.mallOrderUpdate).toBe(1);
  });

  it('非订单 owner：不能支付（归属校验）', async () => {
    const { service } = makeMocks('100');
    await expect(
      service.payOrder('order1', 'attacker', { payment_method: 'balance' }),
    ).rejects.toThrow(/无权操作/);
  });

  it('用户端提交 paid 终态被拒绝', async () => {
    const { service } = makeMocks('100');
    await expect(
      service.updateOrderStatus('order1', 'user1', { target_status: 'paid' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('用户端提交 completed/refunded 终态被拒绝', async () => {
    const { service } = makeMocks('100');
    await expect(
      service.updateOrderStatus('order1', 'user1', { target_status: 'completed' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateOrderStatus('order1', 'user1', { target_status: 'refunded' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('用户端 received/cancelled 不被“不支持”拦截（走履约/取消状态机）', async () => {
    const { service } = makeMocks('100');
    for (const ts of ['received', 'cancelled']) {
      try {
        await service.updateOrderStatus('order1', 'user1', { target_status: ts });
      } catch (e: any) {
        expect(e.message).not.toMatch(/用户端不支持/);
      }
    }
  });
});
