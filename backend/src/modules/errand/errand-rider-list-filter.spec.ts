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

describe('ErrandService purchase tiers in the rider pool', () => {
  const pool = (tiers: any) => {
    const prisma: any = {
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'purchase-1', status: 'pending_accept', createdAt: new Date('2026-10-05T02:00:00.000Z') },
          { id: 'pickup-1', status: 'pending_accept', createdAt: new Date('2026-10-05T01:00:00.000Z') },
        ]),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      studentVerify: { findUnique: jest.fn().mockResolvedValue(null) },
      config: { findUnique: jest.fn().mockResolvedValue({ value: { riderTiers: tiers } }) },
    };
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = prisma;
    service.getOrderTakingIdentity = jest.fn().mockResolvedValue({
      role: 'approved_rider',
      canTakeOrders: true,
      regionId: 'region-1',
      rider: { userId: 'rider-1', regionId: 'region-1', riderType: 'part_time' },
    });
    service.formatOrderTakingIdentity = jest.fn().mockReturnValue({ role: 'approved_rider' });
    service.getRiderDispatchContext = jest.fn().mockResolvedValue({});
    service.formatMiniOrders = jest.fn().mockImplementation(async (rows: any[]) =>
      rows.map((row) => ({
        id: row.id,
        type: 'errand',
        service_type: row.id === 'purchase-1' ? 'purchase' : 'express_pickup',
        status: 'pending_accept',
        created_at: row.createdAt,
      })),
    );
    service.formatShopOrdersForRider = jest.fn().mockResolvedValue([]);
    return service.getDeliveryOrdersList('rider-1', { status: 'pending_accept', type: 'errand' });
  };

  it('keeps a closed-tier purchase order visible with the reason', async () => {
    const result = await pool({ part_time: { enabled: false } });
    const purchase = result.orders.find((row: any) => row.id === 'purchase-1');
    const pickup = result.orders.find((row: any) => row.id === 'pickup-1');
    expect(purchase.purchase_blocked_reason).toBe('本区域暂未向兼职骑手开放代买服务');
    expect(pickup).not.toHaveProperty('purchase_blocked_reason');
  });

  it('adds no reason while the tier is open', async () => {
    const result = await pool({});
    expect(result.orders.find((row: any) => row.id === 'purchase-1')).not.toHaveProperty('purchase_blocked_reason');
  });
});
