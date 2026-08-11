import * as bcrypt from 'bcrypt';
import { PASSWORD_LOGIN_GENERIC_MESSAGE } from './rider-password-credential.contract';
import { RiderAppService } from './rider-app.service';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

describe('RiderAppService', () => {
  const passwordHash = '$2b$12$Y3j8QVyuzfToeqISpWkTmusFAkmq.bDLq9bWjc4eIiiqp3opYux/m';
  const passwordCredential = {
    id: 'rider-password-login',
    username: 'campus.test',
    normalizedUsername: 'campus.test',
    passwordHash,
    userId: 'user-1',
    enabled: true,
    expiresAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    sessionVersion: 3,
    User: { openid: 'openid-1' },
  };
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
          id: 'user-1', nickname: '小骑手', avatar: 'avatar.png', phone: '13800138000', status: 'ACTIVE',
        }),
      },
      regionRider: { findUnique: jest.fn().mockResolvedValue(rider) },
      region: { findUnique: jest.fn().mockResolvedValue({ name: '测试区域' }) },
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue(passwordCredential),
        update: jest.fn().mockResolvedValue(passwordCredential),
      },
      errandOrder: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-1', riderId: 'user-1', status: 'in_progress' }),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      riderLocationTrack: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
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
      issueActiveUserTokens: jest.fn().mockResolvedValue({
        accessToken: 'password-access', refreshToken: 'password-refresh', expiresIn: 7200,
      }),
    };
    const errand = {
      getDeliveryOrdersList: jest.fn().mockResolvedValue({ orders: [] }),
      getRiderDeliveryOrderDetail: jest.fn().mockResolvedValue({ success: true, data: { id: 'order-1' } }),
      acceptOrder: jest.fn().mockResolvedValue({ success: true }),
      updateRiderStatus: jest.fn().mockResolvedValue({ success: true }),
      updateLocation: jest.fn().mockResolvedValue({ success: true }),
      updateLocationIfNewer: jest.fn().mockResolvedValue({ success: true, updated: true }),
      getRiderInfo: jest.fn().mockResolvedValue({ id: 'rider-1' }),
      updateRiderInfo: jest.fn().mockResolvedValue({ id: 'rider-1' }),
      getOrderStats: jest.fn().mockResolvedValue({ today: 1 }),
    };
    const systemConfig = {
      getRiderAppControlConfig: jest.fn().mockResolvedValue({
        data: { runtime: { locationMaxAgeHours: 24 } },
      }),
    };
    let releasePreviousLock = Promise.resolve();
    const redis = {
      withLock: jest.fn(async (_key: string, _ttl: number, task: () => Promise<unknown>) => {
        const previousLock = releasePreviousLock;
        let releaseCurrentLock!: () => void;
        releasePreviousLock = new Promise<void>((resolve) => {
          releaseCurrentLock = resolve;
        });
        await previousLock;
        try {
          return await task();
        } finally {
          releaseCurrentLock();
        }
      }),
    };
    (prisma as any).$transaction = jest.fn(async (callback: any) => callback(prisma));
    return {
      service: new (RiderAppService as any)(prisma as any, auth as any, errand as any, systemConfig as any, redis as any),
      prisma, auth, errand, systemConfig, redis,
    };
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

    const result = await service.loginPhone(dto, '127.0.0.1', 'rider-app');
    expect(result).toMatchObject({
      token: 'access',
      refreshToken: 'refresh',
      allowed: true,
    });
    expect(result.user).toEqual({
      id: 'user-1',
      nickname: '小骑手',
      avatar: 'avatar.png',
      phone: '13800138000',
    });
    expect(auth.phoneLogin).toHaveBeenCalledWith(dto, '127.0.0.1', 'rider-app');
  });

  it('authenticates the bound official rider with isolated revocable token claims', async () => {
    const { service, prisma, auth } = createService();

    await expect(service.loginPassword({
      username: ' Campus.Test ',
      password: 'Campus2026!',
      device: {
        model: 'LM Phone',
        platform: 'android',
        appVersion: '1.2.3',
        token: 'must-not-be-stored',
      },
    }, '203.0.113.8', 'rider-app/1.2.3')).resolves.toMatchObject({
      accessToken: 'password-access',
      refreshToken: 'password-refresh',
      allowed: true,
      user: { id: 'user-1' },
    });

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
      include: { User: { select: { openid: true } } },
    });
    expect(auth.issueActiveUserTokens).toHaveBeenCalledWith('user-1', 'openid-1', {
      authSource: 'rider_password',
      credentialId: 'rider-password-login',
      credentialVersion: 3,
    }, 'refresh:rider_password:rider-password-login');
    expect(prisma.riderAppPasswordCredential.update).toHaveBeenLastCalledWith({
      where: { id: 'rider-password-login' },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: expect.any(Date),
        lastLoginIp: '203.0.113.8',
        lastLoginDevice: {
          model: 'LM Phone',
          platform: 'android',
          appVersion: '1.2.3',
          userAgent: 'rider-app/1.2.3',
        },
      },
    });
    expect(JSON.stringify(prisma.riderAppPasswordCredential.update.mock.calls)).not.toContain('must-not-be-stored');
  });

  it('performs a real dummy bcrypt comparison for an unknown username without mutating a credential', async () => {
    const { service, prisma, auth } = createService();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue(null);
    const compare = bcrypt.compare as unknown as jest.Mock;
    compare.mockClear();

    await expect(service.loginPassword({
      username: 'unknown.account',
      password: 'not-a-real-password',
    }, '203.0.113.8', 'rider-app')).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);

    expect(compare).toHaveBeenCalledWith(
      'not-a-real-password',
      expect.stringMatching(/^\$2[aby]\$12\$/),
    );
    expect(compare.mock.calls[0][1]).not.toBe(passwordHash);
    expect(prisma.riderAppPasswordCredential.update).not.toHaveBeenCalled();
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it('authenticates only the fixed singleton row even if another row matches the username', async () => {
    const { service, prisma, auth } = createService();
    const fixed = { ...passwordCredential, username: 'fixed.account', normalizedUsername: 'fixed.account' };
    const extra = { ...passwordCredential, id: 'extra-row', username: 'shadow.account', normalizedUsername: 'shadow.account' };
    prisma.riderAppPasswordCredential.findUnique.mockImplementation(async ({ where }) => (
      where.id === 'rider-password-login' ? fixed : extra
    ));

    await expect(service.loginPassword({
      username: 'shadow.account',
      password: 'Campus2026!',
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
      include: { User: { select: { openid: true } } },
    });
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it('rejects a password over 72 UTF-8 bytes with the generic public error', async () => {
    const { service, prisma, auth } = createService();
    const overLimit = `${'密'.repeat(24)}1A`;
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValueOnce(true);

    await expect(service.loginPassword({
      username: 'campus.test',
      password: overLimit,
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it('returns the generic public error and atomically increments a known wrong password', async () => {
    const { service, prisma, auth } = createService();
    prisma.riderAppPasswordCredential.update.mockResolvedValue({
      ...passwordCredential,
      failedAttempts: 1,
    });

    await expect(service.loginPassword({
      username: 'campus.test',
      password: 'Wrong2026!',
    }, '203.0.113.8', 'rider-app')).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it('locks the known credential for fifteen minutes when the fifth failure wins', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T01:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      ...passwordCredential,
      failedAttempts: 4,
    });
    prisma.riderAppPasswordCredential.update
      .mockResolvedValueOnce({ ...passwordCredential, failedAttempts: 5 })
      .mockResolvedValueOnce({
        ...passwordCredential,
        failedAttempts: 5,
        lockedUntil: new Date('2026-08-11T01:15:00.000Z'),
      });

    await expect(service.loginPassword({
      username: 'campus.test',
      password: 'Wrong2026!',
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'rider-password-login' },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(prisma.riderAppPasswordCredential.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'rider-password-login' },
      data: { lockedUntil: new Date('2026-08-11T01:15:00.000Z') },
    });
    jest.useRealTimers();
  });

  it('does not let a correct login clear a lock created by the concurrent fifth failure', async () => {
    const { service, prisma, auth, redis } = createService();
    const state = {
      ...passwordCredential,
      failedAttempts: 4,
      lockedUntil: null as Date | null,
    };
    prisma.riderAppPasswordCredential.findUnique.mockImplementation(
      async () => ({ ...state, User: passwordCredential.User }),
    );

    let releaseFifthFailure!: () => void;
    const fifthFailureCommitted = new Promise<void>((resolve) => {
      releaseFifthFailure = resolve;
    });
    (bcrypt.compare as unknown as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(async () => {
        await fifthFailureCommitted;
        return true;
      });
    prisma.riderAppPasswordCredential.update.mockImplementation(async ({ data }) => {
      if (data.failedAttempts?.increment) state.failedAttempts += data.failedAttempts.increment;
      if (data.lockedUntil instanceof Date) {
        state.lockedUntil = data.lockedUntil;
        releaseFifthFailure();
      }
      if (data.failedAttempts === 0) state.failedAttempts = 0;
      if (data.lockedUntil === null) state.lockedUntil = null;
      return { ...state };
    });

    const fifthFailure = service.loginPassword({
      username: 'campus.test',
      password: 'Wrong2026!',
    });
    const correctLogin = service.loginPassword({
      username: 'campus.test',
      password: 'Campus2026!',
    });
    const [failureResult, correctResult] = await Promise.allSettled([fifthFailure, correctLogin]);

    expect(failureResult.status).toBe('rejected');
    expect(correctResult.status).toBe('rejected');
    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil).toBeInstanceOf(Date);
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
    expect(redis.withLock).toHaveBeenCalledWith(
      'lock:rider_password:rider-password-login',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('clears a past lock and failure count after a successful password login', async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      ...passwordCredential,
      failedAttempts: 5,
      lockedUntil: new Date('2020-01-01T00:00:00.000Z'),
    });

    await service.loginPassword({ username: 'campus.test', password: 'Campus2026!' });

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
      data: expect.objectContaining({ failedAttempts: 0, lockedUntil: null }),
    });
  });

  it.each([
    ['disabled', { enabled: false }],
    ['expired', { expiresAt: new Date('2020-01-01T00:00:00.000Z') }],
    ['locked', { lockedUntil: new Date('2099-01-01T00:00:00.000Z') }],
  ])('rejects a %s credential with the same generic public error', async (_label, override) => {
    const { service, prisma, auth } = createService();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      ...passwordCredential,
      ...override,
    });

    await expect(service.loginPassword({
      username: 'campus.test',
      password: 'Campus2026!',
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it.each([
    ['unapproved rider', { rider: { ...officialRider, verifyStatus: 'pending' } }],
    ['part-time rider', { rider: { ...officialRider, riderType: 'part_time' } }],
    ['regionless rider', { rider: { ...officialRider, regionId: '' } }],
    ['inactive user', { userStatus: 'INACTIVE' }],
  ])('rejects a credential bound to an %s', async (_label, fixture) => {
    const { service, prisma, auth } = createService((fixture as any).rider || officialRider);
    if ((fixture as any).userStatus) {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', nickname: '小骑手', avatar: 'avatar.png', phone: '13800138000',
        status: (fixture as any).userStatus,
      });
    }

    await expect(service.loginPassword({
      username: 'campus.test',
      password: 'Campus2026!',
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
  });

  it('rejects a credential whose assigned region no longer exists', async () => {
    const { service, prisma, auth } = createService();
    prisma.region.findUnique.mockResolvedValue(null);

    await expect(service.loginPassword({
      username: 'campus.test',
      password: 'Campus2026!',
    })).rejects.toThrow(PASSWORD_LOGIN_GENERIC_MESSAGE);
    expect(auth.issueActiveUserTokens).not.toHaveBeenCalled();
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

  it('stores an idempotent batch and forwards the newest point to the live location', async () => {
    const { service, prisma, errand } = createService();
    const recordedAt = new Date().toISOString();

    await expect(service.updateLocationBatch('user-1', { points: [
      { client_id: 'point-1', order_id: 'order-1', lat: 30, lng: 120, recorded_at: recordedAt },
      { client_id: 'point-2', order_id: 'order-1', lat: 30.1, lng: 120.1, accuracy: 8, recorded_at: recordedAt },
    ] })).resolves.toMatchObject({
      success: true,
      inserted: 2,
      accepted_client_ids: ['point-1', 'point-2'],
    });

    expect(prisma.riderLocationTrack.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ riderId: 'user-1', orderId: 'order-1', clientId: 'point-1' }),
      ]),
      skipDuplicates: true,
    });
    expect(errand.updateLocationIfNewer).toHaveBeenCalledWith(
      'user-1',
      { lat: 30.1, lng: 120.1 },
      new Date(recordedAt),
    );
  });

  it('accepts cached points for a recently completed assigned order', async () => {
    const { service, prisma } = createService();
    const recordedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await expect(service.updateLocationBatch('user-1', { points: [{
      client_id: 'completed-point', order_id: 'order-1', lat: 30, lng: 120,
      recorded_at: recordedAt,
    }] })).resolves.toMatchObject({
      success: true,
      accepted_client_ids: ['completed-point'],
    });

    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith({
      where: { riderId: 'user-1', updatedAt: { gte: expect.any(Date) } },
      select: { id: true },
    });
  });

  it('rejects oversized, stale, invalid, or unassigned trajectory batches', async () => {
    const { service } = createService();
    const point = { client_id: 'point-1', order_id: 'order-1', lat: 30, lng: 120, recorded_at: new Date().toISOString() };

    await expect(service.updateLocationBatch('user-1', { points: Array(51).fill(point) }))
      .rejects.toThrow('最多上传 50');
    await expect(service.updateLocationBatch('user-1', { points: [{ ...point, lat: 91 }] }))
      .rejects.toThrow('定位坐标无效');
    await expect(service.updateLocationBatch('user-1', { points: [{
      ...point, recorded_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }] })).rejects.toThrow('超过补传时效');
    await expect(service.updateLocationBatch('user-1', { points: [{ ...point, order_id: 'other-order' }] }))
      .rejects.toThrow('不属于当前骑手');
  });

  it('enforces the server-side background-location switch', async () => {
    const { service, systemConfig, prisma } = createService();
    systemConfig.getRiderAppControlConfig.mockResolvedValue({
      data: { runtime: { backgroundLocationEnabled: false, locationMaxAgeHours: 24 } },
    });

    await expect(service.updateLocationBatch('user-1', { points: [{
      client_id: 'point-1', order_id: 'order-1', lat: 30, lng: 120,
      recorded_at: new Date().toISOString(),
    }] })).rejects.toThrow('后台定位已关闭');
    expect(prisma.riderLocationTrack.createMany).not.toHaveBeenCalled();
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
