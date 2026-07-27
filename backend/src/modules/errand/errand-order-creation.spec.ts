import { ErrandService } from './errand.service';

describe('ErrandService authoritative order creation', () => {
  const tx: any = {
    errandOrder: {
      create: jest.fn(async ({ data }: any) => ({
        id: 'order-1',
        orderNo: 'ERR001',
        ...data,
        status: data.status || 'pending_pay',
      })),
    },
    errandOrderTask: { createMany: jest.fn() },
    couponReceive: { updateMany: jest.fn() },
    coupon: { update: jest.fn() },
    subsidyLedger: { create: jest.fn() },
  };
  const prisma: any = {
    address: { findFirst: jest.fn().mockResolvedValue(null) },
    errandConfig: {
      findUnique: jest.fn().mockResolvedValue({
        regionId: 'region-1',
        basePrice: 0,
        isOpen: true,
      }),
    },
    config: { findUnique: jest.fn().mockResolvedValue({ value: {} }) },
    errandItemSize: { findMany: jest.fn().mockResolvedValue([]) },
    couponReceive: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const redis: any = {
    getLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };
  const membershipService: any = {
    getUserBenefits: jest.fn().mockResolvedValue({ list: [] }),
  };
  const userAccess: any = {
    assertStudentProtectedAction: jest.fn().mockResolvedValue(undefined),
  };
  const quoteService: any = { quote: jest.fn() };

  let service: ErrandService;

  const quote = (payAmount: number) => ({
    baseFee: payAmount,
    sizeFee: 0,
    distanceFee: 0,
    weightFee: 0,
    timeFee: 0,
    riderSurcharge: 0,
    tip: 0,
    couponDiscount: 0,
    memberDiscount: 0,
    distanceMeters: 0,
    payAmount,
    quotedAt: new Date().toISOString(),
    pricingSnapshot: {
      regionId: 'region-1',
      serviceType: 'custom_task',
      receiverType: 'approved_rider',
    },
  });

  const dto = {
    region_id: 'region-1',
    service_type: 'custom_task',
    title: '帮送文件',
    description: '从教学楼送到宿舍',
    deliver_address: '1号宿舍楼',
    pickup_address: '教学楼',
    receiver_type: 'approved_rider',
    tasks: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.address.findFirst.mockResolvedValue(null);
    prisma.errandConfig.findUnique.mockResolvedValue({
      regionId: 'region-1',
      basePrice: 0,
      isOpen: true,
    });
    prisma.config.findUnique.mockResolvedValue({ value: {} });
    prisma.errandItemSize.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));
    redis.getLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(undefined);
    membershipService.getUserBenefits.mockResolvedValue({ list: [] });
    service = new ErrandService(
      prisma,
      redis,
      {} as any,
      membershipService,
      userAccess,
      {} as any,
      {} as any,
      quoteService,
    );
    jest.spyOn(service, 'estimateOrderTiming').mockResolvedValue({ data: {} } as any);
    jest.spyOn(service as any, 'recordErrandLearningSnapshot').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'notifyAvailableRiders').mockResolvedValue(undefined);
  });

  it('returns QUOTE_CHANGED without creating an order', async () => {
    quoteService.quote.mockResolvedValue(quote(8));

    await expect(
      service.createOrder('user-1', { ...dto, client_quote_pay_amount: 5 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'QUOTE_CHANGED' }),
    } as any);
    expect(tx.errandOrder.create).not.toHaveBeenCalled();
  });

  it('activates a zero-pay order without a payment request', async () => {
    quoteService.quote.mockResolvedValue(quote(0));

    const result = await service.createOrder('user-1', dto);

    expect(result.data.status).toBe('pending_accept');
    expect(result.data.payChannel).toBe('free');
    expect(result.data.payTime).toBeInstanceOf(Date);
  });
});
