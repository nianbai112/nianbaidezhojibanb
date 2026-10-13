import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { createHash, generateKeyPairSync, KeyObject, sign, verify } from 'crypto';
import { AppOauthService } from './app-oauth.service';

const APP_ID = 'com.example.campus';
const WX_APP_ID = 'wx0123456789abcdef';
const NOW = Math.floor(Date.now() / 1000);
const hash = (value: string) => createHash('sha256').update(value).digest().subarray(0, 16).toString('base64url');
let signing: { publicKey: KeyObject; privateKey: KeyObject };
let wrongSigning: { publicKey: KeyObject; privateKey: KeyObject };
let clientSigning: { publicKey: KeyObject; privateKey: KeyObject };

function token(claims: Record<string, any> = {}, header: Record<string, any> = {}, key?: KeyObject) {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'apple-test-key', typ: 'JWT', ...header })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: 'https://appleid.apple.com', aud: APP_ID, sub: 'apple-subject-1',
    iat: NOW - 5, exp: NOW + 3600, ...claims })).toString('base64url');
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key || signing.privateKey).toString('base64url')}`;
}

function setup(overrides: Record<string, any> = {}) {
  const values: Record<string, any> = {
    WX_APP_APPID: WX_APP_ID, WX_APP_SECRET: 'synthetic-wechat-app-secret',
    APPLE_APP_CLIENT_ID: APP_ID, APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: clientSigning.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), ...overrides,
  };
  const reservations = new Set<string>();
  const redis = { getLock: jest.fn().mockImplementation(async (key: string) => {
    if (reservations.has(key)) return false;
    reservations.add(key); return true;
  }) };
  const service = new AppOauthService({ get: (name: string) => values[name] } as any, redis as any);
  return { service, redis, values };
}

function keysResponse(kid = 'apple-test-key', key = signing.publicKey, extra: Record<string, any> = {}) {
  return { data: { keys: [{ ...key.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256', ...extra }] } };
}

function grant(idToken = token()) {
  return { data: { id_token: idToken, access_token: 'apple-access', refresh_token: 'apple-refresh', token_type: 'Bearer', expires_in: 3600 } };
}

function notification(event: Record<string, any> = {}, claims: Record<string, any> = {}, header: Record<string, any> = {}, key?: KeyObject) {
  return token({
    sub: undefined, exp: undefined, jti: 'notification-1',
    events: { type: 'consent-revoked', sub: 'apple-subject-1', event_time: NOW - 7, ...event },
    ...claims,
  }, header, key);
}

async function expectFailure(work: Promise<unknown>, status: number, code: string) {
  try { await work; throw new Error('Expected OAuth rejection'); } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('App OAuth server credential verification', () => {
  let get: jest.SpyInstance;
  let post: jest.SpyInstance;

  beforeAll(() => {
    signing = generateKeyPairSync('rsa', { modulusLength: 2048 });
    wrongSigning = generateKeyPairSync('rsa', { modulusLength: 2048 });
    clientSigning = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  });
  beforeEach(() => {
    get = jest.spyOn(axios, 'get').mockRejectedValue(new Error('network calls must be explicitly stubbed'));
    post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('network calls must be explicitly stubbed'));
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('exchanges a WeChat app code using only its dedicated server credentials', async () => {
    const { service, redis } = setup();
    get.mockResolvedValue({ data: { openid: 'wechat-openid', unionid: 'verified-union-id', access_token: 'provider-access', expires_in: 7200, scope: 'snsapi_userinfo' } });
    expect(await service.verifyWechatCode('wx-code-1')).toEqual({ provider: 'wechat', appId: WX_APP_ID, subject: 'wechat-openid', unionId: 'verified-union-id' });
    expect(get).toHaveBeenCalledWith('https://api.weixin.qq.com/sns/oauth2/access_token', expect.objectContaining({
      params: { appid: WX_APP_ID, secret: 'synthetic-wechat-app-secret', code: 'wx-code-1', grant_type: 'authorization_code' }, maxRedirects: 0, timeout: 10000,
    }));
    expect(redis.getLock.mock.calls[0][0]).toMatch(/^auth:app-oauth:code:[a-f0-9]{64}$/);
    expect(redis.getLock.mock.calls[0][0]).not.toContain('wx-code-1');
    expect(redis.getLock.mock.calls[0][1]).toBe(600);
  });

  it('does not invent a unionid if WeChat did not supply it', async () => {
    const { service } = setup();
    get.mockResolvedValue({ data: { openid: 'wechat-openid', access_token: 'provider-access', expires_in: 7200, scope: 'snsapi_userinfo' } });
    expect(await service.verifyWechatCode('wx-code-2')).toEqual({ provider: 'wechat', appId: WX_APP_ID, subject: 'wechat-openid' });
  });

  it('does not reuse small-program credentials when app configuration is absent', async () => {
    const { service, redis } = setup({ WX_APP_SECRET: '', WX_MINI_APPID: WX_APP_ID, WX_MINI_SECRET: 'do-not-use' });
    await expectFailure(service.verifyWechatCode('wx-code'), 503, 'APP_OAUTH_NOT_CONFIGURED');
    expect(get).not.toHaveBeenCalled(); expect(redis.getLock).not.toHaveBeenCalled();
  });

  it.each([null, {}, '', ' ', 'code\nline', 'x'.repeat(4097)])('rejects invalid code input before any provider call (case %#)', async input => {
    const { service } = setup();
    await expectFailure(service.verifyWechatCode(input), 400, 'APP_OAUTH_CODE_REQUIRED');
    await expectFailure(service.verifyAppleCode(input), 400, 'APP_OAUTH_CODE_REQUIRED');
    expect(get).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  });

  it('rejects a client identity object instead of trusting its openid or token', async () => {
    const { service } = setup();
    await expectFailure(service.verifyAppleCode({ code: 'code', openid: 'attacker', email: 'attacker@example.test', identityToken: token() }), 400, 'APP_OAUTH_CODE_REQUIRED');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects provider-declared invalid WeChat code without exposing provider error text', async () => {
    const { service } = setup();
    get.mockResolvedValue({ data: { errcode: 40029, errmsg: 'raw-code-secret' } });
    await expectFailure(service.verifyWechatCode('wx-code'), 401, 'APP_OAUTH_CODE_INVALID');
  });

  it.each([
    { openid: '', access_token: 'token', scope: 'snsapi_userinfo', expires_in: 7200 },
    { openid: 'id', access_token: 'token', scope: 'snsapi_base', expires_in: 7200 },
    { openid: 'id', access_token: 'token', scope: 'snsapi_userinfo', expires_in: 0 },
    { openid: 'id', unionid: {}, access_token: 'token', scope: 'snsapi_userinfo', expires_in: 7200 },
  ])('fails closed on malformed WeChat identities: %j', async data => {
    const { service } = setup(); get.mockResolvedValue({ data });
    await expectFailure(service.verifyWechatCode('wx-code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
  });

  it('atomically prevents concurrent replay before either request contacts the provider twice', async () => {
    const { service } = setup();
    get.mockResolvedValue({ data: { openid: 'id', access_token: 'token', scope: 'snsapi_userinfo', expires_in: 7200 } });
    const results = await Promise.allSettled([service.verifyWechatCode('same-code'), service.verifyWechatCode('same-code')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not release a consumed code after a network failure and sanitizes the error', async () => {
    const { service } = setup();
    get.mockRejectedValue({ message: 'raw-secret', config: { params: { secret: 'raw-secret' } } });
    let error: any;
    try { await service.verifyWechatCode('wx-code'); } catch (caught) { error = caught; }
    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error)).not.toContain('raw-secret');
    await expectFailure(service.verifyWechatCode('wx-code'), 401, 'APP_OAUTH_CODE_REPLAYED');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not use process-local replay state when Redis is unavailable', async () => {
    const { service, redis } = setup(); redis.getLock.mockRejectedValue(new Error('redis credential details'));
    await expectFailure(service.verifyAppleCode('code'), 503, 'APP_OAUTH_REPLAY_STORE_UNAVAILABLE');
    expect(post).not.toHaveBeenCalled();
  });

  it('exchanges an Apple code, validates its RSA identity signature, and signs a short-lived P-256 client secret', async () => {
    const { service } = setup();
    post.mockResolvedValue(grant(token({ email: 'ignored@example.test', email_verified: true, c_hash: hash('apple-code'), at_hash: hash('apple-access') })));
    get.mockResolvedValue(keysResponse());
    expect(await service.verifyAppleCode('apple-code')).toEqual({
      provider: 'apple', appId: APP_ID, subject: 'apple-subject-1',
      appleRefreshToken: 'apple-refresh', appleAuthorizedAtMs: (NOW - 5) * 1000,
    });
    const [url, encoded, options] = post.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(options).toMatchObject({ maxRedirects: 0, timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const body = new URLSearchParams(encoded);
    expect([...body.keys()].sort()).toEqual(['client_id', 'client_secret', 'code', 'grant_type']);
    expect(body.get('client_id')).toBe(APP_ID); expect(body.get('code')).toBe('apple-code');
    expect(body.get('grant_type')).toBe('authorization_code');
    const parts = body.get('client_secret')!.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    expect(payload).toMatchObject({ iss: 'TEAM123456', aud: 'https://appleid.apple.com', sub: APP_ID });
    expect(payload.exp - payload.iat).toBe(300);
    expect(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: clientSigning.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))).toBe(true);
    expect(get).toHaveBeenCalledWith('https://appleid.apple.com/auth/keys', expect.objectContaining({ maxRedirects: 0 }));
  });

  it.each([
    { APPLE_APP_CLIENT_ID: '' }, { APPLE_TEAM_ID: '' }, { APPLE_KEY_ID: '' },
    { APPLE_PRIVATE_KEY: '' }, { APPLE_PRIVATE_KEY: 'not-a-private-key' }, { APPLE_APP_CLIENT_ID: 'x'.repeat(192) },
  ])('keeps Apple disabled when its dedicated server credentials are missing or invalid: %j', async settings => {
    const { service, redis } = setup(settings);
    await expectFailure(service.verifyAppleCode('code'), 503, 'APP_OAUTH_NOT_CONFIGURED');
    expect(post).not.toHaveBeenCalled(); expect(redis.getLock).not.toHaveBeenCalled();
  });

  it('rejects a non-P-256 client key and supports escaped PEM newlines', async () => {
    const wrong = setup({ APPLE_PRIVATE_KEY: signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    await expectFailure(wrong.service.verifyAppleCode('code'), 503, 'APP_OAUTH_NOT_CONFIGURED');
    const correct = setup({ APPLE_PRIVATE_KEY: clientSigning.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n') });
    post.mockResolvedValue(grant()); get.mockResolvedValue(keysResponse());
    await expect(correct.service.verifyAppleCode('code')).resolves.toMatchObject({ subject: 'apple-subject-1' });
  });

  it.each([
    { iss: 'https://attacker.test' }, { aud: 'com.other.app' }, { aud: [APP_ID, 'other'] },
    { exp: NOW - 1 }, { exp: String(NOW + 3600) }, { iat: NOW + 3600 }, { iat: null },
    { sub: '' }, { sub: 123 }, { sub: 's'.repeat(192) }, { nbf: NOW + 3600 }, { c_hash: hash('another-code') }, { at_hash: hash('another-access') },
  ])('rejects a validly signed identity with invalid claims: %j', async claims => {
    const { service } = setup(); post.mockResolvedValue(grant(token(claims))); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
  });

  it.each([{ alg: 'none' }, { alg: 'HS256' }, { kid: '' }, { crit: ['custom'] }, { b64: false }])(
    'rejects unsupported JWT headers without downloading attacker-controlled keys: %j', async header => {
      const { service } = setup(); post.mockResolvedValue(grant(token({}, header)));
      await expectFailure(service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('rejects a token signed by any key other than the matching Apple JWK', async () => {
    const { service } = setup(); post.mockResolvedValue(grant(token({}, {}, wrongSigning.privateKey))); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
  });

  it('uses a fixed Apple key endpoint even when a token header supplies jku or x5u', async () => {
    const { service } = setup(); post.mockResolvedValue(grant(token({}, { jku: 'http://127.0.0.1/keys', x5u: 'https://attacker.test/key' }))); get.mockResolvedValue(keysResponse());
    await expect(service.verifyAppleCode('code')).resolves.toMatchObject({ provider: 'apple' });
    expect(get.mock.calls.map((call) => call[0])).toEqual(['https://appleid.apple.com/auth/keys']);
  });

  it('reuses fresh keys and refreshes once for an unknown rotated kid', async () => {
    const { service } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    post.mockResolvedValueOnce(grant()).mockResolvedValueOnce(grant()).mockResolvedValueOnce(grant(token({}, { kid: 'rotated' }, wrongSigning.privateKey)));
    get.mockResolvedValueOnce(keysResponse()).mockResolvedValueOnce(keysResponse('rotated', wrongSigning.publicKey));
    await service.verifyAppleCode('first'); await service.verifyAppleCode('second');
    clock.mockReturnValue(NOW * 1000 + 30000);
    await service.verifyAppleCode('third');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails closed if an unknown kid remains absent or the key set contains an ambiguous duplicate', async () => {
    const first = setup(); post.mockResolvedValue(grant(token({}, { kid: 'missing' }))); get.mockResolvedValue(keysResponse());
    await expectFailure(first.service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
    const second = setup(); post.mockResolvedValue(grant());
    const response = keysResponse(); response.data.keys.push(response.data.keys[0]); get.mockResolvedValue(response);
    await expectFailure(second.service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
  });

  it('requires an exact nonce match only when trusted server context supplied one', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    post.mockResolvedValueOnce(grant(token({ nonce: 'server-nonce' }))).mockResolvedValueOnce(grant(token({ nonce: 'wrong-nonce' }))).mockResolvedValueOnce(grant());
    await expect(service.verifyAppleCode('code-1', 'server-nonce')).resolves.toMatchObject({ provider: 'apple' });
    await expectFailure(service.verifyAppleCode('code-2', 'server-nonce'), 401, 'APP_OAUTH_NONCE_INVALID');
    await expectFailure(service.verifyAppleCode('code-3', 'server-nonce'), 401, 'APP_OAUTH_NONCE_INVALID');
  });

  it('does not pretend that an unbound SDK nonce is server session binding', async () => {
    const { service } = setup(); post.mockResolvedValue(grant(token({ nonce: 'sdk-controlled-nonce' }))); get.mockResolvedValue(keysResponse());
    await expect(service.verifyAppleCode('code')).resolves.toEqual({
      provider: 'apple', appId: APP_ID, subject: 'apple-subject-1',
      appleRefreshToken: 'apple-refresh', appleAuthorizedAtMs: (NOW - 5) * 1000,
    });
  });

  it('sanitizes Apple invalid_grant and key-server/network errors', async () => {
    const { service } = setup(); post.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { error: 'invalid_grant', error_description: 'raw-code' } } });
    await expectFailure(service.verifyAppleCode('first'), 401, 'APP_OAUTH_CODE_INVALID');
    post.mockResolvedValue(grant()); get.mockRejectedValue(new Error('raw-network-details'));
    await expectFailure(service.verifyAppleCode('second'), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
  });

  it.each([undefined, null, '', 'with whitespace', {}, 'x'.repeat(4097)])('requires a usable refresh token after Apple authorization-code exchange (case %#)', async refreshToken => {
    const { service } = setup();
    post.mockResolvedValue({ data: { ...grant().data, refresh_token: refreshToken } });
    await expectFailure(service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
    expect(get).not.toHaveBeenCalled();
  });

  it('only exports provider-verified refresh material and validated authorization time for internal storage', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    post.mockResolvedValue(grant(token({ auth_time: NOW - 90, email: 'private@example.test', nonce: 'sdk-nonce' })));
    const identity = await service.verifyAppleCode('code');
    expect(identity).toEqual({ provider: 'apple', appId: APP_ID, subject: 'apple-subject-1', appleRefreshToken: 'apple-refresh', appleAuthorizedAtMs: (NOW - 90) * 1000 });
    for (const key of ['id_token', 'access_token', 'email', 'nonce']) expect(identity).not.toHaveProperty(key);
  });

  it.each([null, '123', -1, 1.5, NOW + 60, Number.MAX_SAFE_INTEGER])('rejects malformed or future auth_time before releasing refresh material: %j', async authTime => {
    const { service } = setup(); post.mockResolvedValue(grant(token({ auth_time: authTime }))); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleCode('code'), 401, 'APP_OAUTH_IDENTITY_INVALID');
  });

  it('never leaks provider refresh/identity/access material when identity validation fails', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    post.mockResolvedValue({ data: { ...grant(token({}, {}, wrongSigning.privateKey)).data, refresh_token: 'private-refresh-1', access_token: 'private-access-1' } });
    let error: any;
    try { await service.verifyAppleCode('private-code-1'); } catch (caught) { error = caught; }
    expect(error.getStatus()).toBe(401);
    for (const secret of ['private-refresh-1', 'private-access-1', 'private-code-1']) {
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(String(error.stack)).not.toContain(secret);
    }
  });

  it('revokes only the configured Apple app refresh token using the fixed endpoint and a short-lived client secret', async () => {
    const { service, redis } = setup(); post.mockResolvedValue({ status: 200, data: '' });
    await expect(service.revokeAppleToken(APP_ID, 'refresh-to-revoke')).resolves.toBeUndefined();
    const [url, encoded, options] = post.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    expect(options).toMatchObject({ timeout: 10000, maxRedirects: 0, maxContentLength: 65536, maxBodyLength: 16384, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const body = new URLSearchParams(encoded);
    expect([...body.keys()].sort()).toEqual(['client_id', 'client_secret', 'token', 'token_type_hint']);
    expect(body.get('client_id')).toBe(APP_ID);
    expect(body.get('token')).toBe('refresh-to-revoke');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    const parts = body.get('client_secret')!.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(claims).toMatchObject({ sub: APP_ID, aud: 'https://appleid.apple.com' });
    expect(claims.exp - claims.iat).toBe(300);
    expect(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: clientSigning.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))).toBe(true);
    expect(get).not.toHaveBeenCalled(); expect(redis.getLock).not.toHaveBeenCalled();
  });

  it('permits idempotent revocation retries when Apple replies 200 for an already invalid token', async () => {
    const { service } = setup(); post.mockResolvedValue({ status: 200, data: '' });
    await service.revokeAppleToken(APP_ID, 'already-revoked');
    await service.revokeAppleToken(APP_ID, 'already-revoked');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([['other.app', 'refresh'], [APP_ID, ''], [APP_ID, 'a b'], [APP_ID, 'x'.repeat(4097)]])('rejects wrong app and invalid revocation token locally (case %#)', async (appId, refreshToken) => {
    const { service } = setup();
    await expectFailure(service.revokeAppleToken(appId, refreshToken), 400, 'APPLE_REVOKE_INPUT_INVALID');
    expect(post).not.toHaveBeenCalled();
  });

  it('fails closed on missing client credentials before attempting revocation', async () => {
    const { service } = setup({ APPLE_PRIVATE_KEY: '' });
    await expectFailure(service.revokeAppleToken(APP_ID, 'refresh'), 503, 'APP_OAUTH_NOT_CONFIGURED');
    expect(post).not.toHaveBeenCalled();
  });

  it.each([400, 401, 201, 204, 302, 429, 500])('does not call non-200 revocation HTTP %i a success', async status => {
    const { service } = setup(); post.mockResolvedValue({ status, data: { error: 'invalid_client' } });
    await expectFailure(service.revokeAppleToken(APP_ID, 'refresh'), 503, 'APPLE_REVOKE_UNCONFIRMED');
  });

  it('rejects an error-bearing 200 revocation response and strips secrets from thrown transport errors', async () => {
    const { service } = setup();
    post.mockResolvedValueOnce({ status: 200, data: { error: 'invalid_client' } });
    await expectFailure(service.revokeAppleToken(APP_ID, 'refresh'), 503, 'APPLE_REVOKE_UNCONFIRMED');
    post.mockRejectedValueOnce({ message: 'private-client-secret', config: { data: 'private-refresh-token' }, response: { status: 400, data: { error: 'invalid_client', error_description: 'private-details' } } });
    let error: any;
    try { await service.revokeAppleToken(APP_ID, 'private-refresh-token'); } catch (caught) { error = caught; }
    expect(error.getStatus()).toBe(503);
    for (const secret of ['private-client-secret', 'private-refresh-token', 'private-details']) expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('validates an official notification without top-level sub or exp, without private signing credentials', async () => {
    const { service, redis } = setup({ APPLE_PRIVATE_KEY: '', APPLE_TEAM_ID: '', APPLE_KEY_ID: '' });
    get.mockResolvedValue(keysResponse());
    await expect(service.verifyAppleNotification(notification())).resolves.toEqual({
      id: 'notification-1', appId: APP_ID, subject: 'apple-subject-1', type: 'consent-revoked',
      issuedAtMs: (NOW - 5) * 1000, eventTimeMs: (NOW - 7) * 1000,
    });
    expect(post).not.toHaveBeenCalled(); expect(redis.getLock).not.toHaveBeenCalled();
  });

  it.each(['consent-revoked', 'account-deleted', 'account-delete', 'email-enabled', 'email-disabled'])('recognizes the signed Apple event %s and normalizes the legacy deletion alias', async type => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    const result = await service.verifyAppleNotification(notification({ type, email: 'relay@example.test', is_private_email: 'true' }));
    expect(result.type).toBe(type === 'account-delete' ? 'account-deleted' : type);
    expect(result).not.toHaveProperty('email'); expect(result).not.toHaveProperty('payload');
  });

  it('supports a signed JSON-string event and normalizes millisecond time without dropping subsecond precision', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    const eventTime = (NOW - 5) * 1000 + 321;
    const input = notification({}, { events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-subject-1', event_time: eventTime }), exp: NOW + 3600 });
    const result = await service.verifyAppleNotification(input);
    expect(result.eventTimeMs).toBe(eventTime);
  });

  it('does not consume repeated notifications before the lifecycle transaction can durably commit them', async () => {
    const { service, redis } = setup(); get.mockResolvedValue(keysResponse());
    const signed = notification();
    expect(await service.verifyAppleNotification(signed)).toEqual(await service.verifyAppleNotification(signed));
    expect(redis.getLock).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(1);
  });

  it('keeps genuinely late signed events available for durable ordering instead of inventing a delivery time limit', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    const issuedAt = NOW - 30 * 24 * 3600;
    const result = await service.verifyAppleNotification(notification({ event_time: issuedAt - 1 }, { iat: issuedAt }));
    expect(result.issuedAtMs).toBe(issuedAt * 1000);
  });

  it.each([
    { iss: 'https://attacker.test' }, { aud: 'other.app' }, { aud: [APP_ID] },
    { iat: undefined }, { iat: null }, { iat: String(NOW - 5) }, { iat: NOW + 3600 }, { iat: -1 }, { iat: 0 },
    { jti: undefined }, { jti: '' }, { jti: 'id with spaces' }, { jti: 'x'.repeat(192) },
    { exp: null }, { exp: NOW - 1 }, { exp: String(NOW + 3600) }, { exp: NOW - 6 },
    { nbf: NOW + 3600 }, { nbf: -1 }, { nbf: '123' }, { sub: 'another-subject' },
  ])('rejects signed notification claims outside its strict contract (case %#)', async claims => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleNotification(notification({}, claims)), 401, 'APPLE_NOTIFICATION_INVALID');
  });

  it.each([
    { type: 'consent-restored' }, { type: 'ACCOUNT-DELETED' }, { type: null }, { sub: '' }, { sub: 12 }, { sub: 'x'.repeat(192) },
    { event_time: undefined }, { event_time: null }, { event_time: '1234' }, { event_time: -1 }, { event_time: 1.5 },
    { event_time: NOW + 3600 }, { event_time: (NOW + 3600) * 1000 }, { event_time: NOW - 1 }, { event_time: Number.MAX_SAFE_INTEGER },
  ])('rejects signed malformed event or time after issuance (case %#)', async event => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleNotification(notification(event)), 401, 'APPLE_NOTIFICATION_INVALID');
  });

  it.each([null, undefined, [], [{}], true, 123, '', 'not-json', 'null', '[]', '"nested-string"'])('rejects missing or unsupported signed events representation (case %#)', async events => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleNotification(notification({}, { events })), 401, 'APPLE_NOTIFICATION_INVALID');
  });

  it.each([{ alg: 'none' }, { alg: 'HS256' }, { kid: '' }, { crit: ['events'] }, { b64: false }])('refuses unsafe notification JWT headers before fetching keys (case %#)', async header => {
    const { service } = setup();
    await expectFailure(service.verifyAppleNotification(notification({}, {}, header)), 401, 'APPLE_NOTIFICATION_INVALID');
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects forged and tampered notifications using real RSA verification without leaking the signed payload', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    const forged = notification({ sub: 'private-subject' }, {}, {}, wrongSigning.privateKey);
    let error: any;
    try { await service.verifyAppleNotification(forged); } catch (caught) { error = caught; }
    expect(error.getStatus()).toBe(401);
    expect(JSON.stringify(error)).not.toContain(forged);
    expect(JSON.stringify(error)).not.toContain('private-subject');
    const parts = notification().split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); claims.events.sub = 'attacker-subject';
    parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    await expectFailure(service.verifyAppleNotification(parts.join('.')), 401, 'APPLE_NOTIFICATION_INVALID');
  });

  it('does not treat a valid Apple ID token as a server event or accept an unverified outer body', async () => {
    const { service } = setup(); get.mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleNotification(token()), 401, 'APPLE_NOTIFICATION_INVALID');
    await expectFailure(service.verifyAppleNotification({ payload: notification() }), 401, 'APPLE_NOTIFICATION_INVALID');
    await expectFailure(service.verifyAppleNotification('x'.repeat(16385)), 401, 'APPLE_NOTIFICATION_INVALID');
  });

  it('uses only the fixed JWK endpoint for notifications and supports official signing-key rotation', async () => {
    const { service } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    get.mockResolvedValueOnce(keysResponse()).mockResolvedValueOnce(keysResponse('rotated', wrongSigning.publicKey));
    await service.verifyAppleNotification(notification({}, {}, { jku: 'http://127.0.0.1/keys', x5u: 'https://attacker.test' }));
    await expectFailure(service.verifyAppleNotification(notification({}, { jti: 'next' }, { kid: 'rotated' }, wrongSigning.privateKey)), 401, 'APPLE_NOTIFICATION_INVALID');
    expect(get).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(NOW * 1000 + 30000);
    await service.verifyAppleNotification(notification({}, { jti: 'next' }, { kid: 'rotated' }, wrongSigning.privateKey));
    expect(get.mock.calls.map((call) => call[0])).toEqual(['https://appleid.apple.com/auth/keys', 'https://appleid.apple.com/auth/keys']);
  });

  it('bounds sequential and concurrent unknown-kid floods while retaining valid fresh-key verification', async () => {
    const { service } = setup();
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    get.mockResolvedValue(keysResponse());
    await service.verifyAppleNotification(notification());
    for (let index = 0; index < 8; index += 1) {
      await expectFailure(service.verifyAppleNotification(notification({}, {}, { kid: `missing-sequential-${index}` })), 401, 'APPLE_NOTIFICATION_INVALID');
    }
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      expectFailure(service.verifyAppleNotification(notification({}, {}, { kid: `missing-concurrent-${index}` })), 401, 'APPLE_NOTIFICATION_INVALID')));
    await expect(service.verifyAppleNotification(notification())).resolves.toMatchObject({ subject: 'apple-subject-1' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight cold fetch across unknown keys, then blocks further refresh attempts', async () => {
    const { service } = setup();
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    let release!: (value: ReturnType<typeof keysResponse>) => void;
    get.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const attempts = Array.from({ length: 12 }, (_, index) =>
      expectFailure(service.verifyAppleNotification(notification({}, {}, { kid: `cold-missing-${index}` })), 401, 'APPLE_NOTIFICATION_INVALID'));
    expect(get).toHaveBeenCalledTimes(1);
    release(keysResponse());
    await Promise.all(attempts);
    await expectFailure(service.verifyAppleNotification(notification({}, {}, { kid: 'still-missing' })), 401, 'APPLE_NOTIFICATION_INVALID');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('applies refresh cooldown after failed requests and retries only when it has elapsed', async () => {
    const { service } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    get.mockRejectedValueOnce(new Error('synthetic-provider-secret')).mockResolvedValue(keysResponse());
    await expectFailure(service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      expectFailure(service.verifyAppleNotification(notification({}, {}, { kid: `failed-missing-${index}` })), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE')));
    clock.mockReturnValue(NOW * 1000 + 29999);
    await expectFailure(service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
    expect(get).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(NOW * 1000 + 30000);
    await expect(service.verifyAppleNotification(notification())).resolves.toMatchObject({ subject: 'apple-subject-1' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('never accepts an expired cached key after refresh failure or during its cooldown', async () => {
    const { service } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    get.mockResolvedValueOnce(keysResponse()).mockRejectedValueOnce(new Error('synthetic-key-outage')).mockResolvedValue(keysResponse());
    await service.verifyAppleNotification(notification());
    clock.mockReturnValue(NOW * 1000 + 3600000);
    await expectFailure(service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
    clock.mockReturnValue(NOW * 1000 + 3629999);
    await expectFailure(service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
    expect(get).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(NOW * 1000 + 3630000);
    await expect(service.verifyAppleNotification(notification())).resolves.toMatchObject({ subject: 'apple-subject-1' });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('retains retryable service failures for key-server outages and refuses unconfigured notification audiences', async () => {
    const { service } = setup(); get.mockRejectedValue(new Error('provider-secret-debug'));
    await expectFailure(service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_PROVIDER_UNAVAILABLE');
    const disabled = setup({ APPLE_APP_CLIENT_ID: '' });
    get.mockClear();
    await expectFailure(disabled.service.verifyAppleNotification(notification()), 503, 'APP_OAUTH_NOT_CONFIGURED');
    expect(get).not.toHaveBeenCalled();
  });
});
