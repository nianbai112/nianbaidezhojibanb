import { NotifyService } from './notify.service';

describe('admin WeChat log details', () => {
  function setup(logs: any[]) {
    const service: any = Object.create(NotifyService.prototype);
    service.prisma = {
      wechatMessageLog: { findMany: jest.fn().mockResolvedValue(logs), count: jest.fn().mockResolvedValue(logs.length), findUnique: jest.fn().mockResolvedValue(logs[0]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', nickname: '小林同学' }]) },
    };
    service.getAccessibleUserIds = jest.fn().mockResolvedValue(null);
    return service;
  }
  it('joins the recipient name, preserves full identifiers and hides message payload', async () => {
    const service = setup([{ id: 'log-1', userId: 'user-1', openid: 'complete-openid', platformType: 'official', templateType: 'errand_delivered', templateId: 'template-1', page: '/pagesA/order/errand-detail/errand-detail?id=order-1', status: 'failed', errorCode: '40165', errorMessage: 'invalid weapp pagepath', payload: { thing1: { value: 'private-content' } }, requestIpSource: 'system' }]);
    const result = await service.getWechatMessageLogs({}, 'admin-1');
    expect(result.list[0]).toMatchObject({ userName: '小林同学', openid: 'complete-openid', templateName: '跑腿订单完成通知', errorCodeLabel: '40165', errorMessageZh: '小程序跳转页面无效，微信拒绝发送', retryable: true, payload: '[已隐藏]' });
    expect(JSON.stringify(result)).not.toContain('private-content');
  });
  it('explains historical missing consent without fabricating an IP or exposing retry', async () => {
    const service = setup([{ userId: 'user-1', status: 'failed', platformType: 'miniprogram', templateType: 'errand_accepted', errorMessage: '用户未授权当前模板或授权已使用', requestIp: null }]);
    const result = await service.getWechatMessageLogs({});
    expect(result.list[0]).toMatchObject({ status: 'failed', displayStatus: 'skipped', errorCodeLabel: '未请求微信', requestIp: null, requestIpSourceLabel: '历史未记录来源', retryable: false });
  });
  it('blocks retrying a recipient outside the administrator data scope', async () => {
    const service = setup([{ id: 'log-1', userId: 'another-user', status: 'failed', platformType: 'official' }]);
    service.getAccessibleUserIds.mockResolvedValue(['user-1']);
    service.wechatOfficial = { retryTemplateMessage: jest.fn() };
    await expect(service.retryWechatMessage('log-1', 'admin-1')).rejects.toMatchObject({ status: 403 });
    expect(service.wechatOfficial.retryTemplateMessage).not.toHaveBeenCalled();
  });
});
