import { createHmac } from 'crypto';
import { verifyWebhookSignature, WechatMomentsService } from './wechat-moments.service';
import { WechatpadError } from './wechatpad.client';

const ENV: Record<string, string> = {
  WECHAT_MOMENTS_ENABLED: 'true',
  WECHATPAD_BASE_URL: 'https://gw.example.com',
  WECHATPAD_APP_KEY: 'k',
  WECHATPAD_APP_SECRET: 's',
  WECHATPAD_DEVICE_ID: 'dev1',
  WECHATPAD_CDN_BASE_URL: 'https://cdn.example.com',
  WECHAT_MOMENTS_SINCE: '2026-01-01T00:00:00Z',
};

function createHarness(postCount: number, env: Record<string, string> = ENV) {
  const posts = Array.from({ length: postCount }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}` }));
  const items = new Map<string, any>(); // by postId
  const batches = new Map<string, any>();
  const configRows = new Map<string, any>();
  let seq = 0;

  const itemMatches = (item: any, where: any) => {
    if (where.id?.in && !where.id.in.includes(item.id)) return false;
    if (where.batchId !== undefined && item.batchId !== where.batchId) return false;
    if (where.status && typeof where.status === 'string' && item.status !== where.status) return false;
    return true;
  };

  const db: any = {
    post: {
      findMany: jest.fn(async ({ take }: any) =>
        posts
          .filter((p) => {
            const item = items.get(p.id);
            return !item || item.status === 'pending';
          })
          .slice(0, take)
          .map((p) => ({ id: p.id })),
      ),
      count: jest.fn(async () => 0),
    },
    wechatMomentItem: {
      upsert: jest.fn(async ({ where, create }: any) => {
        if (!items.has(where.postId)) items.set(where.postId, { id: `i-${where.postId}`, attempts: 0, batchId: null, ...create });
        return { ...items.get(where.postId) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const item = [...items.values()].find((i) => i.id === where.id);
        Object.assign(item, data);
        return item;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const item of items.values()) {
          if (itemMatches(item, where)) {
            Object.assign(item, data);
            count += 1;
          }
        }
        return { count };
      }),
      count: jest.fn(async () => 0),
    },
    wechatMomentBatch: {
      create: jest.fn(async ({ data }: any) => {
        const batch = { id: `b${++seq}`, ...data };
        batches.set(batch.id, batch);
        return batch;
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(batches.get(where.id), data)),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async ({ where }: any) => batches.get(where.id) || null),
      count: jest.fn(async () => 0),
    },
    config: {
      findUnique: jest.fn(async ({ where }: any) => (configRows.has(where.key) ? { value: configRows.get(where.key) } : null)),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        configRows.set(where.key, configRows.has(where.key) ? update.value : create.value);
      }),
    },
  };
  const redis: any = {
    withRenewingLock: jest.fn((_key: string, _ttl: number, task: () => Promise<any>) => task()),
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
  };
  const upload: any = { upload: jest.fn(async () => ({ url: 'https://cos.example.com/poster.jpg' })) };
  const configService: any = { get: (key: string) => env[key] };

  const service = new WechatMomentsService(db, redis, upload, configService);
  const client = {
    getCdnInfo: jest.fn(async () => ({ auth_key: 'x' })),
    uploadSnsImage: jest.fn(async () => ({ cdnid: `c${++seq}`, width: 750, height: 1334 })),
    postImages: jest.fn(async (images: any[]) => ({ snsId: '14962494110775251489', mediaCount: images.length, raw: {} })),
  };
  jest.spyOn(service, 'createClient').mockReturnValue(client as any);
  const render = jest.spyOn(service, 'renderForPost').mockImplementation(async () => ({
    buffer: Buffer.alloc(2048, 1),
    width: 750,
    height: 1334,
    mimeType: 'image/jpeg',
  }));

  const state = () => configRows.get('wechat.moments_state') || {};
  return { service, client, render, items, batches, state, configRows, redis };
}

describe('WechatMomentsService.runBatch', () => {
  it('does nothing when disabled', async () => {
    const h = createHarness(3, { ...ENV, WECHAT_MOMENTS_ENABLED: 'false' });
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'disabled' });
    expect(h.client.postImages).not.toHaveBeenCalled();
  });

  it('reports missing protocol config instead of running', async () => {
    const h = createHarness(3, { ...ENV, WECHATPAD_APP_SECRET: '' });
    const result = await h.service.runBatch();
    expect(result.status).toBe('misconfigured');
    expect(result.missing).toEqual(['app_secret']);
  });

  it('is idle when no post was approved in the window', async () => {
    const h = createHarness(0);
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'idle' });
    expect(h.client.getCdnInfo).not.toHaveBeenCalled();
  });

  it('posts a single approved post as a one-image moment', async () => {
    const h = createHarness(1);
    const result = await h.service.runBatch();
    expect(result).toMatchObject({ status: 'posted', snsId: '14962494110775251489', postIds: ['p01'] });
    expect(h.client.postImages).toHaveBeenCalledTimes(1);
    expect(h.client.postImages.mock.calls[0][0]).toHaveLength(1);
    expect(h.client.postImages.mock.calls[0][0][0]).toMatchObject({ width: 750, height: 1334, totalSize: 2048 });
    expect(h.items.get('p01').status).toBe('posted');
  });

  it('caps a moment at 9 posters and leaves the rest for the next half hour', async () => {
    const h = createHarness(12);
    const first = await h.service.runBatch();
    expect(first.status).toBe('posted');
    expect(first.postIds).toEqual(['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09']);
    expect(h.client.postImages.mock.calls[0][0]).toHaveLength(9);
    expect(h.items.get('p10')).toBeUndefined();

    const second = await h.service.runBatch();
    expect(second.postIds).toEqual(['p10', 'p11', 'p12']);
    expect(h.client.postImages.mock.calls[1][0]).toHaveLength(3);

    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'idle' });
    expect(h.client.postImages).toHaveBeenCalledTimes(2);
  });

  it('skips a post whose poster fails and still posts the others', async () => {
    const h = createHarness(3);
    const ok = { buffer: Buffer.alloc(10), width: 750, height: 1334, mimeType: 'image/jpeg' as const };
    h.render.mockImplementation(async (postId: string) => {
      if (postId === 'p02') throw new Error('图片下载失败');
      return ok;
    });
    const result = await h.service.runBatch();
    expect(result.postIds).toEqual(['p01', 'p03']);
    expect(h.items.get('p02')).toMatchObject({ status: 'pending', attempts: 1 });
  });

  it('gives up on a post after 3 render failures', async () => {
    const h = createHarness(1);
    h.render.mockRejectedValue(new Error('boom'));
    await h.service.runBatch();
    await h.service.runBatch();
    await h.service.runBatch();
    expect(h.items.get('p01')).toMatchObject({ status: 'failed', attempts: 3 });
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'idle' });
  });

  it('requeues posts when the CDN upload fails and pauses after 3 straight failures', async () => {
    const h = createHarness(2);
    h.client.uploadSnsImage.mockRejectedValue(new WechatpadError('上传朋友圈图片失败：HTTP 502'));
    for (let i = 0; i < 3; i += 1) {
      await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'failed' });
      expect(h.items.get('p01')).toMatchObject({ status: 'pending', batchId: null });
    }
    expect(h.state().paused).toBe(true);
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'paused' });
    expect(h.client.postImages).not.toHaveBeenCalled();
  });

  it('never auto-retries when the publish result is unknown', async () => {
    const h = createHarness(2);
    h.client.postImages.mockRejectedValue(new WechatpadError('发布朋友圈失败：ECONNABORTED', true));
    const result = await h.service.runBatch();
    expect(result.status).toBe('unknown');
    expect(h.items.get('p01').status).toBe('unknown');
    expect(h.state().paused).toBe(true);

    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'paused' });
    expect(h.client.postImages).toHaveBeenCalledTimes(1);

    // 管理员核对后：没发出去 → 重新排队 + 恢复
    await h.service.requeueBatch(result.batchId!);
    await h.service.resume();
    h.client.postImages.mockImplementation(async (images: any[]) => ({ snsId: '1', mediaCount: images.length, raw: {} }));
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'posted', postIds: ['p01', 'p02'] });
  });

  it('pauses when the protocol posts fewer images than sent', async () => {
    const h = createHarness(4);
    h.client.postImages.mockResolvedValue({ snsId: '1', mediaCount: 1, raw: {} });
    const result = await h.service.runBatch();
    expect(result.status).toBe('partial');
    expect(h.items.get('p04').status).toBe('posted');
    expect(h.state().paused).toBe(true);
  });
});

describe('WechatMomentsService settings', () => {
  const EMPTY: Record<string, string> = {};

  it('uses settings entered in the admin panel and masks secrets when read back', async () => {
    const h = createHarness(1, EMPTY);
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'disabled' });

    const saved = await h.service.saveSettings({
      enabled: true,
      baseUrl: 'https://gw.example.com/',
      appKey: 'key123',
      appSecret: 'secret-abcdef',
      webhookSecret: 'hook-secret-9999',
    });
    expect(saved).toMatchObject({ appKey: 'key123', appSecret: '******cdef', webhookSecret: '******9999', baseUrl: 'https://gw.example.com' });
    expect(saved.missing).toEqual(['设备（请先创建设备并扫码登录）']);
    // 没单独填图片服务地址时，先用网关地址
    expect(saved.effectiveCdnBaseUrl).toBe('https://gw.example.com');

    // 原样提交打码值 / 留空，不会覆盖真实密钥
    await h.service.saveSettings({ appSecret: '******cdef', webhookSecret: '' });
    expect(h.configRows.get('wechat.moments_config')).toMatchObject({ appSecret: 'secret-abcdef', webhookSecret: 'hook-secret-9999' });
  });

  it('stores the device id returned by the gateway', async () => {
    const h = createHarness(1, EMPTY);
    await h.service.saveSettings({ enabled: true, baseUrl: 'https://gw.example.com', appKey: 'k', appSecret: 's', cdnBaseUrl: 'https://cdn.example.com' });
    (h.client as any).initDevice = jest.fn(async () => ({ deviceId: 'dev-new', raw: {} }));
    await expect(h.service.createDevice()).resolves.toMatchObject({ deviceId: 'dev-new' });
    const settings = await h.service.getSettings();
    expect(settings.deviceId).toBe('dev-new');
    expect(settings.missing).toEqual([]);
  });

  it('turning the switch off in the admin panel overrides the env default', async () => {
    const h = createHarness(1, ENV);
    await h.service.saveSettings({ enabled: false });
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'disabled' });
  });
});

describe('WechatMomentsService webhook', () => {
  const secret = 'hook-secret';
  const sign = (raw: Buffer) => createHmac('sha256', secret).update(raw).digest('hex');
  const env = { ...ENV, WECHATPAD_WEBHOOK_SECRET: secret };

  it('verifies the HMAC signature', () => {
    const raw = Buffer.from('{"device_id":"dev1","notify_type":1004}');
    expect(verifyWebhookSignature(secret, raw, sign(raw))).toBe(true);
    expect(verifyWebhookSignature(secret, raw, sign(Buffer.from('{}')))).toBe(false);
    expect(verifyWebhookSignature(secret, raw, '')).toBe(false);
  });

  it('rejects a forged callback', async () => {
    const h = createHarness(1, env);
    const raw = Buffer.from('{"device_id":"dev1","notify_type":1004}');
    await expect(h.service.handleWebhook(raw, 'bad', JSON.parse(raw.toString()))).rejects.toThrow('签名校验失败');
    expect(h.state().paused).toBeUndefined();
  });

  it('pauses when the account goes offline and resumes when it is back', async () => {
    const h = createHarness(2, env);
    const offline = Buffer.from('{"device_id":"dev1","notify_type":1004}');
    await h.service.handleWebhook(offline, sign(offline), JSON.parse(offline.toString()));
    expect(h.state()).toMatchObject({ paused: true, pauseCode: 'offline', online: false });
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'paused' });

    const online = Buffer.from('{"device_id":"dev1","notify_type":1003}');
    await h.service.handleWebhook(online, sign(online), JSON.parse(online.toString()));
    expect(h.state()).toMatchObject({ paused: false, online: true });
    await expect(h.service.runBatch()).resolves.toMatchObject({ status: 'posted' });
  });

  it('does not auto-resume a pause that needs a human decision', async () => {
    const h = createHarness(2, env);
    h.client.postImages.mockRejectedValue(new WechatpadError('timeout', true));
    await h.service.runBatch();
    const online = Buffer.from('{"device_id":"dev1","notify_type":1003}');
    await h.service.handleWebhook(online, sign(online), JSON.parse(online.toString()));
    expect(h.state().paused).toBe(true);
  });
});

describe('settings validation', () => {
  it('refuses the callback URL as the gateway address', async () => {
    const h = createHarness(1, ENV);
    await expect(h.service.saveSettings({ baseUrl: 'https://school.example.com/api/wechat-moments/webhook' })).rejects.toThrow('回调地址');
  });
});
