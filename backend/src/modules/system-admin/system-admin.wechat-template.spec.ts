import { BadRequestException } from '@nestjs/common';
import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService operator-managed WeChat templates', () => {
  it('masks the official account encryption key and preserves it when the unchanged form is saved', () => {
    const { service } = createService();
    const config = { appId: 'wx-test', encodingAESKey: 'private-aes-value', appSecret: 'private-secret' };
    const masked = (service as any).maskConfigValue(config);
    expect(masked).toEqual({ appId: 'wx-test', encodingAESKey: '******', appSecret: '******' });
    expect((service as any).mergeMaskedConfigValue(config, masked)).toEqual(config);
  });

  function createService(rows: any[] = []) {
    const prisma: any = {
      config: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
      wechatTemplateConfig: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
        delete: jest.fn(),
      },
    };
    const service = new SystemAdminService(prisma, {} as any);
    return { service, prisma };
  }

  const templateId = 'real_account_template_identifier_1234567890';
  const mapping = { character_string1: 'orderNo', amount2: 'orderAmount', thing3: 'serviceName', time4: 'orderTime', thing5: 'serviceAddress' };

  it('reads exactly the persisted mapping, without replacing operator settings with defaults', async () => {
    const { service } = createService([{ id: 'accepted', platformType: 'official', templateType: 'errand_accepted', fieldMapping: { thing9: 'riderName' } }]);
    const result = await service.getTemplateList({});
    expect(result.list[0]).toEqual(expect.objectContaining({ contractManaged: false, fieldMapping: { thing9: 'riderName' } }));
  });

  it('saves edited IDs and mappings for an existing built-in scene', async () => {
    const { service, prisma } = createService();
    prisma.wechatTemplateConfig.findUnique.mockResolvedValue({ id: 'accepted', platformType: 'official', templateType: 'errand_accepted', regionId: null });
    await service.updateTemplate('accepted', { templateId: `  ${templateId}  `, fieldMapping: { thing9: 'riderName' } });
    expect(prisma.wechatTemplateConfig.update).toHaveBeenCalledWith({ where: { id: 'accepted' }, data: { templateId, fieldMapping: { thing9: 'riderName' } } });
  });

  it('creates a global rider template without changing notification switches', async () => {
    const { service, prisma } = createService();
    const result = await service.createTemplate({ platformType: 'official', templateType: 'new_errand_order', templateId, fieldMapping: mapping, enabled: true });
    expect(result.fieldMapping).toEqual(mapping);
    expect(result.id).toMatch(/^wx_[a-f0-9]{32}$/);
    expect(prisma.config.upsert).not.toHaveBeenCalled();
  });

  it('rejects library numbers, incomplete fields and candidate-rider private data', async () => {
    const { service, prisma } = createService();
    for (const patch of [{ templateId: '42995' }, { fieldMapping: { thing1: 'content' } }, { fieldMapping: { ...mapping, thing5: 'riderPhone' } }]) {
      await expect(service.createTemplate({ platformType: 'official', templateType: 'new_errand_order', templateId, fieldMapping: mapping, ...patch })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.wechatTemplateConfig.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate scope and maps concurrent saves to a helpful conflict message', async () => {
    const { service, prisma } = createService();
    prisma.wechatTemplateConfig.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const input = { platformType: 'official', templateType: 'new_errand_order', templateId, fieldMapping: mapping };
    await expect(service.createTemplate(input)).rejects.toThrow('已有模板');
    prisma.wechatTemplateConfig.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createTemplate(input)).rejects.toThrow('刷新后编辑');
  });

  it('prevents an edit from moving another campus template into the global scope', async () => {
    const { service, prisma } = createService();
    prisma.wechatTemplateConfig.findUnique.mockResolvedValue({ platformType: 'official', templateType: 'new_errand_order', regionId: 'campus-a' });
    await expect(service.updateTemplate('a', { regionId: '' })).rejects.toThrow('校区范围');
    expect(prisma.wechatTemplateConfig.update).not.toHaveBeenCalled();
  });

  it('allows toggling a managed scene without rewriting its mapping or template id', async () => {
    const { service, prisma } = createService();
    prisma.wechatTemplateConfig.findUnique.mockResolvedValue({
      id: 'accepted', platformType: 'official', templateType: 'errand_accepted',
      templateId: 'current-template', fieldMapping: { character_string1: 'orderNo' },
    });

    await service.updateTemplate('accepted', { enabled: false });

    expect(prisma.wechatTemplateConfig.update).toHaveBeenCalledWith({
      where: { id: 'accepted' },
      data: { enabled: false },
    });
  });

  it('keeps payment verification material backend-managed when an operator saves the payment form', async () => {
    const { service, prisma } = createService();
    prisma.config.findUnique.mockResolvedValue({
      value: {
        platformPublicKeyId: 'PUB_KEY_ID_CURRENT',
        platformPublicKey: 'CURRENT PUBLIC KEY',
        platformCert: 'CURRENT PLATFORM CERT',
        notifyUrl: 'https://old.example/wxpay/notify',
      },
    });

    await service.saveConfigGroup('wechat_pay', {
      wechat_pay: {
        platformPublicKeyId: 'operator-value',
        platformPublicKey: 'operator-value',
        platformCert: '-----BEGIN CERTIFICATE REQUEST-----',
        notifyUrl: 'https://new.example/wxpay/notify',
      },
    });

    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        value: expect.objectContaining({
          platformPublicKeyId: 'PUB_KEY_ID_CURRENT',
          platformPublicKey: 'CURRENT PUBLIC KEY',
          platformCert: 'CURRENT PLATFORM CERT',
          notifyUrl: 'https://new.example/wxpay/notify',
        }),
      },
    }));
  });
});
