import { TopupService } from './topup.service';

describe('TopupService', () => {
  function createService(prismaOverrides: Record<string, any>) {
    const prisma: any = {
      user: { findUnique: jest.fn() },
      config: { findUnique: jest.fn() },
      wechatOfficialBinding: { findUnique: jest.fn() },
      ...prismaOverrides,
    };
    const redis = {};
    const paymentService = {};
    const membershipService = {};

    return {
      service: new TopupService(prisma as any, redis as any, paymentService as any, membershipService as any),
      prisma,
    };
  }

  it('returns mini-program and official account binding fields for the miniapp binding banner', async () => {
    const { service, prisma } = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          openid: 'mp-openid-1',
        }),
      },
      wechatOfficialBinding: {
        findUnique: jest.fn().mockResolvedValue({
          officialOpenid: 'official-openid-1',
          subscribe: true,
        }),
      },
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: {
            appId: 'wx-official-appid',
            appSecret: 'wx-official-secret',
            name: '灵萌校园',
            qrUrl: 'https://cdn.example.com/official-qr.png',
            bindUrl: 'https://api.example.com/wechat/official/bind-url',
          },
        }),
      },
    });

    const payload = {
      isBound: true,
      miniprogram: true,
      official_account: true,
      wx_openid_mp: 'mp-openid-1',
      wx_openid_h5: null,
      official_account_name: '灵萌校园',
      official_account_qr_url: 'https://cdn.example.com/official-qr.png',
      official_account_bind_url: 'https://api.example.com/wechat/official/bind-url',
      show_official_account_binding: true,
    };
    await expect(service.checkWechatBinding('user-1')).resolves.toEqual({
      ...payload,
      data: payload,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { openid: true },
    });
    expect(prisma.wechatOfficialBinding.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('consumes the free-pin benefit and fulfils the pin in one transaction', async () => {
    const tx: any = {
      post: {
        findUnique: jest.fn().mockResolvedValue({ topExpireAt: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      topupOrder: {
        create: jest.fn().mockResolvedValue({
          id: 'topup-1',
          userId: 'user-1',
          postId: 'post-1',
          regionId: 'region-a',
          packageId: 'pkg-1',
          orderNo: 'PINVIP1',
          amount: 0,
          packageName: '24小时',
          duration: 24,
          durationUnit: 'hours',
          status: 'success',
          payChannel: 'membership_benefit',
        }),
      },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const membership: any = {
      consumeBenefitWithDb: jest.fn().mockResolvedValue({}),
    };
    const service = new TopupService(prisma, {} as any, {} as any, membership);

    await expect(
      (service as any).tryUseMemberFreePin('user-1', 'post-1', {
        id: 'pkg-1',
        name: '24小时',
        regionId: 'region-a',
        amount: 1,
        duration: 24,
        durationUnit: 'hours',
      }),
    ).resolves.toEqual(expect.objectContaining({ usedMemberBenefit: true }));

    expect(membership.consumeBenefitWithDb).toHaveBeenCalledWith(
      'user-1',
      'post_pin_free_quota',
      expect.objectContaining({
        targetType: 'post',
        targetId: 'post-1',
      }),
      tx,
    );
    expect(tx.post.update).toHaveBeenCalled();
  });

  it('returns a stable paged recharge history contract', async () => {
    const { service, prisma } = createService({
      recharge: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'recharge-1',
            orderNo: 'REC1',
            amount: '12.30',
            channel: 'WX_PAY',
            status: 'success',
            createdAt: new Date('2026-08-24T10:00:00Z'),
            payTime: new Date('2026-08-24T10:01:00Z'),
          },
        ]),
        count: jest.fn().mockResolvedValue(21),
      },
    });

    await expect(service.getRechargeHistory('user-1', { page: '2', limit: '20' })).resolves.toEqual({
      list: [
        expect.objectContaining({
          id: 'recharge-1',
          order_no: 'REC1',
          amount: 12.3,
          pay_type: 'wechat',
          status: 'success',
        }),
      ],
      total: 21,
      page: 2,
      pageSize: 20,
      recharge_config: { min_recharge: 0.01, max_recharge: 10000 },
    });
    expect(prisma.recharge.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('creates a WeChat recharge with the Prisma enum and returns direct payment parameters', async () => {
    const recharge = {
      id: 'recharge-1',
      orderNo: 'REC12340001',
      amount: 50,
      status: 'pending',
    };
    const prisma: any = {
      recharge: {
        create: jest.fn().mockResolvedValue(recharge),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
    };
    const redis: any = {
      getLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const paymentInfo = {
      paymentNo: 'PAY1',
      timeStamp: '1',
      nonceStr: 'n',
      package: 'prepay_id=1',
      signType: 'RSA',
      paySign: 's',
    };
    const paymentService: any = {
      wxUnifiedOrder: jest.fn().mockResolvedValue(paymentInfo),
    };
    const service = new TopupService(prisma, redis, paymentService, {} as any);

    await expect(service.createRechargeOrder('user-1', { amount: 50 })).resolves.toEqual({
      rechargeId: 'recharge-1',
      orderNo: 'REC12340001',
      amount: 50,
      paymentNo: 'PAY1',
      paymentInfo,
    });
    expect(prisma.recharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        amount: 50,
        channel: 'WX_PAY',
        status: 'pending',
      }),
    });
    expect(paymentService.wxUnifiedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: 'recharge',
        bizId: 'recharge-1',
        amount: 50,
        openid: 'openid-1',
        userId: 'user-1',
      }),
    );
  });

  it.each([0, -1, 10000.01, 1.001, 'not-a-number'])('rejects invalid recharge amount %p before writing an order', async (amount) => {
    const prisma: any = { recharge: { create: jest.fn() } };
    const service = new TopupService(prisma, {} as any, {} as any, {} as any);
    await expect(service.createRechargeOrder('user-1', { amount })).rejects.toThrow('充值金额');
    expect(prisma.recharge.create).not.toHaveBeenCalled();
  });

  it('marks the recharge failed when WeChat prepay creation fails', async () => {
    const prisma: any = {
      recharge: {
        create: jest.fn().mockResolvedValue({ id: 'recharge-1', orderNo: 'REC1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
    };
    const redis: any = {
      getLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const paymentService: any = {
      wxUnifiedOrder: jest.fn().mockRejectedValue(new Error('微信下单失败')),
    };
    const service = new TopupService(prisma, redis, paymentService, {} as any);

    await expect(service.createRechargeOrder('user-1', { amount: 10 })).rejects.toThrow('微信下单失败');
    expect(prisma.recharge.updateMany).toHaveBeenCalledWith({
      where: { id: 'recharge-1', status: 'pending' },
      data: { status: 'failed' },
    });
  });
});
