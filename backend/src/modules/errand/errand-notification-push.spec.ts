import { ErrandService } from './errand.service';

describe('ErrandService new-order notification channels', () => {
  it('routes errand payment notifications through the shared rider notification pipeline', async () => {
    const notify: any = { notifyAvailableErrandRiders: jest.fn().mockResolvedValue({ queued: 2 }) };
    const service: any = new ErrandService({} as any, {} as any, notify, {} as any, {} as any, {} as any, {} as any);
    await expect(service.notifyAvailableRiders({ id: 'order-1' })).resolves.toEqual({ queued: 2 });
    expect(notify.notifyAvailableErrandRiders).toHaveBeenCalledWith('order-1');
  });

  it.each([false, true])('persists a transfer before notifying its recipient, including notification failure=%s', async (failNotification) => {
    const order = { id: 'order-1', userId: 'owner', riderId: 'sender', status: 'accepted', regionId: 'r1', payAmount: 8, payTime: new Date() };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      regionRider: { findFirst: jest.fn().mockResolvedValue({ userId: 'receiver', verifyStatus: 'approved', regionId: 'r1' }) },
      transferRequest: { create: jest.fn().mockResolvedValue({ id: 'transfer-1' }) },
    };
    const notify: any = { createAndDispatch: failNotification ? jest.fn().mockRejectedValue(new Error('push unavailable')) : jest.fn().mockResolvedValue({}) };
    const service = new ErrandService(prisma, {} as any, notify, {} as any, {} as any, {} as any, {} as any);
    await expect(service.requestTransfer('order-1', 'sender', { target_rider_id: 'receiver' })).resolves.toMatchObject({ id: 'transfer-1' });
    expect(notify.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'receiver', scene: 'rider_transfer_request', linkValue: '/pages/orders/orders' }));
    expect(prisma.transferRequest.create.mock.invocationCallOrder[0]).toBeLessThan(notify.createAndDispatch.mock.invocationCallOrder[0]);
  });

});
