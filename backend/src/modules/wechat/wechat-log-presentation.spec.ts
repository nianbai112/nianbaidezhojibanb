import { describeWechatPage, hasWechatTemplatePayload, wechatFailure } from './wechat-log-presentation';

describe('readable WeChat delivery evidence', () => {
  it('explains page rejection independently from authorization failures', () => {
    expect(wechatFailure('40165', 'invalid weapp pagepath')).toMatchObject({ errorMessageZh: '小程序跳转页面无效，微信拒绝发送' });
    expect(wechatFailure(null, '用户未授权当前模板或授权已使用').errorCode).toBe('consent_unavailable');
    expect(wechatFailure(null, '模板未配置或已停用').errorCode).toBe('template_missing');
  });
  it('retains the business destination and record identifier', () => {
    expect(describeWechatPage('/pagesA/order/errand-detail/errand-detail?id=order-123')).toBe('打开跑腿订单详情，查看编号：order-123');
    expect(describeWechatPage(null)).toBe('未设置跳转页面');
  });
  it('prevents retrying raw business data as a rendered template', () => {
    expect(hasWechatTemplatePayload({ orderNo: '123' })).toBe(false);
    expect(hasWechatTemplatePayload({})).toBe(false);
    expect(hasWechatTemplatePayload({ thing1: { value: '订单已完成' } })).toBe(true);
  });
});
