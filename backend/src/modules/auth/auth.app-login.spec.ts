import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { resolveLoginIdentity } from './app-identity';
import { agreementContentHash } from '../../common/agreement-consent';

jest.mock('./app-identity', () => ({ resolveLoginIdentity: jest.fn() }));

describe('App login boundary', () => {
  const fixtures = () => {
    const trace: string[] = [];
    const documents = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'].map((type) => ({
      id: type, type, title: type, content: '已发布协议正文', version: '2', regionId: 'campus', isShow: true, publishedAt: null,
    }));
    const proofs = documents.map((d) => ({ type: d.type, document_id: d.id, version: d.version, region_id: 'campus', content_hash: agreementContentHash(d as any) }));
    const user = { id: 'app-user', openid: 'app_login_synthetic', publicUid: 10000001, uid: 1, nickname: '校园用户', status: 'ACTIVE' };
    const tx = {
      richTextContent: { findFirst: jest.fn(async ({ where }) => documents.find((d) => d.type === where.type && d.regionId === where.regionId) || null) },
      userAgreementConsent: { upsert: jest.fn(async ({ create }) => { trace.push('consent'); return create; }) },
    };
    const db = {
      ...tx, $transaction: jest.fn(async (work) => work(tx)),
      region: { findUnique: jest.fn().mockResolvedValue({ id: 'campus', isOpen: true }) },
      user: { update: jest.fn().mockResolvedValue(user) },
      studentVerify: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const redis = { set: jest.fn() };
    const oauth = {
      verifyWechatCode: jest.fn().mockResolvedValue({ provider: 'wechat', appId: 'app-id', subject: 'verified-wx', unionId: 'verified-union' }),
      verifyAppleCode: jest.fn().mockResolvedValue({ provider: 'apple', appId: 'bundle-id', subject: 'verified-apple' }),
    };
    const config = { get: jest.fn((key) => key === 'WX_OPEN_PLATFORM_ACCOUNT_ID' ? 'operator-scope' : '') };
    const lifecycle = { assertLoginConfigured: jest.fn(), bindAuthorization: jest.fn().mockResolvedValue(user) };
    const service = new AuthService(db as any, {} as any, config as any, redis as any, {} as any, oauth as any, lifecycle as any);
    jest.spyOn(service as any, 'buildLoginMeta').mockResolvedValue({});
    jest.spyOn(service as any, 'bindInitialRegion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'clearUserProfileCache').mockResolvedValue(undefined);
    const tokens = jest.spyOn(service as any, 'generateTokens').mockImplementation(async () => {
      trace.push('tokens'); return { accessToken: 'local-access', refreshToken: 'local-refresh', expiresIn: 7200 };
    });
    (resolveLoginIdentity as jest.Mock).mockResolvedValue(user);
    const dto = { channel: 'app-weixin', code: 'fresh-code', region_id: 'campus', agreement_consents: proofs };
    return { service, db, redis, oauth, user, tokens, trace, dto, config, lifecycle };
  };
  beforeEach(() => jest.clearAllMocks());

  it.each([null, {}, { channel: 'mp-weixin' }, { code: '' }, { code: {} }, { region_id: '' }, { region_id: [] }, { code: 'a'.repeat(4097) }])('rejects malformed input before OAuth: %j', async (extra) => {
    const f = fixtures();
    const dto = extra === null ? null : Object.keys(extra).length ? { ...f.dto, ...extra } : {};
    await expect(f.service.appLogin(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.oauth.verifyWechatCode).not.toHaveBeenCalled();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
  });
  it.each([undefined, null, [], [{ type: 'TERMS_OF_SERVICE' }]])('requires both explicit proofs for App (including first login)', async (proofs) => {
    const f = fixtures();
    await expect(f.service.appLogin({ ...f.dto, agreement_consents: proofs })).rejects.toMatchObject({ response: { code: 'AGREEMENT_PROOF_REQUIRED' } });
    expect(f.oauth.verifyWechatCode).not.toHaveBeenCalled();
  });
  it('rejects a closed campus before consuming the platform code', async () => {
    const f = fixtures(); f.db.region.findUnique.mockResolvedValue(null);
    await expect(f.service.appLogin(f.dto)).rejects.toThrow('未开放');
    expect(f.oauth.verifyWechatCode).not.toHaveBeenCalled();
  });
  it.each(['version', 'content_hash', 'document_id'])('rejects stale/forged %s before exchange or account creation', async (field) => {
    const f = fixtures(); (f.dto.agreement_consents[0] as any)[field] = 'incorrect';
    await expect(f.service.appLogin(f.dto)).rejects.toThrow();
    expect(f.oauth.verifyWechatCode).not.toHaveBeenCalled();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
  });
  it.each(['app-weixin', 'app-apple'])('uses only verified %s identity and issues tokens after both consent writes', async (channel) => {
    const f = fixtures();
    const result = await f.service.appLogin({ ...f.dto, channel, openid: 'forged', unionId: 'forged', identityToken: 'forged', email: 'forged@example.invalid', unionScope: 'forged', userId: 'forged' });
    expect(result).toMatchObject({ id: f.user.id, token: 'local-access', login_channel: channel, wx_bound: false, login_identifier_type: 'app' });
    expect(resolveLoginIdentity).toHaveBeenCalledWith(f.db, expect.objectContaining({
      provider: channel, subject: channel === 'app-weixin' ? 'verified-wx' : 'verified-apple',
      unionScope: channel === 'app-weixin' ? 'operator-scope' : undefined,
    }), channel === 'app-apple' ? expect.any(Function) : undefined);
    expect(f.trace).toEqual(['consent', 'consent', 'tokens']);
    expect(f.redis.set).not.toHaveBeenCalled(); // App must never overwrite mini-program session_key.
    if (channel === 'app-apple') {
      expect(f.oauth.verifyAppleCode).toHaveBeenCalledWith('fresh-code');
      expect(f.oauth.verifyWechatCode).not.toHaveBeenCalled();
    }
  });
  it('does not issue a token if final agreement recording fails', async () => {
    const f = fixtures(); f.db.$transaction.mockRejectedValue(new Error('database failure'));
    await expect(f.service.appLogin(f.dto)).rejects.toThrow('database failure');
    expect(f.tokens).not.toHaveBeenCalled();
  });
  it('does not create an identity if platform verification fails', async () => {
    const f = fixtures(); f.oauth.verifyWechatCode.mockRejectedValue(new Error('code rejected'));
    await expect(f.service.appLogin(f.dto)).rejects.toThrow('code rejected');
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(f.tokens).not.toHaveBeenCalled();
  });
});
