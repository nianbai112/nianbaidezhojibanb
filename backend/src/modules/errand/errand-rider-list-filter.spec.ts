import { ErrandService } from './errand.service';

describe('ErrandService rider list status boundaries', () => {
  it('queries only waiting-confirmation orders for status=arrived', async () => {
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'errand-arrived',
          status: 'arrived',
          createdAt: new Date('2026-08-31T02:00:00.000Z'),
        }]),
        count: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.status === 'arrived' ? 1 : 0),
        ),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'shop-delivered',
          status: 'DELIVERED',
          createdAt: new Date('2026-08-31T01:00:00.000Z'),
        }]),
        count: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.status === 'DELIVERED' ? 1 : 0),
        ),
      },
    };
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = prisma;
    service.getOrderTakingIdentity = jest.fn().mockResolvedValue({
      role: 'approved_rider',
      canTakeOrders: true,
      regionId: 'region-1',
    });
    service.formatOrderTakingIdentity = jest.fn().mockReturnValue({
      role: 'approved_rider',
    });
    service.formatMiniOrders = jest.fn().mockImplementation(async (rows: any[]) =>
      rows.map((row) => ({ id: row.id, status: row.status, created_at: row.createdAt })),
    );
    service.formatShopOrdersForRider = jest.fn().mockImplementation(async (rows: any[]) =>
      rows.map((row) => ({ id: row.id, status: 'arrived', created_at: row.createdAt })),
    );

    await expect(service.getDeliveryOrdersList('rider-1', {
      status: 'arrived',
      type: 'all',
    })).resolves.toMatchObject({
      success: true,
      orders: [
        { id: 'errand-arrived' },
        { id: 'shop-delivered' },
      ],
      total_items: 2,
    });

    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          regionId: 'region-1',
          riderId: 'rider-1',
          status: 'arrived',
        }),
      }),
    );
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          riderId: 'rider-1',
          status: 'DELIVERED',
        }),
      }),
    );

    prisma.order.findMany.mockClear();
    await service.getDeliveryOrdersList('rider-1', {
      status: 'completed',
      type: 'all',
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          riderId: 'rider-1',
          status: { in: ['RECEIVED', 'COMPLETED'] },
        }),
      }),
    );
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        riderId: 'rider-1',
        status: { in: ['RECEIVED', 'COMPLETED'] },
      }),
    });
  });
});
