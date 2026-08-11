import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MallService } from './mall.service';

// AUD-P1-185 回归（商城“待支付订单取消”资源回滚统一方法）：
// cancelPendingPayOrder 是用户侧取消与后台取消共用的唯一事务性方法，
// 必须在一个事务内恢复：商品库存/销量、已核销优惠券、会员权益使用、补贴台账，
// 并写入订单 cancelled 状态、cancelTime、cancelReason。
// 该方法只接受 pending_pay 订单；paid 等资金终态订单必须被拒绝且绝不触发任何回滚。

function buildTx(order: any, usedCoupon: any | null) {
  const tx: any = {
    mallOrder: {
      findUnique: jest.fn(async () => order),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async (q: any) => ({ id: order.id, ...q.data })),
    },
    mallProduct: {
      update: jest.fn(async (q: any) => ({ id: q.where.id, ...q.data })),
    },
    couponReceive: {
      findFirst: jest.fn(async () => usedCoupon),
      update: jest.fn(async (q: any) => ({ id: usedCoupon?.id, ...q.data })),
    },
    coupon: {
      update: jest.fn(async (q: any) => ({ id: q.where.id, ...q.data })),
    },
    subsidyLedger: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return tx;
}

function makeService(order: any, usedCoupon: any | null) {
  const tx = buildTx(order, usedCoupon);
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const membershipService: any = {
    restoreBenefitUsagesForTarget: jest.fn(async () => undefined),
  };
  // 其余依赖 cancelPendingPayOrder 不触碰，给 any 空 mock 即可
  const redis: any = {};
  const userAccess: any = {};
  const paymentService: any = {};
  const walletService: any = {};
  const service = new MallService(prisma, redis, membershipService, userAccess, paymentService, walletService);
  return { service, prisma, tx, membershipService };
}

const pendingOrder = (over: any = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending_pay',
  orderNo: 'NO1',
  items: [{ productId: 'p1', quantity: 2 }],
  ...over,
});

describe('AUD-P1-185 商城待支付订单取消：资源回滚统一方法', () => {
  it('支付超时系统任务复用同一回滚方法并写入明确原因', async () => {
    const { service, tx } = makeService(pendingOrder(), null);

    await expect(service.expirePendingPayment('o1')).resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
    expect(tx.mallOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'o1', status: 'pending_pay' },
      data: expect.objectContaining({ cancelReason: '支付超时自动取消' }),
    }));
  });
  // ===== 1. 带优惠券的 pending_pay 取消，四类资源全部恢复 =====
  it('pending_pay + 优惠券：恢复库存/销量、优惠券、会员权益、补贴台账', async () => {
    const usedCoupon = { id: 'cr1', couponId: 'c1' };
    const { service, tx, membershipService } = makeService(pendingOrder(), usedCoupon);

    const res: any = await service.cancelPendingPayOrder('o1', { type: 'user', userId: 'u1' });

    // 订单置为 cancelled，并写入时间/原因
    expect(tx.mallOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({
          status: 'cancelled',
          cancelReason: '用户取消',
        }),
      }),
    );
    expect(res.status).toBe('cancelled');

    // 恢复库存与销量（数量 2）
    expect(tx.mallProduct.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 2 }, saleCount: { decrement: 2 } },
    });

    // 恢复优惠券核销
    expect(tx.couponReceive.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
    expect(tx.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { usedCount: { decrement: 1 } },
    });

    // 恢复会员权益使用
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('mall_order', 'o1', tx);

    // 补贴台账：优惠券与会员价两笔均置为 cancelled
    const ledgerCalls = tx.subsidyLedger.updateMany.mock.calls.map((c: any) => c[0].where);
    expect(ledgerCalls).toContainEqual(
      expect.objectContaining({ sourceType: 'coupon', orderType: 'mall_order', orderId: 'o1' }),
    );
    expect(ledgerCalls).toContainEqual(
      expect.objectContaining({ sourceType: 'membership', orderType: 'mall_order', orderId: 'o1' }),
    );
    for (const c of tx.subsidyLedger.updateMany.mock.calls) {
      expect(c[0].data).toEqual({ status: 'cancelled' });
    }
  });

  // ===== 2. 后台取消写入 operatorId 提供的原因 =====
  it('后台取消：使用传入的 operatorId 与原因', async () => {
    const { service, tx } = makeService(pendingOrder(), null);
    const res: any = await service.cancelPendingPayOrder('o1', {
      type: 'admin',
      operatorId: 'op9',
      reason: '误下单',
    });
    expect(res.cancelReason).toBe('误下单');
    expect(tx.mallOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({ status: 'cancelled', cancelReason: '误下单' }),
      }),
    );
  });

  // ===== 3. 无优惠券时不回滚优惠券/优惠补贴台账，但会员补贴台账仍取消 =====
  it('无优惠券：不触碰 coupon/couponReceive，仅取消会员价补贴台账', async () => {
    const { service, tx } = makeService(pendingOrder(), null);
    await service.cancelPendingPayOrder('o1', { type: 'user', userId: 'u1' });
    expect(tx.couponReceive.update).not.toHaveBeenCalled();
    expect(tx.coupon.update).not.toHaveBeenCalled();
    const ledgerCalls = tx.subsidyLedger.updateMany.mock.calls.map((c: any) => c[0].where);
    expect(ledgerCalls).not.toContainEqual(
      expect.objectContaining({ sourceType: 'coupon', orderType: 'mall_order', orderId: 'o1' }),
    );
    expect(ledgerCalls).toContainEqual(
      expect.objectContaining({ sourceType: 'membership', orderType: 'mall_order', orderId: 'o1' }),
    );
  });

  // ===== 4. 用户取消校验归属 =====
  it('用户取消：userId 与订单归属不符时拒绝', async () => {
    const { service } = makeService(pendingOrder(), null);
    await expect(
      service.cancelPendingPayOrder('o1', { type: 'user', userId: 'other' }),
    ).rejects.toThrow(/无权操作该订单/);
  });

  // ===== 5. 非 pending_pay 订单（如 paid）拒绝且绝不触发任何回滚 =====
  it('paid 订单拒绝取消，且不恢复任何资源（防止伪造取消/回滚已支付资源）', async () => {
    const { service, tx, membershipService } = makeService(
      pendingOrder({ status: 'paid' }),
      { id: 'cr1', couponId: 'c1' },
    );
    await expect(
      service.cancelPendingPayOrder('o1', { type: 'admin', operatorId: 'op9', reason: 'x' }),
    ).rejects.toThrow(/仅待支付订单可取消/);
    expect(tx.mallProduct.update).not.toHaveBeenCalled();
    expect(tx.couponReceive.update).not.toHaveBeenCalled();
    expect(tx.coupon.update).not.toHaveBeenCalled();
    expect(membershipService.restoreBenefitUsagesForTarget).not.toHaveBeenCalled();
    expect(tx.subsidyLedger.updateMany).not.toHaveBeenCalled();
    expect(tx.mallOrder.update).not.toHaveBeenCalled();
  });

  // ===== 6. 订单不存在抛 NotFound =====
  it('订单不存在时抛 NotFoundException', async () => {
    const { service } = makeService(null, null);
    await expect(
      service.cancelPendingPayOrder('x', { type: 'user', userId: 'u1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('两个后台并发取消同一订单时，仅一个请求可抢占回滚权', async () => {
    const order = pendingOrder();
    let releaseReads: (() => void) | undefined;
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    let readCount = 0;
    let status = 'pending_pay';
    const tx: any = {
      mallOrder: {
        findUnique: jest.fn(async () => {
          readCount += 1;
          if (readCount === 2) releaseReads?.();
          await bothReadsStarted;
          return { ...order, status };
        }),
        updateMany: jest.fn(async ({ where }: any) => {
          if (where.id === order.id && where.status === 'pending_pay' && status === 'pending_pay') {
            status = 'cancelled';
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: jest.fn(async (q: any) => {
          status = q.data.status;
          return { id: order.id, ...q.data };
        }),
      },
      mallProduct: { update: jest.fn(async () => ({ id: 'p1' })) },
      couponReceive: { findFirst: jest.fn(async () => null), update: jest.fn() },
      coupon: { update: jest.fn() },
      subsidyLedger: { updateMany: jest.fn(async () => ({ count: 0 })) },
    };
    const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn(async () => undefined) };
    const redis: any = {};
    const userAccess: any = {};
    const paymentService: any = {};
    const walletService: any = {};
    const service = new MallService(prisma, redis, membershipService, userAccess, paymentService, walletService);

    const results = await Promise.allSettled([
      service.cancelPendingPayOrder(order.id, { type: 'admin', operatorId: 'op1' }),
      service.cancelPendingPayOrder(order.id, { type: 'admin', operatorId: 'op2' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(tx.mallProduct.update).toHaveBeenCalledTimes(1);
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledTimes(1);
    expect(tx.mallOrder.updateMany).toHaveBeenCalledTimes(2);
  });
});
