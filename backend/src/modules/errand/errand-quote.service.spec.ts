import { ErrandQuoteService } from './errand-quote.service';

describe('ErrandQuoteService', () => {
  const prisma: any = {
    address: { findFirst: jest.fn() },
    region: { findUnique: jest.fn() },
    errandConfig: { findUnique: jest.fn() },
    config: { findUnique: jest.fn() },
    errandItemSize: { findMany: jest.fn() },
    errandPickupPoint: { findMany: jest.fn() },
  };

  let service: ErrandQuoteService;

  const validDto = {
    region_id: 'region-1',
    service_type: 'express_pickup',
    price: -99,
    tip: 2,
    deliver_lat: 30.102,
    deliver_lng: 120.102,
    tasks: [
      {
        pickup_point_id: 'point-1',
        item_size_id: 'size-1',
        code: 'A1',
        express_company: '顺丰',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.address.findFirst.mockResolvedValue(null);
    prisma.region.findUnique.mockResolvedValue({ id: 'region-1' });
    prisma.errandConfig.findUnique.mockResolvedValue({
      regionId: 'region-1',
      basePrice: 5,
      distancePrice: 2,
      weightPrice: 1,
      timePrice: 3,
      nightPrice: 4,
      maxDistance: 100,
      maxWeight: 20,
      isOpen: true,
    });
    prisma.config.findUnique.mockResolvedValue({
      value: {
        baseFees: { express_pickup: 3 },
        serviceSwitches: { express: true, food: true, custom: true },
      },
    });
    prisma.errandItemSize.findMany.mockResolvedValue([
      { id: 'size-1', regionId: 'region-1', applyTo: 'pickup', price: 1.5 },
    ]);
    prisma.errandPickupPoint.findMany.mockResolvedValue([
      {
        id: 'point-1',
        regionId: 'region-1',
        type: 'pickup',
        isOpen: true,
        latitude: 30.1,
        longitude: 120.1,
      },
    ]);
    service = new ErrandQuoteService(prisma);
  });

  it('ignores client price and computes configured components', async () => {
    const result = await service.quote('user-1', validDto);

    expect(result.baseFee).toBe(3);
    expect(result.sizeFee).toBe(1.5);
    expect(result.distanceFee).toBeGreaterThan(0);
    expect(result.payAmount).toBeGreaterThan(6.5);
    expect(result.pricingSnapshot).not.toHaveProperty('clientPrice');
  });

  it('rejects cross-region sizes and negative tips', async () => {
    prisma.errandItemSize.findMany.mockResolvedValueOnce([
      { id: 'size-1', regionId: 'region-2', applyTo: 'pickup', price: 1.5 },
    ]);

    await expect(service.quote('user-1', validDto)).rejects.toThrow('规格不属于当前区域');
    await expect(service.quote('user-1', { ...validDto, tip: -1 })).rejects.toThrow('小费金额无效');
  });

  it('blocks universal tasks that require rider advance payment', async () => {
    await expect(
      service.quote('user-1', {
        ...validDto,
        service_type: 'custom_task',
        tasks: [{ description: '代买', budget: 20 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERRAND_ADVANCE_PAYMENT_DISABLED' }),
    } as any);
  });

  it('rejects closed or cross-region pickup points', async () => {
    prisma.errandPickupPoint.findMany.mockResolvedValueOnce([
      { id: 'point-1', regionId: 'region-2', type: 'pickup', isOpen: true },
    ]);

    await expect(service.quote('user-1', validDto)).rejects.toThrow('取件点不属于当前区域');
  });
});
