import * as crypto from 'crypto';
import axios from 'axios';
import { WechatOfficialService } from './wechat-official.service';

const createService = (token = 'official-token') => {
  const prisma = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: { token } }) },
  };
  return new WechatOfficialService(
    prisma as any,
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
  );
};

const signedQuery = (token = 'official-token') => {
  const timestamp = '1710000000';
  const nonce = 'nonce-1';
  const signature = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
  return { timestamp, nonce, signature };
};

const encodingAESKey = crypto.randomBytes(32).toString('base64').replace(/=$/, '');
const officialAppId = 'wx-official-app-id';

const encryptOfficialPayload = (message: string, appId = officialAppId) => {
  const aesKey = Buffer.from(`${encodingAESKey}=`, 'base64');
  const messageBuffer = Buffer.from(message, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBuffer.length, 0);
  const plain = Buffer.concat([
    Buffer.alloc(16, 7),
    length,
    messageBuffer,
    Buffer.from(appId, 'utf8'),
  ]);
  const padding = 32 - (plain.length % 32);
  const padded = Buffer.concat([plain, Buffer.alloc(padding, padding)]);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
};

const encryptedSignedQuery = (encrypted: string, token = 'official-token') => {
  const timestamp = '1710000000';
  const nonce = 'nonce-aes';
  const msg_signature = crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
  return { timestamp, nonce, msg_signature, encrypt_type: 'aes' };
};

describe('WechatOfficialService callback signature', () => {
  it('rejects callbacks missing signature fields before handling the challenge or event', async () => {
    const service = createService();

    await expect(service.handleCallback('', { echostr: 'challenge' })).resolves.toBe('error');
    await expect(service.handleCallback('<xml><Event>subscribe</Event></xml>', {})).resolves.toBe('error');
  });

  it('rejects callbacks with an invalid signature', async () => {
    const service = createService();

    await expect(service.handleCallback('', { ...signedQuery(), signature: 'invalid' })).resolves.toBe('error');
  });

  it('rejects callbacks when the server has no configured token', async () => {
    const service = createService('');

    await expect(service.handleCallback('', { ...signedQuery(), echostr: 'challenge' })).resolves.toBe('error');
  });

  it('returns the WeChat challenge only after a valid signature', async () => {
    const service = createService();

    await expect(service.handleCallback('', { ...signedQuery(), echostr: 'challenge' })).resolves.toBe('challenge');
  });
});

describe('WechatOfficialService AES callback binding', () => {
  const createAesService = () => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockResolvedValue({
          value: {
            token: 'official-token',
            encodingAESKey,
            appId: officialAppId,
          },
        }),
      },
      user: { findFirst: jest.fn() },
      wechatOfficialBinding: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const redis = {
      get: jest.fn().mockResolvedValue('user-1'),
    };
    const service = new WechatOfficialService(
      prisma as any,
      redis as any,
      { get: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma, redis };
  };

  it('verifies, decrypts and binds an encrypted subscribe scene event', async () => {
    const { service, prisma, redis } = createAesService();
    const scene = 'bind_user-1_1710000000';
    const eventXml = [
      '<xml>',
      '<FromUserName><![CDATA[official-openid-1]]></FromUserName>',
      '<MsgType><![CDATA[event]]></MsgType>',
      '<Event><![CDATA[subscribe]]></Event>',
      `<EventKey><![CDATA[qrscene_${scene}]]></EventKey>`,
      '</xml>',
    ].join('');
    const encrypted = encryptOfficialPayload(eventXml);
    const outerXml = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;

    await expect(
      service.handleCallback(outerXml, encryptedSignedQuery(encrypted)),
    ).resolves.toBe('success');

    expect(redis.get).toHaveBeenCalledWith(`wechat:bind:scene:${scene}`);
    expect(prisma.wechatOfficialBinding.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        officialOpenid: 'official-openid-1',
        subscribe: true,
      }),
      update: expect.objectContaining({
        officialOpenid: 'official-openid-1',
        subscribe: true,
      }),
    });
  });

  it('decrypts an encrypted URL verification challenge', async () => {
    const { service } = createAesService();
    const encrypted = encryptOfficialPayload('challenge-aes');

    await expect(
      service.handleCallback('', {
        ...encryptedSignedQuery(encrypted),
        echostr: encrypted,
      }),
    ).resolves.toBe('challenge-aes');
  });

  it('rejects an encrypted callback with an invalid msg_signature', async () => {
    const { service, prisma } = createAesService();
    const encrypted = encryptOfficialPayload('<xml><Event><![CDATA[scan]]></Event></xml>');
    const outerXml = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;

    await expect(
      service.handleCallback(outerXml, {
        ...encryptedSignedQuery(encrypted),
        msg_signature: 'invalid',
      }),
    ).resolves.toBe('error');
    expect(prisma.wechatOfficialBinding.upsert).not.toHaveBeenCalled();
  });
});

describe('WechatOfficialService account binding QR code', () => {
  it('creates a user-specific scene and stores it until the QR code expires', async () => {
    const redis = { set: jest.fn().mockResolvedValue(undefined) };
    const tokenService = {
      getOfficialAccessToken: jest.fn().mockResolvedValue('access-token'),
      clearOfficialTokenCache: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WechatOfficialService(
      {} as any,
      redis as any,
      { get: jest.fn() } as any,
      tokenService as any,
    );
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { ticket: 'ticket-1', expire_seconds: 2592000 },
    } as any);

    const result = await service.generateBindQrcode('user-1');

    expect(result.qrUrl).toContain('https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=');
    expect(result.scene).toMatch(/^bind_user-1_\d+$/);
    expect(post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=access-token',
      expect.objectContaining({
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: result.scene } },
      }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      `wechat:bind:scene:${result.scene}`,
      'user-1',
      2592000,
    );
    post.mockRestore();
  });
});

describe('WechatOfficialService template notification delivery', () => {
  const createDeliveryService = (policy: Record<string, any>) => {
    const prisma = {
      config: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.key === 'wechat_official_notify') return Promise.resolve({ value: policy });
          return Promise.resolve(null);
        }),
      },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-1' }) },
      wechatOfficialBinding: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1', officialOpenid: 'official-openid-1', subscribe: true,
        }),
      },
      wechatTemplateConfig: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'template-1', platformType: 'official', templateType: 'errand_delivered',
          templateId: 'wechat-template-1', regionId: null, enabled: true,
          fieldMapping: { thing1: 'orderNo', time2: 'finishedAt', thing3: 'remark' },
        }]),
      },
      wechatMessageLog: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
    };
    const tokenService = {
      getOfficialAccessToken: jest.fn().mockResolvedValue('access-token'),
      clearOfficialTokenCache: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WechatOfficialService(
      prisma as any,
      redis as any,
      { get: jest.fn() } as any,
      tokenService as any,
    );
    return { service, prisma, redis, tokenService };
  };

  it('routes an enabled delivery scene through the configured official template and writes success log', async () => {
    const { service, prisma } = createDeliveryService({
      globalEnabled: true,
      scenes: { errand_delivered: true },
      antispam: {},
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { errcode: 0, msgid: 123 } } as any);

    const result = await service.sendNotificationTemplate({
      userId: 'user-1',
      scene: 'takeaway_delivery_status',
      page: '/pagesA/order/detail?id=order-1',
      data: { orderNo: 'ORDER-1', content: '订单已送达' },
    });

    expect(result).toEqual(expect.objectContaining({ success: true, templateType: 'errand_delivered' }));
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/cgi-bin/message/template/send?access_token=access-token'),
      expect.objectContaining({
        touser: 'official-openid-1',
        template_id: 'wechat-template-1',
        data: expect.objectContaining({
          thing1: { value: 'ORDER-1' },
          time2: { value: expect.any(String) },
          thing3: { value: '订单已送达' },
        }),
      }),
      { timeout: 10000 },
    );
    expect(prisma.wechatMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platformType: 'official',
        templateType: 'errand_delivered',
        status: 'success',
        sentAt: expect.any(Date),
      }),
    });
    post.mockRestore();
  });

  it('does not call WeChat when the global notification switch is off', async () => {
    const { service, prisma } = createDeliveryService({
      globalEnabled: false,
      scenes: { errand_delivered: true },
    });
    const post = jest.spyOn(axios, 'post');

    await expect(service.sendNotificationTemplate({
      userId: 'user-1',
      scene: 'takeaway_delivery_status',
      data: { orderNo: 'ORDER-1' },
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      skipped: true,
      error: 'official_notification_disabled',
    }));

    expect(post).not.toHaveBeenCalled();
    expect(prisma.wechatMessageLog.create).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('refreshes an invalid official access token once and retries the template send', async () => {
    const { service, tokenService } = createDeliveryService({
      globalEnabled: true,
      scenes: { errand_delivered: true },
      antispam: {},
    });
    tokenService.getOfficialAccessToken
      .mockResolvedValueOnce('stale-access-token')
      .mockResolvedValueOnce('fresh-access-token');
    const post = jest.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { errcode: 40001, errmsg: 'invalid credential' } } as any)
      .mockResolvedValueOnce({ data: { errcode: 0, msgid: 456 } } as any);

    await expect(service.sendNotificationTemplate({
      userId: 'user-1',
      scene: 'errand_delivered',
      data: { orderNo: 'ORDER-1', finishedAt: '2026-08-25 00:00', remark: '已完成' },
    })).resolves.toEqual(expect.objectContaining({ success: true }));

    expect(tokenService.clearOfficialTokenCache).toHaveBeenCalledTimes(1);
    expect(tokenService.getOfficialAccessToken).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toContain('access_token=fresh-access-token');
    post.mockRestore();
  });

  it('constrains official template values to the limits of their WeChat field types', async () => {
    const { service, prisma } = createDeliveryService({
      globalEnabled: true,
      scenes: { errand_delivered: true },
      antispam: {},
    });
    prisma.wechatTemplateConfig.findMany.mockResolvedValue([{
      id: 'template-delivered',
      platformType: 'official',
      templateType: 'errand_delivered',
      templateId: 'wechat-template-delivered',
      regionId: null,
      enabled: true,
      fieldMapping: {
        character_string13: 'orderNo',
        time5: 'finishedAt',
        thing7: 'deliveryAddress',
      },
    }]);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { errcode: 0, msgid: 789 } } as any);

    await expect(service.sendNotificationTemplate({
      userId: 'user-1',
      scene: 'errand_delivered',
      data: {
        orderNo: 'ORDER-1234567890123456789012345678901234567890',
        finishedAt: '2026年08月25日 00:12:34',
        deliveryAddress: '重庆城乡发展职业学院第一教学楼东侧学生宿舍二栋大厅',
      },
    })).resolves.toEqual(expect.objectContaining({ success: true }));

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/cgi-bin/message/template/send?access_token=access-token'),
      expect.objectContaining({
        data: {
          character_string13: { value: 'ORDER-12345678901234567890123456' },
          time5: { value: '2026年08月25日 00:12:34' },
          thing7: { value: '重庆城乡发展职业学院第一教学楼东侧学生宿' },
        },
      }),
      { timeout: 10000 },
    );
    post.mockRestore();
  });

  it('retries an official message immediately and updates the original log', async () => {
    const { service, prisma } = createDeliveryService({});
    prisma.wechatMessageLog.findUnique.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      openid: 'official-openid-1',
      platformType: 'official',
      templateType: 'errand_delivered',
      templateId: 'wechat-template-1',
      page: null,
      payload: { thing1: { value: 'ORDER-1' } },
      status: 'failed',
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { errcode: 0 } } as any);

    await expect(service.retryTemplateMessage('log-1')).resolves.toEqual({
      success: true,
      message: '服务号消息已重新发送',
    });
    expect(prisma.wechatMessageLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        status: 'success', errorCode: null, errorMessage: null, sentAt: expect.any(Date),
      }),
    });
    post.mockRestore();
  });
});
