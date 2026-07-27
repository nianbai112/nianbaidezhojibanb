import { ActivityService } from './activity.service';

describe('AUD-P1-052 ActivityService payment expiry', () => {
  it('claims the unpaid pending activity order before restoring its member benefit', async () => {
    const order: any = { id: 'activity-1', orderStatus: 'pending', payStatus: 'unpaid' };
    const tx: any = {
      activityOrder: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new ActivityService({ $transaction: (fn: any) => fn(tx) } as any, {} as any, membershipService, {} as any);

    await expect(service.expirePendingPayment('activity-1')).resolves.toBe(true);
    expect(tx.activityOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'activity-1', orderStatus: 'pending', payStatus: { not: 'paid' } },
      data: expect.objectContaining({ orderStatus: 'cancelled', refundReason: '支付超时自动取消' }),
    }));
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('activity_order', 'activity-1', tx);
  });
});
