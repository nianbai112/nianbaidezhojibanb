import { PaymentExpiryService } from './payment-expiry.service';

describe('AUD-P1-052 PaymentExpiryService', () => {
  const makeService = () => {
    const paymentService: any = { reconcileExpiredPayments: jest.fn() };
    const mallService: any = { expirePendingPayment: jest.fn() };
    const shopService: any = { expirePendingPayment: jest.fn() };
    const errandService: any = { expirePendingPayment: jest.fn() };
    const activityService: any = { expirePendingPayment: jest.fn() };
    const prisma: any = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      paymentOrder: { findMany: jest.fn().mockResolvedValue([]) },
      paymentReservationRelease: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PaymentExpiryService(
      prisma,
      paymentService,
      mallService,
      shopService,
      errandService,
      activityService,
    );
    return { service, prisma, paymentService, mallService, shopService, errandService, activityService };
  };

  it('only releases reservations after PaymentService has confirmed a terminal payment state', async () => {
    const { service, prisma, paymentService, mallService, shopService, errandService, activityService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([
      { id: 'payment-1', bizType: 'mall_order', bizId: 'mall-1', status: 'closed' },
      { id: 'payment-2', bizType: 'order', bizId: 'shop-1', status: 'failed' },
      { id: 'payment-3', bizType: 'errand_order', bizId: 'errand-1', status: 'closed' },
      { id: 'payment-4', bizType: 'activity_order', bizId: 'activity-1', status: 'closed' },
    ]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([
      { id: 'release-1', payment: { bizType: 'mall_order', bizId: 'mall-1' } },
      { id: 'release-2', payment: { bizType: 'order', bizId: 'shop-1' } },
      { id: 'release-3', payment: { bizType: 'errand_order', bizId: 'errand-1' } },
      { id: 'release-4', payment: { bizType: 'activity_order', bizId: 'activity-1' } },
    ]);
    mallService.expirePendingPayment.mockResolvedValue(true);
    shopService.expirePendingPayment.mockResolvedValue(true);
    errandService.expirePendingPayment.mockResolvedValue(true);
    activityService.expirePendingPayment.mockResolvedValue(true);

    await expect(service.reconcileAndRelease()).resolves.toEqual({ checked: 4, released: 4, failed: 0 });
    expect(prisma.paymentReservationRelease.upsert).toHaveBeenCalledTimes(4);
    expect(mallService.expirePendingPayment).toHaveBeenCalledWith('mall-1');
    expect(shopService.expirePendingPayment).toHaveBeenCalledWith('shop-1');
    expect(errandService.expirePendingPayment).toHaveBeenCalledWith('errand-1');
    expect(activityService.expirePendingPayment).toHaveBeenCalledWith('activity-1');
    expect(prisma.paymentReservationRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'release-1' }, data: expect.objectContaining({ status: 'completed' }),
    }));
  });

  it('does not count an already-cancelled order as a new release', async () => {
    const { service, prisma, paymentService, mallService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([{ id: 'payment-1', bizType: 'mall_order', bizId: 'mall-1', status: 'closed' }]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([{ id: 'release-1', payment: { bizType: 'mall_order', bizId: 'mall-1' } }]);
    mallService.expirePendingPayment.mockResolvedValue(false);

    await expect(service.reconcileAndRelease()).resolves.toEqual({ checked: 1, released: 0, failed: 0 });
  });

  it('does not release any business reservation for an unsupported business type', async () => {
    const { service, prisma, paymentService, mallService, shopService, errandService, activityService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([{ id: 'payment-1', bizType: 'membership_order', bizId: 'membership-1', status: 'closed' }]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([{ id: 'release-1', payment: { bizType: 'membership_order', bizId: 'membership-1' } }]);

    await expect(service.reconcileAndRelease()).resolves.toEqual({ checked: 1, released: 0, failed: 0 });
    expect(mallService.expirePendingPayment).not.toHaveBeenCalled();
    expect(shopService.expirePendingPayment).not.toHaveBeenCalled();
    expect(errandService.expirePendingPayment).not.toHaveBeenCalled();
    expect(activityService.expirePendingPayment).not.toHaveBeenCalled();
  });

  it('records a failed release for retry instead of treating it as completed', async () => {
    const { service, prisma, paymentService, mallService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([{ id: 'payment-1', bizType: 'mall_order', bizId: 'mall-1', status: 'closed' }]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([{ id: 'release-1', payment: { bizType: 'mall_order', bizId: 'mall-1' } }]);
    mallService.expirePendingPayment.mockRejectedValue(new Error('temporary db failure'));

    await expect(service.reconcileAndRelease()).resolves.toEqual({ checked: 1, released: 0, failed: 1 });
    expect(prisma.paymentReservationRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'release-1' }, data: expect.objectContaining({ status: 'failed', lastError: 'temporary db failure' }),
    }));
  });

  it('retries a previously failed release even when no new payment reaches a terminal state', async () => {
    const { service, prisma, paymentService, mallService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([{ id: 'release-1', payment: { bizType: 'mall_order', bizId: 'mall-1' } }]);
    mallService.expirePendingPayment.mockResolvedValue(true);

    await expect(service.reconcileAndRelease()).resolves.toEqual({ checked: 1, released: 1, failed: 0 });
    expect(mallService.expirePendingPayment).toHaveBeenCalledWith('mall-1');
  });

  it('expires a stale shop order that never created a payment, but keeps one with an active payment', async () => {
    const { service, prisma, paymentService, shopService } = makeService();
    paymentService.reconcileExpiredPayments.mockResolvedValue([]);
    prisma.paymentReservationRelease.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([{ id: 'shop-orphan' }, { id: 'shop-paying' }]);
    prisma.paymentOrder.findMany.mockResolvedValue([{ bizId: 'shop-paying' }]);
    shopService.expirePendingPayment.mockResolvedValue(true);

    await service.reconcileAndRelease();

    expect(shopService.expirePendingPayment).toHaveBeenCalledWith('shop-orphan');
    expect(shopService.expirePendingPayment).not.toHaveBeenCalledWith('shop-paying');
  });
});
