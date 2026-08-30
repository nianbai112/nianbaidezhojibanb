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
      errandConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      config: { findUnique: jest.fn().mockResolvedValue(null) },
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

  it('does not notify approved riders before an ordinary-user fallback order is released', async () => {
    const prisma: any = {
      regionRider: { findMany: jest.fn().mockResolvedValue([{ userId: 'rider-1' }]) },
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-ordinary',
          receiverType: 'ordinary_user',
          payTime: new Date(Date.now() + 60_000),
          tasks: [],
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      errandConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: {
            orderTakingPolicy: {
              ordinaryUserEnabled: true,
              receiverChoiceEnabled: true,
              ordinaryUserFallbackEnabled: true,
              ordinaryUserFallbackMinutes: 10,
            },
          },
        }),
      },
    };
    const notifyService = { createAndDispatch: jest.fn() };
    const service = new ErrandService(
      prisma, {} as any, notifyService as any, {} as any, {} as any, {} as any, {} as any,
    );

    await (service as any).notifyAvailableRiders({
      id: 'order-ordinary',
      regionId: 'region-1',
      receiverType: 'ordinary_user',
      payTime: new Date(Date.now() + 60_000),
      type: 'pickup',
      payAmount: 8,
    });

    expect(prisma.regionRider.findMany).not.toHaveBeenCalled();
    expect(notifyService.createAndDispatch).not.toHaveBeenCalled();
  });
});
