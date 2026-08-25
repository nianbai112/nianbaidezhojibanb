import axios from 'axios';
import { WechatSubscribeService } from './wechat-subscribe.service';

jest.mock('axios');

describe('WechatSubscribeService', () => {
  it('only sends an accepted subscription and consumes it after success', async () => {
    const prisma: any = {
      wechatTemplateConfig: { findFirst: jest.fn().mockResolvedValue({ templateId: 'template-1', fieldMapping: { thing1: 'content' }, defaultPage: '/pagesA/order/order' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ openid: 'openid-1' }) },
      wechatSubscribeConsent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'consent-1', status: 'accept' }),
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
      where: { userId: 'user-1', templateType: 'takeaway_order_status', status: 'accept' },
      data: { status: 'used' },
    });
  });
});
