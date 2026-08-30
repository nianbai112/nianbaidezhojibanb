import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';

const createService = (overrides: Record<string, any> = {}) => {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        status: 'BANNED',
        banVersion: 3,
        openid: 'openid-1',
        muteEndAt: null,
        muteReason: null,
      }),
    },
    userProfile: {
      findUnique: jest.fn().mockResolvedValue({ regionId: 'region-1' }),
    },
    region: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'region-1',
        name: '测试校区',
        selfUnbanFee: 9.9,
      }),
    },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue({
        detail: { reason: '多次发布违规内容', status: 'BANNED' },
        createdAt: new Date('2026-08-28T01:00:00.000Z'),
      }),
    },
    selfUnbanRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'request-1',
        requestNo: 'UNBAN-1',
        amount: 9.9,
        status: 'pending_payment',
        banVersion: 3,
      }),
    },
    ...overrides,
  };
  const paymentService = {
    wxUnifiedOrder: jest.fn().mockResolvedValue({
      timeStamp: '1',
      nonceStr: 'nonce',
      package: 'prepay_id=1',
      signType: 'RSA',
      paySign: 'sign',
      paymentNo: 'PAY-1',
    }),
  };
  const redis = {
    withLock: jest.fn(async (_key: string, _ttl: number, task: () => Promise<any>) => task()),
  };
  const noops = Array.from({ length: 7 }, () => ({}));
  const service = new (UserService as any)(prisma, redis, ...noops, paymentService) as UserService;
  return { service, prisma, paymentService, redis };
};

describe('UserService account restriction closure', () => {
  it('returns the complete Mini Program ban-status contract', async () => {
    const { service } = createService();

    await expect(service.getBanStatus('user-1')).resolves.toMatchObject({
      user_id: 'user-1',
      is_banned: true,
      is_muted: false,
      can_post: false,
      can_comment: false,
      ban_info: {
        reason: '多次发布违规内容',
        is_permanent: true,
      },
    });
  });

  it('creates a traceable self-unban request and a server-priced WeChat payment', async () => {
    const { service, prisma, paymentService } = createService();

    const result: any = await service.payUnban('user-1');

    expect(prisma.selfUnbanRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        regionId: 'region-1',
        banVersion: 3,
        amount: 9.9,
        status: 'pending_payment',
      }),
    });
    expect(paymentService.wxUnifiedOrder).toHaveBeenCalledWith(expect.objectContaining({
      bizType: 'self_unban',
      bizId: 'request-1',
      amount: 9.9,
      openid: 'openid-1',
      userId: 'user-1',
    }));
    expect(result).toMatchObject({ request_id: 'request-1', paymentNo: 'PAY-1' });
  });

  it('reuses the winning active request when two payment attempts race', async () => {
    const activeRequest = {
      id: 'request-existing',
      requestNo: 'UNBAN-existing',
      amount: 9.9,
      status: 'pending_payment',
      banVersion: 3,
    };
    const findFirst = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeRequest);
    const { service, prisma, paymentService } = createService({
      selfUnbanRequest: {
        findFirst,
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    });

    const result: any = await service.payUnban('user-1');

    expect(paymentService.wxUnifiedOrder).toHaveBeenCalledWith(
      expect.objectContaining({ bizId: 'request-existing', orderNo: 'UNBAN-existing' }),
    );
    expect(result.request_id).toBe('request-existing');
    expect(prisma.selfUnbanRequest.create).toHaveBeenCalledTimes(1);
  });

  it('shows and charges the same snapshot amount when the regional fee changes', async () => {
    const activeRequest = {
      id: 'request-existing',
      requestNo: 'UNBAN-existing',
      amount: 9.9,
      status: 'pending_payment',
      banVersion: 3,
    };
    const { service, paymentService } = createService({
      region: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'region-1',
          name: '测试校区',
          selfUnbanFee: 19.9,
        }),
      },
      selfUnbanRequest: {
        findFirst: jest.fn().mockResolvedValue(activeRequest),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    });

    await expect(service.getSelfUnbanConfig('user-1')).resolves.toMatchObject({
      enabled: true,
      fee: 9.9,
      request_id: 'request-existing',
    });
    await service.payUnban('user-1');
    expect(paymentService.wxUnifiedOrder).toHaveBeenCalledWith(
      expect.objectContaining({ bizId: 'request-existing', amount: 9.9 }),
    );
  });

  it('does not let an active account buy an unban request', async () => {
    const { service } = createService({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE', openid: 'openid-1' }) },
    });

    await expect(service.payUnban('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['refunding', 'refund_failed'])(
    'does not create another request while the active request is %s',
    async (status) => {
      const { service, prisma } = createService({
        selfUnbanRequest: {
          findFirst: jest.fn().mockResolvedValue({ id: 'request-1', status }),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn(),
        },
      });

      await expect(service.payUnban('user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.selfUnbanRequest.create).not.toHaveBeenCalled();
    },
  );

  it('cancels an unpaid request from an older ban cycle before creating the current one', async () => {
    const staleRequest = {
      id: 'request-old',
      requestNo: 'UNBAN-old',
      amount: 9.9,
      status: 'pending_payment',
      banVersion: 2,
    };
    const currentRequest = {
      id: 'request-current',
      requestNo: 'UNBAN-current',
      amount: 12.8,
      status: 'pending_payment',
      banVersion: 3,
    };
    const { service, prisma, paymentService } = createService({
      selfUnbanRequest: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(staleRequest)
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(currentRequest),
      },
    });

    await service.payUnban('user-1');

    expect(prisma.selfUnbanRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-old', status: 'pending_payment', banVersion: 2 },
      data: expect.objectContaining({ status: 'cancelled', activeKey: null }),
    });
    expect(prisma.selfUnbanRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', banVersion: 3 }),
    });
    expect(paymentService.wxUnifiedOrder).toHaveBeenCalledWith(
      expect.objectContaining({ bizId: 'request-current' }),
    );
  });

  it('does not display the stale snapshot price from an older ban cycle', async () => {
    const { service, prisma } = createService({
      region: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'region-1',
          name: '测试校区',
          selfUnbanFee: 19.9,
        }),
      },
      selfUnbanRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'request-old',
          amount: 1,
          status: 'pending_payment',
          banVersion: 2,
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    });

    await expect(service.getSelfUnbanConfig('user-1')).resolves.toMatchObject({
      enabled: true,
      fee: 19.9,
      request_id: null,
      request_status: null,
    });
    expect(prisma.selfUnbanRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'request-old', banVersion: 2 }),
        data: expect.objectContaining({ status: 'cancelled', activeKey: null }),
      }),
    );
  });

  it('serializes payment preparation with manual activation for the same user', async () => {
    const { service, redis } = createService();

    await service.payUnban('user-1');

    expect(redis.withLock).toHaveBeenCalledWith(
      'self-unban:user:user-1',
      60,
      expect.any(Function),
    );
  });
});
