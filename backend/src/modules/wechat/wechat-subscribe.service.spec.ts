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
});
