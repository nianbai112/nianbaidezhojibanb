import axios from 'axios';
import { isAppLoginOpenid, isMiniappOpenid, isPhoneLoginOpenid } from './wechat-identity';
import { PaymentService } from '../modules/payment/payment.service';
import { TopupService } from '../modules/topup/topup.service';
import { RiderAuthorizationService } from '../modules/rider-payout/rider-authorization.service';
import { RiderPayoutService } from '../modules/rider-payout/rider-payout.service';
import { WechatSubscribeService } from '../modules/wechat/wechat-subscribe.service';

jest.mock('axios');

describe('stored WeChat mini-program identity classification', () => {
  it.each([undefined, null, '', ' ', 123, {}, 'o_valid\n', 'o valid', 'o\0valid',
    'phone_login_abcdef', 'app_login_abcdef', 'APP_LOGIN_abcdef', 'bot_test', 'lingmeng_official_message_account'])
  ('does not treat %p as a mini-program recipient', (openid) => {
    expect(isMiniappOpenid(openid)).toBe(false);
  });

  it('keeps the reserved namespaces distinct and preserves real identifier case', () => {
    expect(isAppLoginOpenid('app_login_123')).toBe(true);
    expect(isAppLoginOpenid('phone_login_123')).toBe(false);
    expect(isPhoneLoginOpenid('phone_login_123')).toBe(true);
    expect(isPhoneLoginOpenid('app_login_123')).toBe(false);
    expect(isMiniappOpenid('oAbCdEfGhIjKlMnOpQrStUvWxYz1')).toBe(true);
    expect(isMiniappOpenid('oabcdefghijklmnopqrstuvwxyz1')).toBe(true);
  });
});

describe.each(['app_login_' + 'a'.repeat(64), 'phone_login_' + 'b'.repeat(32)])
('synthetic login identifier %s stays outside mini-program operations', (openid) => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unified payment before taking a lock, writing an order or calling WeChat', async () => {
    const prisma: any = { paymentOrder: { create: jest.fn(), findFirst: jest.fn() } };
    const redis: any = { getLock: jest.fn(), releaseLock: jest.fn() };
    const service = new PaymentService({} as any, prisma, redis, {} as any, {} as any);
    await expect(service.wxUnifiedOrder({ bizType: 'order', bizId: 'order-1', orderNo: 'order-1',
      amount: 1, description: '测试订单', userId: 'user-1', openid })).rejects.toThrow('微信小程序');
    expect(redis.getLock).not.toHaveBeenCalled();
    expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
    expect(prisma.paymentOrder.findFirst).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('does not report a mini-program binding or expose its placeholder as an OpenID', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ openid }) },
      wechatOfficialBinding: { findUnique: jest.fn().mockResolvedValue(null) },
      config: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new TopupService(prisma, {} as any, {} as any, {} as any);
    await expect(service.checkWechatBinding('user-1')).resolves.toMatchObject({
      isBound: false, miniprogram: false, wx_openid_mp: null,
    });
  });

  it('does not report a matching stale payout authorization as bound or authorized', async () => {
    const prisma: any = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: { riderAutoPayoutEnabled: true } }) },
      user: { findUnique: jest.fn().mockResolvedValue({ openid, phone: '13800000000' }) },
      riderWechatPayout: { findMany: jest.fn().mockResolvedValue([]) },
      riderWechatAuthorization: { findUnique: jest.fn().mockResolvedValue({
        openid, appid: 'mini-app', mchid: 'merchant', sceneId: '1005', state: 'TAKING_EFFECT',
        authorizationId: 'old-authorization', enabled: true,
      }) },
    };
    const gateway: any = { runtime: jest.fn().mockResolvedValue({ appid: 'mini-app', mchid: 'merchant' }) };
    const service = new RiderAuthorizationService(prisma, {} as any, gateway, {} as any);
    await expect(service.status('user-1')).resolves.toMatchObject({
      available: true, bound: false, authorized: false, enabled: false, state: 'NOT_AUTHORIZED',
    });
  });

  it('does not start a receipt authorization with a placeholder even if supplied by a dependency', async () => {
    const auth: any = { verifyMiniappIdentity: jest.fn().mockResolvedValue({ openid, appid: 'mini-app' }) };
    const redis: any = { withRenewingLock: jest.fn() };
    const gateway: any = { request: jest.fn() };
    const service = new RiderAuthorizationService({} as any, redis, gateway, auth);
    await expect(service.start('user-1', 'verified-code')).rejects.toThrow('微信小程序');
    expect(redis.withRenewingLock).not.toHaveBeenCalled();
    expect(gateway.request).not.toHaveBeenCalled();
  });

  it('keeps earned rider income in the wallet without freezing it for an invalid recipient', async () => {
    const tx: any = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: { riderAutoPayoutEnabled: true } }) },
      riderWechatAuthorization: { findUnique: jest.fn().mockResolvedValue({
        openid, appid: 'mini-app', mchid: 'merchant', sceneId: '1005', state: 'TAKING_EFFECT',
        authorizationId: 'old-authorization', enabled: true, outAuthorizationNo: 'authorization-1',
      }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', openid }) },
      riderWechatPayout: { create: jest.fn() },
      wallet: { updateMany: jest.fn() },
      withdraw: { create: jest.fn() },
      walletTransaction: { create: jest.fn() },
    };
    const service = new RiderPayoutService({} as any, {} as any, {} as any);
    await service.reserve(tx, { id: 'order-1', riderId: 'user-1' }, 1);
    expect(tx.riderWechatPayout.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'WALLET', withdrawId: null, reason: '收款身份已变化，请重新核对微信绑定',
    }) });
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.withdraw.create).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('cancels an old queued payout before requesting authorization or transferring money', async () => {
    const row = { id: 'payout-1', orderId: 'order-1', userId: 'user-1', openid, status: 'QUEUED',
      firstSentAt: null, amountFen: 100, appid: 'mini-app', mchid: 'merchant', sceneId: '1005' };
    const tx: any = {
      riderWechatAuthorization: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', openid }) },
      errandOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      riderSettlementItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: { riderAutoPayoutEnabled: true } }) },
      riderWechatPayout: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((action) => action(tx)),
    };
    const gateway: any = { runtime: jest.fn().mockResolvedValue({ appid: 'mini-app', mchid: 'merchant' }), request: jest.fn() };
    const service = new RiderPayoutService(prisma, {} as any, gateway);
    const finish = jest.spyOn(service as any, 'finish').mockResolvedValue(undefined);
    await service.process(row.id);
    expect(finish).toHaveBeenCalledWith(row, 'CANCELLED', '微信授权已暂停或收款身份已变化');
    expect(gateway.request).not.toHaveBeenCalled();
  });

  it('skips a subscription message without spending consent or requesting a WeChat access token', async () => {
    const prisma: any = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: null }) },
      user: { findUnique: jest.fn().mockResolvedValue({ openid }) },
      wechatTemplateConfig: { findMany: jest.fn().mockResolvedValue([{ templateId: 'template-1', regionId: null }]) },
      wechatSubscribeConsent: { findUnique: jest.fn(), update: jest.fn() },
      wechatMessageLog: { create: jest.fn() },
    };
    const tokens: any = { getMiniappAccessToken: jest.fn() };
    const service = new WechatSubscribeService(prisma, tokens);
    await expect(service.sendSubscribeMessage({ userId: 'user-1', templateType: 'comment_reply', data: {} }))
      .resolves.toMatchObject({ success: false });
    expect(prisma.wechatMessageLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'skipped', errorCode: 'openid_missing' }) });
    expect(prisma.wechatSubscribeConsent.findUnique).not.toHaveBeenCalled();
    expect(prisma.wechatSubscribeConsent.update).not.toHaveBeenCalled();
    expect(tokens.getMiniappAccessToken).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects retrying a historical subscription addressed to a synthetic identifier', async () => {
    const prisma: any = { wechatMessageLog: { findUnique: jest.fn().mockResolvedValue({
      id: 'log-1', openid, userId: 'user-1', platformType: 'miniprogram', status: 'failed',
      templateId: 'template-1', payload: { thing1: { value: '通知' } },
    }) }, wechatSubscribeConsent: { findUnique: jest.fn() } };
    const tokens: any = { getMiniappAccessToken: jest.fn() };
    const service = new WechatSubscribeService(prisma, tokens);
    await expect(service.retryMessage('log-1')).rejects.toThrow('原发送数据不完整');
    expect(prisma.wechatSubscribeConsent.findUnique).not.toHaveBeenCalled();
    expect(tokens.getMiniappAccessToken).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
