import { RefundReconciliationService } from './refund-reconciliation.service';

describe('refund reconciliation scheduler', () => {
  it('prevents overlapping ticks and obtains a renewing cross-process lock', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const payment = { reconcileProcessingRefunds: jest.fn(async () => { await pending; return { checked: 0 }; }) };
    const redis = { withRenewingLock: jest.fn(async (_key: string, _ttl: number, task: () => Promise<any>) => task()) };
    const service = new RefundReconciliationService(payment as any, redis as any);
    const first = service.tick();
    await service.tick();
    expect(payment.reconcileProcessingRefunds).toHaveBeenCalledTimes(1);
    expect(redis.withRenewingLock).toHaveBeenCalledWith('scheduler:refund-reconciliation', 60, expect.any(Function));
    finish(); await first;
    await service.tick();
    expect(payment.reconcileProcessingRefunds).toHaveBeenCalledTimes(2);
  });

  it('retries on the next tick after a database or Redis error', async () => {
    const payment = { reconcileProcessingRefunds: jest.fn().mockResolvedValue({ checked: 0 }) };
    const redis = { withRenewingLock: jest.fn().mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(async (_key: string, _ttl: number, task: () => Promise<any>) => task()) };
    const service = new RefundReconciliationService(payment as any, redis as any);
    await expect(service.tick()).resolves.toBeUndefined();
    await service.tick();
    expect(payment.reconcileProcessingRefunds).toHaveBeenCalledTimes(1);
  });
});
