import { ErrandService } from './errand.service';

describe('ErrandService new-order notification channels', () => {
  it('dispatches in-app, websocket, and offline push to online riders', async () => {
    const prisma: any = {
      regionRider: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'rider-1' }]),
      },
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      order: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const notifyService = {
      createAndDispatch: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const service = new ErrandService(
      prisma,
      {} as any,
      notifyService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).notifyAvailableRiders({
      id: 'order-1',
      orderNo: 'ERR001',
      regionId: 'region-1',
      type: 'pickup',
      payAmount: 8,
      status: 'pending_accept',
    });

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rider-1',
        scene: 'new_errand_order',
        channelMask: { inApp: true, websocket: true, push: true },
      }),
    );
  });
});
