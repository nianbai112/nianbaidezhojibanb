import { RiderAuthorizationService } from './rider-authorization.service';
import { WechatTransferError } from './wechat-transfer.gateway';

function harness() {
  let row: any = null;
  const cfg = { appid: 'wx-app', mchid: 'merchant' };
  const prisma: any = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: {
      riderAutoPayoutEnabled: true, riderAuthorizationNotifyUrl: 'https://example.com/api/wxpay/rider-authorization-notify',
    } }) },
    user: { findUnique: jest.fn().mockResolvedValue({ openid: 'wx-user', phone: 'verified-phone' }) },
    riderWechatAuthorization: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(async ({ create, update }) => { row = row ? { ...row, ...update } : create; return row; }),
      update: jest.fn(async ({ data }) => { Object.assign(row, data); return row; }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!row || row.outAuthorizationNo !== where.outAuthorizationNo || row.state === 'CLOSED') return { count: 0 };
        if (typeof where.state === 'string' && row.state !== where.state) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      }),
    },
    riderWechatPayout: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const gateway: any = { runtime: jest.fn().mockResolvedValue(cfg), request: jest.fn(), decodeNotification: jest.fn() };
  const auth: any = { verifyMiniappIdentity: jest.fn().mockResolvedValue({ id: 'rider', openid: 'wx-user', appid: cfg.appid }) };
  const redis: any = { withRenewingLock: jest.fn(async (_k, _ttl, fn) => fn()) };
  const service = new RiderAuthorizationService(prisma, redis, gateway, auth);
  const reply = (overrides: any = {}) => ({ out_authorization_no: row.outAuthorizationNo,
    state: 'WAIT_USER_CONFIRM', package_info: 'wx-package', appid: cfg.appid, mch_id: cfg.mchid, openid: 'wx-user', ...overrides });
  return { prisma, gateway, auth, service, reply, row: () => row, setRow: (value: any) => { row = value; } };
}

describe('rider automatic receipt authorization', () => {
  it('does not downgrade an effective authorization from a delayed pending response', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply());
    await h.service.start('rider', 'code');
    const pending = { ...h.row() };
    h.gateway.request.mockImplementation(async () => h.reply({ state: 'TAKING_EFFECT', authorization_id: 'wx-auth-id' }));
    await h.service.refresh('rider');
    await (h.service as any).apply(pending, h.reply());
    expect(h.row()).toMatchObject({ state: 'TAKING_EFFECT', authorizationId: 'wx-auth-id' });
    await (h.service as any).apply(pending, h.reply({ state: 'CLOSED' }));
    await (h.service as any).apply(pending, h.reply({ state: 'TAKING_EFFECT', authorization_id: 'wx-auth-id' }));
    expect(h.row()).toMatchObject({ state: 'CLOSED', enabled: false });
  });
  it('binds the login-verified WeChat identity and persists a number before contacting WeChat', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => {
      expect(h.row().outAuthorizationNo).toMatch(/^RWA[0-9a-f]{28}$/); return h.reply();
    });
    const result = await h.service.start('rider', 'fresh-login-code');
    expect(h.auth.verifyMiniappIdentity).toHaveBeenCalledWith('rider', 'fresh-login-code');
    expect(result).toMatchObject({ authorized: false, package: 'wx-package' });
    expect((await h.service.status('rider')).authorized).toBe(false);
    expect(h.gateway.request.mock.calls[0][2].openid).toBe('wx-user');
  });
  it('does not authorize a different currently logged-in WeChat account', async () => {
    const h = harness(); h.auth.verifyMiniappIdentity.mockRejectedValue(new Error('identity mismatch'));
    await expect(h.service.start('rider', 'wrong-code')).rejects.toThrow('identity mismatch');
    expect(h.gateway.request).not.toHaveBeenCalled();
  });
  it('only marks authorized after the server queries an effective authorization', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply()); await h.service.start('rider', 'code');
    h.gateway.request.mockImplementation(async () => h.reply({ state: 'TAKING_EFFECT', authorization_id: 'wx-auth-id' }));
    const status = await h.service.refresh('rider'); expect(status.authorized).toBe(true);
    expect(h.row().authorizationId).toBe('wx-auth-id');
  });
  it('rejects mismatched recipient and missing effective authorization ID', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply({ openid: 'other' }));
    await expect(h.service.start('rider', 'code')).rejects.toThrow('不一致');
    h.gateway.request.mockImplementation(async () => h.reply({ state: 'TAKING_EFFECT' }));
    await expect(h.service.refresh('rider')).rejects.toThrow('不一致');
  });
  it('reuses a pending package without creating a second authorization', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply()); await h.service.start('rider', 'code');
    const id = h.row().outAuthorizationNo; h.gateway.request.mockClear();
    await h.service.start('rider', 'code-2');
    expect(h.row().outAuthorizationNo).toBe(id);
    expect(h.gateway.request.mock.calls.map((c: any[]) => c[0])).toEqual(['GET']);
  });
  it('keeps the same number after an authorization network timeout', async () => {
    const h = harness(); h.gateway.request.mockRejectedValue(new Error('timeout'));
    await expect(h.service.start('rider', 'code')).rejects.toThrow('timeout'); const id = h.row().outAuthorizationNo;
    h.gateway.request.mockRejectedValueOnce(new WechatTransferError('NOT_FOUND', 404)).mockImplementationOnce(async () => h.reply());
    await h.service.start('rider', 'code'); expect(h.row().outAuthorizationNo).toBe(id);
  });
  it('locally stops future reservations even when remote closure times out', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply()); await h.service.start('rider', 'code');
    h.gateway.request.mockRejectedValue(new Error('timeout'));
    await expect(h.service.close('rider')).rejects.toThrow('timeout'); expect(h.row().enabled).toBe(false);
  });
  it('does not expose authorization numbers, OpenID or package in a status response', async () => {
    const h = harness(); h.gateway.request.mockImplementation(async () => h.reply()); await h.service.start('rider', 'code');
    const response = JSON.stringify(await h.service.status('rider'));
    expect(response).not.toContain('wx-user'); expect(response).not.toContain('wx-package');
    expect(response).not.toContain(h.row().outAuthorizationNo);
  });
});
