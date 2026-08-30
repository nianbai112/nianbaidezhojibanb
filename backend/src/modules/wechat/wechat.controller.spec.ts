import { WechatController } from './wechat.controller';

describe('WechatController subscribe templates', () => {
  it('allows order and community subscription templates and rejects unknown types', async () => {
    const subscribeService = {
      listEnabledTemplates: jest.fn(async (types: string[]) => types.map((templateType) => ({ templateType }))),
    };
    const controller = new WechatController({} as any, subscribeService as any);

    const result = await controller.getSubscribeTemplates('user-1', [
      'errand_accepted',
      'errand_picked',
      'errand_delivered',
      'post_audit_result',
      'post_comment',
      'comment_reply',
      'errand_abnormal',
      'unknown_template',
    ].join(','));

    expect(subscribeService.listEnabledTemplates).toHaveBeenCalledWith([
      'errand_accepted',
      'errand_picked',
      'errand_delivered',
      'post_audit_result',
      'post_comment',
      'comment_reply',
    ], 'user-1');
    expect(result.list).toHaveLength(6);
  });

  it('returns an empty list without exposing every template for an invalid request', async () => {
    const subscribeService = { listEnabledTemplates: jest.fn() };
    const controller = new WechatController({} as any, subscribeService as any);

    await expect(controller.getSubscribeTemplates('user-1', 'unknown_template')).resolves.toEqual({ list: [] });
    expect(subscribeService.listEnabledTemplates).not.toHaveBeenCalled();
  });
});
