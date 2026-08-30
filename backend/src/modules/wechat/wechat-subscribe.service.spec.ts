import axios from 'axios';
import { WechatSubscribeService } from './wechat-subscribe.service';

jest.mock('axios');

describe('WechatSubscribeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only sends an accepted subscription and consumes it after success', async () => {
    const prisma: any = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-1' }) },
      wechatTemplateConfig: { findMany: jest.fn().mockResolvedValue([{ templateId: 'template-1', regionId: 'region-1', fieldMapping: { thing1: 'content' }, defaultPage: '/pagesA/order/order' }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
      wechatSubscribeConsent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'consent-1', status: 'accept', templateId: 'template-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      wechatMessageLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const tokenService: any = { getMiniappAccessToken: jest.fn().mockResolvedValue('token-1') };
    (axios.post as jest.Mock).mockResolvedValue({ data: { errcode: 0 } });
    const service = new WechatSubscribeService(prisma, tokenService);

    await expect(service.sendSubscribeMessage({ userId: 'user-1', templateType: 'takeaway_order_status', data: { content: '订单已送达' } })).resolves.toEqual({ success: true });
    expect(prisma.wechatSubscribeConsent.update).toHaveBeenCalledWith({ where: { id: 'consent-1' }, data: { status: 'used' } });
  });

  it('lists the current region template before the global fallback', async () => {
    const prisma: any = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-1' }) },
      wechatTemplateConfig: {
        findMany: jest.fn().mockResolvedValue([
          { templateType: 'comment_reply', templateId: 'global-template', regionId: null },
          { templateType: 'comment_reply', templateId: 'region-template', regionId: 'region-1' },
        ]),
      },
    };
    const service = new WechatSubscribeService(prisma, {} as any);

    await expect(service.listEnabledTemplates(['comment_reply'], 'user-1')).resolves.toEqual([
      { templateType: 'comment_reply', templateId: 'region-template' },
    ]);
  });

  it('uses the rider operating region for rider templates', async () => {
    const prisma: any = {
      regionRider: { findUnique: jest.fn().mockResolvedValue({ regionId: 'rider-region' }) },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'profile-region' }) },
      wechatTemplateConfig: {
        findMany: jest.fn().mockResolvedValue([
          { templateType: 'takeaway_rider_order', templateId: 'profile-template', regionId: 'profile-region' },
          { templateType: 'takeaway_rider_order', templateId: 'rider-template', regionId: 'rider-region' },
        ]),
      },
    };
    const service = new WechatSubscribeService(prisma, {} as any);

    await expect(service.listEnabledTemplates(['takeaway_rider_order'], 'user-1')).resolves.toEqual([
      { templateType: 'takeaway_rider_order', templateId: 'rider-template' },
    ]);
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it('does not send when the accepted consent belongs to another template id', async () => {
    const prisma: any = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: null }) },
      wechatTemplateConfig: { findMany: jest.fn().mockResolvedValue([{ templateId: 'template-current', regionId: null }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
      wechatSubscribeConsent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'consent-1', status: 'accept', templateId: 'template-old' }),
      },
      wechatMessageLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new WechatSubscribeService(prisma, {} as any);

    await expect(service.sendSubscribeMessage({ userId: 'user-1', templateType: 'comment_reply', data: {} })).resolves.toEqual({
      success: false,
      error: '用户未授权当前模板或授权已使用',
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('normalizes WeChat time fields and fills common order fields before sending', async () => {
    const prisma: any = {
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: null }) },
      wechatTemplateConfig: {
        findMany: jest.fn().mockResolvedValue([{
          templateId: 'template-1', regionId: null, defaultPage: '/pagesA/Grab/Grab',
          fieldMapping: { time1: 'estimatedTime', thing2: 'pickupAddress' },
        }]),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
      wechatSubscribeConsent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'consent-1', status: 'accept', templateId: 'template-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      wechatMessageLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const tokenService: any = { getMiniappAccessToken: jest.fn().mockResolvedValue('token-1') };
    (axios.post as jest.Mock).mockResolvedValue({ data: { errcode: 0 } });
    const service = new WechatSubscribeService(prisma, tokenService);

    await expect(service.sendSubscribeMessage({
      userId: 'user-1', templateType: 'takeaway_rider_order',
      data: { content: '有新配送任务', estimatedTime: new Date('2026-08-29T05:05:00.000Z') },
    })).resolves.toEqual({ success: true });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('access_token=token-1'),
      expect.objectContaining({
        data: {
          time1: { value: '2026-08-29 13:05' },
          thing2: { value: '有新配送任务' },
        },
      }),
    );
  });

  it('retries a failed subscription immediately and updates the original log', async () => {
    const prisma: any = {
      wechatMessageLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'log-1', userId: 'user-1', openid: 'openid-1', platformType: 'miniprogram',
          templateType: 'takeaway_order_status', templateId: 'template-1', page: '/pagesA/order/order',
          payload: { thing1: { value: '订单已送达' } }, status: 'failed',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      wechatSubscribeConsent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const tokenService: any = { getMiniappAccessToken: jest.fn().mockResolvedValue('token-1') };
    (axios.post as jest.Mock).mockResolvedValue({ data: { errcode: 0 } });
    const service = new WechatSubscribeService(prisma, tokenService);

    await expect(service.retryMessage('log-1')).resolves.toEqual({
      success: true,
      message: '订阅消息已重新发送',
    });
    expect(prisma.wechatMessageLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        status: 'success', errorCode: null, errorMessage: null, sentAt: expect.any(Date),
      }),
    });
    expect(prisma.wechatSubscribeConsent.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateType: 'takeaway_order_status', templateId: 'template-1', status: 'accept' },
      data: { status: 'used' },
    });
  });
});
