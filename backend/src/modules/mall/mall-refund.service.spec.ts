import { BadRequestException } from '@nestjs/common';
import { MallService } from './mall.service';
import { MallAdminService } from './mall-admin.service';

function makeMallService(order: any, item: any, activeRefund: any = null) {
  const prisma: any = {
    mallOrder: { findUnique: jest.fn().mockResolvedValue(order) },
    mallOrderItem: { findFirst: jest.fn().mockResolvedValue(item) },
    mallRefund: {
      findFirst: jest.fn().mockResolvedValue(activeRefund),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'refund-1', ...data })),
    },
  };
  const service = new MallService(
    prisma,
    { getLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(undefined) } as any,
    { hasBenefit: jest.fn().mockResolvedValue(false) } as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

function makeMallAdmin(refund: any, paymentStatus = 'processing') {
  const prisma: any = {
    mallRefund: {
      findUnique: jest.fn().mockResolvedValue(refund),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const paymentService = { refund: jest.fn().mockResolvedValue({ status: paymentStatus }) };
  return {
    service: new MallAdminService(prisma, paymentService as any, {} as any),
    prisma,
    paymentService,
  };
}

describe('商城售后退款状态机', () => {
  const paidOrder = { id: 'order-1', userId: 'user-1', status: 'paid' };
  const item = { id: 'item-1', orderId: 'order-1', price: 9.9, quantity: 2 };

  it('拒绝未付款订单的退款申请', async () => {
    const { service, prisma } = makeMallService({ ...paidOrder, status: 'pending_pay' }, item);

    await expect(service.applyRefund('user-1', {
      order_id: 'order-1', order_item_id: 'item-1', reason: '不需要了', refund_amount: 9.9,
    })).rejects.toThrow('当前订单状态不支持申请退款');
    expect(prisma.mallRefund.create).not.toHaveBeenCalled();
  });

  it('按订单商品和数量校验可退金额，并写入标准化金额', async () => {
    const { service, prisma } = makeMallService(paidOrder, item);

    await expect(service.applyRefund('user-1', {
      order_id: 'order-1', order_item_id: 'item-1', reason: '质量问题', refund_quantity: 1, refund_amount: 9.91,
    })).rejects.toThrow('退款金额超过该商品可退金额');

    await service.applyRefund('user-1', {
      order_id: 'order-1', order_item_id: 'item-1', reason: '质量问题', refund_quantity: 1, refund_amount: '9.90',
    });
    expect(prisma.mallRefund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 9.9, quantity: 1, status: 'applying' }),
    });
  });

  it('渠道仅返回 processing 时，售后停在处理中而不是已退款', async () => {
    const refund = { id: 'refund-1', orderId: 'order-1', amount: 9.9, reason: '质量问题', status: 'merchant_approved', order: { totalAmount: 9.9 } };
    const { service, prisma, paymentService } = makeMallAdmin(refund, 'processing');

    await expect(service.finishRefund('refund-1', {}, 'admin-1')).resolves.toEqual({
      success: true,
      data: { id: 'refund-1', orderId: 'order-1', status: 'processing' },
    });
    expect(paymentService.refund).toHaveBeenCalledWith(expect.objectContaining({ bizType: 'mall_order', bizId: 'order-1' }));
    expect(prisma.mallRefund.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'refund-1', status: { in: ['approved', 'merchant_approved'] } },
      data: { status: 'processing' },
    }));
  });

  it('拒绝从申请中之外的状态发起渠道退款', async () => {
    const { service, paymentService } = makeMallAdmin({ id: 'refund-1', orderId: 'order-1', status: 'applying', order: {} });

    await expect(service.finishRefund('refund-1', {}, 'admin-1')).rejects.toThrow('不支持发起退款');
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('审核操作只能从 applying 推进到商家终态', async () => {
    const { service, prisma } = makeMallAdmin({ id: 'refund-1', orderId: 'order-1', status: 'applying' });

    await service.reviewRefund('refund-1', { status: 'merchant_approved' }, 'admin-1');
    expect(prisma.mallRefund.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'refund-1', status: 'applying' },
      data: expect.objectContaining({ status: 'merchant_approved' }),
    }));
  });
});
