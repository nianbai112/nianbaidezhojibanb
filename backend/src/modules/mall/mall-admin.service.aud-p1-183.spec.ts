import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MallAdminService } from './mall-admin.service';

// AUD-P1-183 回归（商城后台通用状态接口资金终态防护）：
// 仅 @RequirePermission('mall:edit') 的通用 /status 接口不得写入任何资金终态
// （pending_pay / paid / shipped / refunding / refunded），也不得绕过当前状态白名单；
// 发货必须走专用发货接口，支付/退款结果只能由支付中心回调与退款状态机写入。
// 白名单只允许无资金副作用的明确运营动作：cancelled(从pending_pay) / received(从shipped) / completed(从received)。

function makeService(order: any, mallServiceMock?: any) {
  const prisma: any = {
    mallOrder: {
      findUnique: jest.fn(async () => order),
      update: jest.fn(async (q: any) => ({ id: order.id, ...q.data })),
    },
    adminOperationLog: {
      create: jest.fn(async () => ({ id: 'log1' })),
    },
  };
  const paymentService: any = {};
  const mallService: any = mallServiceMock || {
    cancelPendingPayOrder: jest.fn(async () => ({ id: order.id, status: 'cancelled' })),
  };
  const service = new MallAdminService(prisma, paymentService, mallService);
  return { service, prisma, mallService };
}

describe('AUD-P1-183 商城后台通用状态接口：资金终态防护', () => {
  it('拒绝超大分类排序列表，避免用户控制无界循环', async () => {
    const { service, prisma } = makeService({ id: 'order1' });
    prisma.mallCategory = { update: jest.fn() };

    await expect(service.sortCategories(Array.from({ length: 501 }, (_, i) => `category-${i}`)))
      .rejects.toThrow(BadRequestException);
    expect(prisma.mallCategory.update).not.toHaveBeenCalled();
  });
  // ===== 1. 资金终态 / 发货 等禁止通过泛化 mall:edit 接口直写 =====
  const FORBIDDEN = ['pending_pay', 'paid', 'shipped', 'refunding', 'refunded'];
  for (const status of FORBIDDEN) {
    it(`禁止通过通用接口把订单状态改为 [${status}]`, async () => {
      const { service } = makeService({ id: 'order1', userId: 'u1', status: 'pending_pay', orderNo: 'NO1' });
      await expect(
        service.updateOrderStatus('order1', { status }, 'op1', '1.2.3.4'),
      ).rejects.toThrow(/不允许通过通用状态接口修改|不支持将订单状态|当前订单状态/);
    });
  }

  // ===== 2. 白名单设计本身不含任何资金终态（确保唯一写入 paid/refunded 的路径是支付/退款可信通道）=====
  it('状态白名单仅含无资金副作用的运营动作，绝不暴露 paid/refunded 等资金终态', () => {
    const keys = Object.keys(MallAdminService['ALLOWED_ORDER_STATUS_TRANSITIONS'] as Record<string, string[]>);
    expect(keys).toEqual(expect.arrayContaining(['cancelled', 'received', 'completed']));
    for (const k of keys) {
      expect(['paid', 'refunding', 'refunded', 'shipped', 'pending_pay']).not.toContain(k);
    }
  });

  // ===== 3. 允许的运营动作：当前状态匹配时成功并写操作日志 =====
  it('cancelled：从 pending_pay 取消成功，委派共享回滚并写入操作日志(AUD-P1-185)', async () => {
    const { service, mallService } = makeService({ id: 'order1', userId: 'u1', status: 'pending_pay', orderNo: 'NO1' });
    const res: any = await service.updateOrderStatus('order1', { status: 'cancelled', reason: '用户申请' }, 'op1', '1.2.3.4');
    expect(res.success).toBe(true);
    // 后台取消复用商城用户侧事务性资源回滚，而非自身裸改订单状态
    expect(mallService.cancelPendingPayOrder).toHaveBeenCalledWith(
      'order1',
      expect.objectContaining({ type: 'admin', operatorId: 'op1', reason: '用户申请' }),
    );
    // 后台取消成功（data 来自共享回滚方法返回的已取消订单）
    expect(res.data).toEqual(expect.objectContaining({ status: 'cancelled' }));
  });

  it('received：从 shipped 标记收货成功', async () => {
    const { service, prisma } = makeService({ id: 'order1', userId: 'u1', status: 'shipped', orderNo: 'NO1' });
    const res: any = await service.updateOrderStatus('order1', { status: 'received' }, 'op1', '1.2.3.4');
    expect(res.success).toBe(true);
    const callData = prisma.mallOrder.update.mock.calls[0][0].data;
    expect(callData.status).toBe('received');
  });

  it('completed：从 received 标记完成成功，写入 completeTime', async () => {
    const { service, prisma } = makeService({ id: 'order1', userId: 'u1', status: 'received', orderNo: 'NO1' });
    const res: any = await service.updateOrderStatus('order1', { status: 'completed' }, 'op1', '1.2.3.4');
    expect(res.success).toBe(true);
    const callData = prisma.mallOrder.update.mock.calls[0][0].data;
    expect(callData.status).toBe('completed');
    expect(callData.completeTime).toBeInstanceOf(Date);
  });

  // ===== 4. 当前状态不匹配白名单来源时拒绝（防状态机跳跃）=====
  it('当前状态为 shipped 时，禁止流转到 cancelled（状态机校验）', async () => {
    const { service } = makeService({ id: 'order1', userId: 'u1', status: 'shipped', orderNo: 'NO1' });
    await expect(
      service.updateOrderStatus('order1', { status: 'cancelled' }, 'op1', '1.2.3.4'),
    ).rejects.toThrow(/当前订单状态/);
  });

  // ===== 4b. 已支付订单不得通过通用接口取消（AUD-P1-183 闭环 + P1-185 资金终态保护）=====
  it('已支付(paid)订单请求 cancelled 被状态机拒绝，且绝不会调用资源回滚方法', async () => {
    const { service, mallService } = makeService({ id: 'order1', userId: 'u1', status: 'paid', orderNo: 'NO1' });
    await expect(
      service.updateOrderStatus('order1', { status: 'cancelled' }, 'op1', '1.2.3.4'),
    ).rejects.toThrow(/当前订单状态/);
    expect(mallService.cancelPendingPayOrder).not.toHaveBeenCalled();
  });

  // ===== 5. 不支持的目标状态直接拒绝 =====
  it('未知目标状态（如 foo）被拒绝', async () => {
    const { service } = makeService({ id: 'order1', userId: 'u1', status: 'pending_pay', orderNo: 'NO1' });
    await expect(
      service.updateOrderStatus('order1', { status: 'foo' }, 'op1', '1.2.3.4'),
    ).rejects.toThrow(/不支持将订单状态修改为/);
  });

  // ===== 6. 订单不存在抛 NotFound =====
  it('订单不存在时抛 NotFoundException', async () => {
    const { service } = makeService(null);
    await expect(
      service.updateOrderStatus('orderX', { status: 'cancelled' }, 'op1', '1.2.3.4'),
    ).rejects.toThrow(NotFoundException);
  });
});
