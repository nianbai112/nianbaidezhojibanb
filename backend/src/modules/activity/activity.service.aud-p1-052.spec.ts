import { ActivityService } from './activity.service';

describe('AUD-P1-052 ActivityService payment expiry', () => {
  it('claims the unpaid pending activity order before restoring its member benefit', async () => {
    const order: any = { id: 'activity-1', activityId: 'event-1', orderStatus: 'pending', payStatus: 'unpaid' };
    const tx: any = {
      activityOrder: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue(order) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new ActivityService({ ...tx, $transaction: (fn: any) => fn(tx) } as any, {} as any, membershipService, {} as any);

    await expect(service.expirePendingPayment('activity-1')).resolves.toBe(true);
    expect(tx.activityOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'activity-1' },
      data: expect.objectContaining({ orderStatus: 'cancelled', refundReason: '支付超时已确认关闭' }),
    }));
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('activity_order', 'activity-1', tx);
  });
});
