import { SystemAdminService } from './system-admin.service';

describe('rider automatic payout settings', () => {
  const valid = { riderAutoPayoutEnabled: true, riderTransferSceneId: '1005',
    riderAuthorizationNotifyUrl: 'https://api.example.com/wxpay/rider-authorization-notify' };
  function harness() {
    const prisma: any = { config: {
      findUnique: jest.fn().mockResolvedValue({ value: { platformPublicKey: 'managed-key', mchId: 'merchant' } }),
      upsert: jest.fn().mockResolvedValue({}),
    } };
    return { prisma, service: new SystemAdminService(prisma, {} as any) };
  }
  it.each([
    { riderTransferSceneId: '1000' }, { riderTransferMaxAmount: 2000 },
    { riderTransferMaxAmount: 0 }, { riderTransferMaxAmount: 0.09 }, { riderTransferDailyAmount: 1.001 },
    { riderTransferDailyUserAmount: -1 },
    { riderAuthorizationNotifyUrl: 'http://api.example.com/wxpay/rider-authorization-notify' },
    { riderAuthorizationNotifyUrl: 'https://api.example.com/wrong-path' },
    { riderAuthorizationNotifyUrl: 'https://api.example.com/wxpay/rider-authorization-notify?x=1' },
  ])('rejects invalid payout configuration before saving: %j', async overrides => {
    const h = harness();
    await expect(h.service.saveConfigGroup('wechat_pay', { wechat_pay: { ...valid, ...overrides } })).rejects.toThrow();
    expect(h.prisma.config.upsert).not.toHaveBeenCalled();
  });
  it('retains backend-managed verification material while saving approved settings', async () => {
    const h = harness();
    await h.service.saveConfigGroup('wechat_pay', { wechat_pay: { ...valid, platformPublicKey: 'client-overwrite' } });
    expect(h.prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {
      value: { ...valid, mchId: 'merchant', platformPublicKey: 'managed-key' },
    } }));
  });
  it('allows switching payouts off without a configured callback', async () => {
    const h = harness();
    await expect(h.service.saveConfigGroup('wechat_pay', { wechat_pay: { riderAutoPayoutEnabled: false } })).resolves.toEqual({ success: true });
  });
});
