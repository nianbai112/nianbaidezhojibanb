import { WechatOfficialService } from './wechat-official.service';
import { validateErrandNewOrderTemplate } from './wechat-template-contracts';

// Test fixtures only. Production variable numbers must come from the actual template.
const fieldMapping = { character_string7: 'orderNo', amount8: 'orderAmount', thing9: 'serviceName', time10: 'orderTime', thing11: 'serviceAddress' };
const templateId = 'test-template-id-for-new-order-only';
function fixture() {
  const template = { templateId, regionId: 'campus', fieldMapping: { ...fieldMapping } };
  const prisma: any = {
    config: { findUnique: jest.fn(async ({ where }) => ({ value: where.key === 'wechat_official_notify'
      ? { globalEnabled: true, scenes: { new_errand_order: true } } : { appId: 'wx-test-mini' } })) },
    userProfile: { findUnique: jest.fn(async () => ({ regionId: 'other-campus' })) },
    wechatOfficialBinding: { findUnique: jest.fn(async () => ({ officialOpenid: 'official-rider', subscribe: true })) },
    wechatTemplateConfig: { findMany: jest.fn(async () => [template]) },
    wechatMessageLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  };
  const service: any = new WechatOfficialService(prisma, {} as any, { get: jest.fn() } as any, {} as any);
  service.postOfficialTemplateMessage = jest.fn(async () => ({ errcode: 0, msgid: '1234' }));
  const params = { userId: 'rider', scene: 'new_errand_order', page: '/pagesA/Grab/Grab?status=awaiting_delivery&order_id=o1',
    data: { orderId: 'o1', regionId: 'campus', orderNo: 'E001', orderAmount: '8.00元', serviceName: '快递代取', orderTime: new Date('2026-09-17T02:00:00Z'), serviceAddress: '东校区' } };
  return { service, prisma, template, params };
}

describe('official rider new-order template', () => {
  it('uses verified mapping, campus configuration, jump target and stable WeChat deduplication id', async () => {
    const f = fixture();
    expect(await f.service.sendNotificationTemplate(f.params)).toMatchObject({ success: true, templateType: 'new_errand_order' });
    const body = f.service.postOfficialTemplateMessage.mock.calls[0][0];
    expect(body).toMatchObject({ template_id: templateId, touser: 'official-rider', client_msg_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      miniprogram: { appid: 'wx-test-mini', pagepath: f.params.page.slice(1) },
      data: { character_string7: { value: 'E001' }, amount8: { value: '8.00元' }, thing9: { value: '快递代取' }, time10: { value: '2026-09-17 10:00' }, thing11: { value: '东校区' } } });
    expect(Object.keys(body.data)).toHaveLength(5);
    expect(f.prisma.wechatTemplateConfig.findMany.mock.calls[0][0].where.OR).toEqual([{ regionId: 'campus' }, { regionId: null }]);
    expect(f.prisma.wechatMessageLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'pending', wechatMsgId: '1234' }) });
    await f.service.sendNotificationTemplate(f.params);
    expect(f.service.postOfficialTemplateMessage.mock.calls[1][0].client_msg_id).toBe(body.client_msg_id);
  });

  it('does not resend a message already accepted by WeChat after worker recovery', async () => {
    const f = fixture();
    f.prisma.wechatMessageLog.findFirst.mockResolvedValue({ id: 'accepted' });
    expect(await f.service.sendNotificationTemplate(f.params)).toMatchObject({ success: true });
    expect(f.service.postOfficialTemplateMessage).not.toHaveBeenCalled();
  });

  it('rejects a library number or incomplete/malformed field mapping', () => {
    expect(validateErrandNewOrderTemplate('42995', fieldMapping)).toContain('模板库编号');
    expect(validateErrandNewOrderTemplate(templateId, { thing1: 'serviceAddress' })).toContain('字段');
    expect(validateErrandNewOrderTemplate(templateId, { ...fieldMapping, phone1: 'phone' })).toContain('字段');
    expect(validateErrandNewOrderTemplate(templateId, fieldMapping)).toBeNull();
  });

  it('does not send when a required business value is missing', async () => {
    const f = fixture();
    f.params.data.serviceAddress = '';
    expect(await f.service.sendNotificationTemplate(f.params)).toMatchObject({ success: false, error: expect.stringContaining('字段缺少业务数据') });
    expect(f.service.postOfficialTemplateMessage).not.toHaveBeenCalled();
  });

  it('does not send when persisted configuration is a library number', async () => {
    const f = fixture();
    f.template.templateId = '42995';
    expect(await f.service.sendNotificationTemplate(f.params)).toMatchObject({ success: false, error: expect.stringContaining('模板编号无效') });
    expect(f.service.postOfficialTemplateMessage).not.toHaveBeenCalled();
  });
});
