import { ErrandService } from './errand.service';

describe('AUD-P1-052 ErrandService payment expiry', () => {
  const makeService = (order: any, claimCount = 1) => {
    const tx: any = {
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const redis: any = { getLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn().mockResolvedValue(undefined) };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new ErrandService(prisma, redis, {} as any, membershipService, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'restoreErrandOrderCoupon').mockResolvedValue(undefined);
    return { service, tx, membershipService };
  };

  it('claims the pending payment order before restoring coupon and member reservation', async () => {
    const { service, tx, membershipService } = makeService({ id: 'errand-1', status: 'pending_pay' });

    await expect(service.expirePendingPayment('errand-1')).resolves.toBe(true);
    expect(tx.errandOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'errand-1', status: 'pending_pay' },
      data: expect.objectContaining({ status: 'cancelled', cancelReason: '支付超时自动取消' }),
    }));
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('errand_order', 'errand-1', tx);
  });

  it('does not restore twice when another request already claimed the order', async () => {
    const { service, membershipService } = makeService({ id: 'errand-1', status: 'pending_pay' }, 0);

    await expect(service.expirePendingPayment('errand-1')).resolves.toBe(false);
    expect(membershipService.restoreBenefitUsagesForTarget).not.toHaveBeenCalled();
  });
});
