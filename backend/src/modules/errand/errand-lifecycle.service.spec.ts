import { ErrandLifecycleService } from './errand-lifecycle.service';

describe('ErrandLifecycleService', () => {
  const tx: any = {
    errandOrder: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    deliveryOrderNode: { create: jest.fn().mockResolvedValue({ id: 'node-1' }) },
  };
  const prisma: any = {
    errandOrder: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
    orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
    deliveryRiskEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
    },
    regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };

  let service: ErrandLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.errandOrder.count.mockResolvedValue(0);
    prisma.order.count.mockResolvedValue(0);
    prisma.orderAppeal.findFirst.mockResolvedValue(null);
    prisma.deliveryRiskEvent.findFirst.mockResolvedValue(null);
    tx.errandOrder.updateMany.mockResolvedValue({ count: 1 });
    service = new ErrandLifecycleService(prisma);
  });

  it('never lets a rider complete an errand', async () => {
    await expect(
      service.riderTransition('order-1', 'rider-1', { status: 'completed' }),
    ).rejects.toThrow('骑手只能标记送达');
    expect(prisma.errandOrder.findUnique).not.toHaveBeenCalled();
  });

  it('marks an in-progress order arrived and starts the receipt clock', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'in_progress',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
      remark: '{}',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'arrived',
    });

    const result = await service.markArrived('order-1', 'rider-1', {
      proof_images: ['https://example.com/proof.jpg'],
    });

    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'in_progress', riderId: 'rider-1' }),
      data: expect.objectContaining({
        status: 'arrived',
        deliverTime: expect.any(Date),
        receiptConfirmDeadline: expect.any(Date),
      }),
    }));
    expect(result.status).toBe('arrived');
  });

  it('confirms only the owner arrived order without a hold', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      riderId: 'rider-1',
      status: 'arrived',
      refundStatus: 'none',
      deliveryDisplayMode: 'status_nodes',
    });
    tx.errandOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      status: 'completed',
      receiptConfirmedBy: 'user',
    });

    const result = await service.confirmReceipt('order-1', 'user-1', 'user');

    expect(result.status).toBe('completed');
    expect(result.receiptConfirmedBy).toBe('user');
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'order-1', userId: 'user-1', status: 'arrived' }),
      data: expect.objectContaining({
        status: 'completed',
        receiptConfirmedAt: expect.any(Date),
        receiptConfirmedBy: 'user',
        settlementEligibleAt: expect.any(Date),
      }),
    }));
  });

  it('rejects the wrong owner and open after-sale holds', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      riderId: 'rider-1',
      status: 'arrived',
      refundStatus: 'none',
    });

    await expect(service.confirmReceipt('order-1', 'user-2', 'user')).rejects.toThrow('无权确认该订单');

    prisma.orderAppeal.findFirst.mockResolvedValueOnce({ id: 'appeal-1', status: 'pending' });
    await expect(service.confirmReceipt('order-1', 'user-1', 'user')).rejects.toThrow('订单售后处理中');
  });

  it('requires delivery proof when the risk snapshot requires it', async () => {
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      riderId: 'rider-1',
      status: 'in_progress',
      refundStatus: 'none',
      remark: JSON.stringify({
        risk_assessment: { required_evidence: ['delivery_photo'] },
      }),
    });

    await expect(service.markArrived('order-1', 'rider-1', {})).rejects.toThrow('请上传送达凭证');
    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId: 'order-1', orderType: 'errand', riderId: 'rider-1',
      eventType: 'delivery_evidence_rejected', eventLevel: 'error',
    }) });
  });
});
