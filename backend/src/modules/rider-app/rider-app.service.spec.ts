import { RiderAppService } from './rider-app.service';

describe('RiderAppService', () => {
  const officialRider = {
    id: 'rider-1',
    userId: 'user-1',
    regionId: 'region-1',
    realName: '骑手甲',
    phone: '13800138000',
    riderBio: '',
    status: 'online',
    verifyStatus: 'approved',
    riderType: 'official',
    rating: 5,
    balance: 12.5,
    totalOrders: 8,
    todayOrders: 2,
  };

  function createService(rider: any = officialRider) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1', nickname: '小骑手', avatar: 'avatar.png', phone: '13800138000',
        }),
      },
      regionRider: { findUnique: jest.fn().mockResolvedValue(rider) },
      region: { findUnique: jest.fn().mockResolvedValue({ name: '测试区域' }) },
      errandOrder: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-1', riderId: 'user-1', status: 'in_progress' }),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'risk-1', eventType: 'cannot_contact' }),
      },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({ id: 'node-1' }) },
    };
    const auth = {
      sendPhoneLoginCode: jest.fn().mockResolvedValue({ success: true, expiresIn: 300 }),
      phoneLogin: jest.fn().mockResolvedValue({
        id: 'user-1', token: 'access', accessToken: 'access', refreshToken: 'refresh',
      }),
    };
    const errand = {
      getDeliveryOrdersList: jest.fn().mockResolvedValue({ orders: [] }),
      getRiderDeliveryOrderDetail: jest.fn().mockResolvedValue({ success: true, data: { id: 'order-1' } }),
      acceptOrder: jest.fn().mockResolvedValue({ success: true }),
      updateRiderStatus: jest.fn().mockResolvedValue({ success: true }),
      updateLocation: jest.fn().mockResolvedValue({ success: true }),
      getRiderInfo: jest.fn().mockResolvedValue({ id: 'rider-1' }),
      updateRiderInfo: jest.fn().mockResolvedValue({ id: 'rider-1' }),
      getOrderStats: jest.fn().mockResolvedValue({ today: 1 }),
    };
    (prisma as any).$transaction = jest.fn(async (callback: any) => callback(prisma));
    return { service: new RiderAppService(prisma as any, auth as any, errand as any), prisma, auth, errand };
  }

  it('allows only approved official riders with a region', async () => {
    const { service } = createService();

    await expect(service.getSession('user-1')).resolves.toMatchObject({
      allowed: true,
      user: { id: 'user-1', nickname: '小骑手' },
      rider: {
        user_id: 'user-1',
        region_id: 'region-1',
        region_name: '测试区域',
        rider_type: 'official',
        is_official: true,
      },
    });
  });

  it('denies an approved part-time rider', async () => {
    const { service } = createService({ ...officialRider, riderType: 'part_time' });

    await expect(service.getSession('user-1')).resolves.toMatchObject({
      allowed: false,
      message: expect.stringContaining('兼职骑手'),
    });
  });

  it('uses the existing phone verification service and returns rider eligibility', async () => {
    const { service, auth } = createService();
    const dto = { phone: '13800138000', code: '123456' };

    await expect(service.loginPhone(dto, '127.0.0.1', 'rider-app')).resolves.toMatchObject({
      token: 'access',
      refreshToken: 'refresh',
      allowed: true,
    });
    expect(auth.phoneLogin).toHaveBeenCalledWith(dto, '127.0.0.1', 'rider-app');
  });

  it('delegates SMS code sending to the existing throttled auth service', async () => {
    const { service, auth } = createService();

    await expect(service.sendPhoneCode({ phone: '13800138000' }, '127.0.0.1')).resolves.toMatchObject({
      success: true,
      expiresIn: 300,
    });
    expect(auth.sendPhoneLoginCode).toHaveBeenCalledWith({ phone: '13800138000' }, '127.0.0.1');
  });

  it('allows official riders to use the dedicated App order APIs', async () => {
    const { service, errand } = createService();

    await service.getOrders('user-1', { status: 'pending_accept' });
    await service.acceptOrder('user-1', 'order-1');
    await service.updateLocation('user-1', { lat: 30, lng: 120 });

    expect(errand.getDeliveryOrdersList).toHaveBeenCalledWith('user-1', { status: 'pending_accept' });
    expect(errand.acceptOrder).toHaveBeenCalledWith('order-1', 'user-1');
    expect(errand.updateLocation).toHaveBeenCalledWith('user-1', { lat: 30, lng: 120 });
  });

  it('rejects part-time riders before an App order operation reaches the delivery service', async () => {
    const { service, errand } = createService({ ...officialRider, riderType: 'part_time' });

    await expect(service.getOrders('user-1', {})).rejects.toThrow('兼职骑手');
    expect(errand.getDeliveryOrdersList).not.toHaveBeenCalled();
  });

  it('does not accept App location uploads without an active delivery order', async () => {
    const { service, prisma, errand } = createService();
    prisma.errandOrder.count.mockResolvedValue(0);
    prisma.order.count.mockResolvedValue(0);

    await expect(service.updateLocation('user-1', { lat: 30, lng: 120 }))
      .rejects.toThrow('配送中的订单');
    expect(errand.updateLocation).not.toHaveBeenCalled();
  });

  it('records one actionable exception for an active assigned order', async () => {
    const { service, prisma } = createService();

    await expect(service.reportException('user-1', 'order-1', {
      type: 'cannot_contact',
      description: '多次拨打电话无人接听',
      proof_images: ['proof.jpg'],
    })).resolves.toMatchObject({ success: true, data: { id: 'risk-1' } });

    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1', orderType: 'errand', riderId: 'user-1', eventType: 'cannot_contact', handled: false,
      }),
    });
    expect(prisma.deliveryOrderNode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'order-1', nodeType: 'exception', proofImages: ['proof.jpg'] }),
    });
  });

  it('records shop delivery exceptions with the shop order type', async () => {
    const { service, prisma } = createService();
    prisma.errandOrder.findUnique.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue({ id: 'shop-1', riderId: 'user-1', status: 'SHIPPED' });

    await expect(service.reportException('user-1', 'shop-1', {
      type: 'merchant_delay', description: '商家表示还需要等待十五分钟',
    })).resolves.toMatchObject({ success: true });

    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'shop-1', orderType: 'shop', eventType: 'merchant_delay' }),
    });
  });

  it('returns the existing open exception instead of creating a duplicate', async () => {
    const { service, prisma } = createService();
    prisma.deliveryRiskEvent.findFirst.mockResolvedValue({ id: 'risk-existing', eventType: 'cannot_contact' });

    await expect(service.reportException('user-1', 'order-1', {
      type: 'cannot_contact', description: '仍然无法联系收货人',
    })).resolves.toMatchObject({ success: true, duplicate: true, data: { id: 'risk-existing' } });
    expect(prisma.deliveryRiskEvent.create).not.toHaveBeenCalled();
  });

  it('rejects invalid or unassigned delivery exception reports', async () => {
    const { service, prisma } = createService();

    await expect(service.reportException('user-1', 'order-1', {
      type: 'unknown', description: '说明足够长',
    })).rejects.toThrow('异常类型');

    prisma.errandOrder.findUnique.mockResolvedValue({ id: 'order-1', riderId: 'user-2', status: 'in_progress' });
    await expect(service.reportException('user-1', 'order-1', {
      type: 'address_issue', description: '地址与订单信息不一致',
    })).rejects.toThrow('当前骑手');
  });
});
