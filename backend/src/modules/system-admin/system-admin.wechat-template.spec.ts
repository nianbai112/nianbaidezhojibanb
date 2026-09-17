import { BadRequestException } from '@nestjs/common';
import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService WeChat template technical ownership', () => {
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
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
        delete: jest.fn(),
      },
    };
    const service = new SystemAdminService(prisma, {} as any);
    return { service, prisma };
  }

  it('reports locked scenes without replacing an unverified persisted mapping', async () => {
    const persistedTakeawayMapping = { keyword7: 'content' };
    const { service } = createService([
      {
        id: 'official-accepted', platformType: 'official', templateType: 'errand_accepted',
        fieldMapping: { thing1: 'wrongMutableValue' }, defaultPage: null,
      },
      {
        id: 'takeaway', platformType: 'miniprogram', templateType: 'takeaway_order_status',
        fieldMapping: persistedTakeawayMapping, defaultPage: '/persisted/page',
      },
    ]);

    const result = await service.getTemplateList({ page: 1, pageSize: 20 });

    expect(result.list[0]).toEqual(expect.objectContaining({
      contractManaged: true,
      fieldMapping: {
        character_string1: 'orderNo',
        thing4: 'riderName',
        time6: 'estimatedTime',
      },
    }));
    expect(result.list[1]).toEqual(expect.objectContaining({
      contractManaged: true,
      fieldMapping: persistedTakeawayMapping,
      defaultPage: '/persisted/page',
    }));
  });

  it('rejects technical edits for an operator-visible managed scene', async () => {
    const { service, prisma } = createService();
    prisma.wechatTemplateConfig.findUnique.mockResolvedValue({
      id: 'takeaway', platformType: 'miniprogram', templateType: 'takeaway_order_status',
      templateId: 'current-template', fieldMapping: { keyword7: 'content' },
    });

    await expect(service.updateTemplate('takeaway', {
      fieldMapping: { thing1: 'orderNo' },
    })).rejects.toBeInstanceOf(BadRequestException);
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
