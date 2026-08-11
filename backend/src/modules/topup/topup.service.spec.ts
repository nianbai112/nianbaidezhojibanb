import { TopupService } from './topup.service';

describe('TopupService', () => {
  function createService(prismaOverrides: Record<string, any>) {
    const prisma = {
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
      topupOrder: { create: jest.fn().mockResolvedValue({
        id: 'topup-1', userId: 'user-1', postId: 'post-1', regionId: 'region-a',
        packageId: 'pkg-1', orderNo: 'PINVIP1', amount: 0, packageName: '24小时',
        duration: 24, durationUnit: 'hours', status: 'success', payChannel: 'membership_benefit',
      }) },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const membership: any = { consumeBenefitWithDb: jest.fn().mockResolvedValue({}) };
    const service = new TopupService(prisma, {} as any, {} as any, membership);

    await expect((service as any).tryUseMemberFreePin('user-1', 'post-1', {
      id: 'pkg-1', name: '24小时', regionId: 'region-a', amount: 1, duration: 24, durationUnit: 'hours',
    })).resolves.toEqual(expect.objectContaining({ usedMemberBenefit: true }));

    expect(membership.consumeBenefitWithDb).toHaveBeenCalledWith('user-1', 'post_pin_free_quota', expect.objectContaining({
      targetType: 'post', targetId: 'post-1',
    }), tx);
    expect(tx.post.update).toHaveBeenCalled();
  });
});
