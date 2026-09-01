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
    errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({ userId: 'order-create:user-1', version: 1 }) },
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
    errandPickupPoint: { findMany: jest.fn().mockResolvedValue([]) },
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
    prisma.errandPickupPoint.findMany.mockResolvedValue([]);
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

  it.each([
    {
      serviceType: 'express_pickup',
      internalType: 'pickup',
      task: {
        task_type: 'express_pickup',
        express_company: '顺丰',
        pickup_point_id: 'point-1',
        code: '1234',
        item_size_id: 'size-1',
      },
    },
    {
      serviceType: 'express_send',
      internalType: 'deliver',
      task: {
        task_type: 'express_send',
        express_company: '顺丰',
        item_size_id: 'size-1',
        item_description: '文件',
        recipient_address: '收件人地址',
      },
    },
    {
      serviceType: 'food_delivery',
      internalType: 'meal',
      task: {
        task_type: 'food_delivery',
        platform: '美团',
        pickup_point_id: 'canteen-1',
        code: '5678',
        item_size_id: 'size-1',
      },
    },
    {
      serviceType: 'custom_task',
      internalType: 'universal',
      task: {
        task_type: 'custom_task',
        description: '帮送文件，不需要垫付',
        budget_unit: 'yuan',
      },
    },
  ])('persists the $serviceType contract as $internalType', async ({ serviceType, internalType, task }) => {
    quoteService.quote.mockResolvedValue(quote(0));

    const result = await service.createOrder('user-1', {
      ...dto,
      service_type: serviceType,
      tasks: [task],
    });

    expect(result.data.type).toBe(internalType);
    expect(tx.errandOrderTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ taskType: serviceType }),
      ]),
    });
  });

  it('帮我寄件把常用地址作为上门取件地址，不会与收件地址对调', async () => {
    prisma.address.findFirst.mockResolvedValueOnce({
      id: 'address-1',
      regionId: 'region-1',
      full_address: '校内1号宿舍',
      name: '寄件人',
      phone: '13800000000',
      latitude: 30,
      longitude: 108,
    });
    quoteService.quote.mockResolvedValue(quote(0));
    const {
      pickup_address: _pickupAddress,
      deliver_address: _deliverAddress,
      ...baseDto
    } = dto;

    await service.createOrder('user-1', {
      ...baseDto,
      address_id: 'address-1',
      service_type: 'express_send',
      tasks: [{
        task_type: 'express_send',
        item_size_id: 'size-1',
        recipient_address: '重庆市渝中区收件地址',
      }],
    });

    expect(tx.errandOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'deliver',
        pickupAddress: '校内1号宿舍',
        pickupContact: '寄件人',
        pickupPhone: '13800000000',
        deliverAddress: '重庆市渝中区收件地址',
        deliverContact: null,
        deliverPhone: null,
        deliverLat: null,
        deliverLng: null,
      }),
    });
  });

  it('帮我取餐把取餐点地址写入订单头和任务快照', async () => {
    prisma.errandPickupPoint.findMany.mockResolvedValueOnce([{
      id: 'canteen-1',
      name: '学生餐厅',
      address: '学生餐厅',
    }]);
    quoteService.quote.mockResolvedValue(quote(0));

    await service.createOrder('user-1', {
      ...dto,
      pickup_address: '',
      service_type: 'food_delivery',
      tasks: [{
        task_type: 'food_delivery',
        platform: '美团',
        pickup_point_id: 'canteen-1',
        code: '5678',
        item_size_id: 'size-1',
      }],
    });

    expect(tx.errandOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'meal',
        pickupAddress: '学生餐厅',
      }),
    });
    expect(tx.errandOrderTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ pickupAddress: '学生餐厅' }),
      ]),
    });
  });

  it('按明确币种单位保存万能任务预算，不将大于100元误当为分', async () => {
    quoteService.quote.mockResolvedValue(quote(0));

    await service.createOrder('user-1', {
      ...dto,
      tasks: [{
        task_type: 'custom_task',
        description: '预算单位回归',
        budget: 200,
        budget_unit: 'yuan',
      }],
    });

    expect(tx.errandOrderTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          budgetAmount: 200,
          metadata: expect.objectContaining({ budget_unit: 'yuan' }),
        }),
      ]),
    });
  });
});
