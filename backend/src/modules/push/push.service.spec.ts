import { PushService } from './push.service';

describe('PushService provider acceptance and native payloads', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  function setup(result: any) {
    const calls: any[] = [];
    global.fetch = jest.fn(async (_url: any, options: any) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => calls.length === 1 ? { code: 0, data: { token: 'test-token' } } : result } as any;
    });
    const service = new PushService({ get: (name: string) => ({
      UNI_PUSH_APPID: 'synthetic-app', UNI_PUSH_APPKEY: 'synthetic-key', UNI_PUSH_MASTER_SECRET: 'synthetic-secret',
    } as any)[name] } as any);
    return { service, calls };
  }
  it('includes APNs alert and Android vendor notification while using transmission for online iOS', async () => {
    const { service, calls } = setup({ code: 0, data: { task: { cid: 'successed_offline' } } });
    await expect(service.sendToClient('cid', { platform: 'ios', title: '转单', content: '请处理', data: { scene: 'rider_transfer_request' } })).resolves.toBe(true);
    const body = calls[1];
    expect(body.push_message.notification).toBeUndefined();
    expect(JSON.parse(body.push_message.transmission).payload.scene).toBe('rider_transfer_request');
    expect(body.push_channel.ios.aps.alert.title).toBe('转单');
    expect(body.push_channel.android.ups.notification.click_type).toBe('startapp');
  });
  it.each([
    { code: 10001, msg: 'invalid token' },
    { code: 0, data: { task: { cid: 'successed_ignore' } } },
    { code: 0, data: { task: { cid: 'no_user' } } },
    { code: 0 }, null,
  ])('rejects HTTP 200 that did not accept delivery: %j', async (result) => {
    const { service } = setup(result);
    await expect(service.sendToClient('cid', { title: 'test', content: 'test' })).resolves.toBe(false);
  });
  it('keeps the Android online notification click payload', async () => {
    const { service, calls } = setup({ code: 0, data: { task: { cid: 'successed_online' } } });
    await expect(service.sendToClient('cid', { platform: 'android', title: 'test', content: 'test', data: { orderId: 'o1' } })).resolves.toBe(true);
    expect(JSON.parse(calls[1].push_message.notification.payload).orderId).toBe('o1');
  });
});
