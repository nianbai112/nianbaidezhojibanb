// Only run through scripts/test-uniappx-isolated.cjs. No external OAuth, Redis or project .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const databaseUrl = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(databaseUrl.protocol, 'postgresql:');
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.equal(databaseUrl.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(databaseUrl.pathname, /^\/student_identity_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { resolveLoginIdentity, loginIdentityKey } = require('../src/modules/auth/app-identity.ts');
const { agreementContentHash } = require('../src/common/agreement-consent.ts');
const { AuthService } = require('../src/modules/auth/auth.service.ts');
const { AppleLifecycleService } = require('../src/modules/auth/apple-lifecycle.service.ts');
const { AuthController } = require('../src/modules/auth/auth.controller.ts');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
const scope = 'isolated-open-platform';
const appIdentity = (label, extra = {}) => ({ provider: 'app-weixin', appId: 'isolated-wechat-app', subject: `app-${label}`, ...extra });
const miniIdentity = (label, extra = {}) => ({ provider: 'mp-weixin', appId: 'isolated-mini-app', subject: `mini-${label}`, ...extra });
const resolve = (identity) => resolveLoginIdentity(db, identity);
const rejectsConflict = (task) => assert.rejects(task, (error) => error.getResponse?.().code === 'ACCOUNT_IDENTITY_CONFLICT');
const count = async () => ({ users: await db.user.count(), identities: await db.userAuthIdentity.count() });
let checks = 0;
async function check(label, task) { await task(); checks++; console.log('PASS', label); }

async function main() {
  const [actual] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(actual.name, databaseUrl.pathname.slice(1));
  assert.equal(actual.host, '127.0.0.1'); assert.equal(String(actual.port), databaseUrl.port);

  await check('concurrent first logins create exactly one account and one channel identity', async () => {
    const identity = appIdentity('concurrent');
    const users = await Promise.all(Array.from({ length: 6 }, () => resolve(identity)));
    assert.equal(new Set(users.map((user) => user.id)).size, 1);
    const key = loginIdentityKey(identity.provider, identity.appId, identity.subject);
    assert.equal(await db.user.count({ where: { openid: `app_login_${key}` } }), 1);
    assert.equal(await db.userAuthIdentity.count({ where: { identityKey: key } }), 1);
    assert.equal(await db.userProfile.count({ where: { userId: users[0].id } }), 1);
    assert.equal(await db.userSettings.count({ where: { userId: users[0].id } }), 1);
  });

  await check('simultaneous mini-program and App creation share the union owner and real mini OpenID', async () => {
    const shared = { unionId: 'union-concurrent', unionScope: scope };
    const users = await Promise.all([resolve(appIdentity('both', shared)), resolve(miniIdentity('both', shared))]);
    assert.equal(users[0].id, users[1].id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users[0].id } })).openid, 'mini-both');
    const identities = await db.userAuthIdentity.findMany({ where: { userId: users[0].id } });
    assert.deepEqual(identities.map((row) => row.provider).sort(), ['app-weixin', 'mp-weixin', 'wechat-union']);
  });

  await check('App-first then mini login replaces only the placeholder and preserves the account wallet', async () => {
    const shared = { unionId: 'union-app-first', unionScope: scope };
    const app = await resolve(appIdentity('first', shared));
    assert.ok(app.openid.startsWith('app_login_'));
    await db.wallet.create({ data: { userId: app.id, balance: 12.34 } });
    const mini = await resolve(miniIdentity('after-app', shared));
    assert.equal(mini.id, app.id); assert.equal(mini.openid, 'mini-after-app');
    assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId: app.id } })).balance), 12.34);
    assert.equal((await resolve(appIdentity('first', shared))).openid, 'mini-after-app');
  });

  await check('a unique legacy mini account is linked by verified union without replacing its OpenID', async () => {
    const legacy = await db.user.create({ data: { openid: 'mini-legacy-app', unionid: 'union-legacy-app' } });
    const app = await resolve(appIdentity('legacy', { unionId: legacy.unionid, unionScope: scope }));
    assert.equal(app.id, legacy.id); assert.equal(app.openid, legacy.openid);
  });

  await check('duplicate legacy union IDs reject rather than selecting the first user or creating another', async () => {
    await db.user.createMany({ data: [{ openid: 'mini-duplicate-a', unionid: 'union-duplicate' }, { openid: 'mini-duplicate-b', unionid: 'union-duplicate' }] });
    const before = await count();
    await rejectsConflict(() => resolve(appIdentity('duplicate', { unionId: 'union-duplicate', unionScope: scope })));
    assert.deepEqual(await count(), before);
  });

  await check('conflicting channel and union ownership fails without reassignment or user merge', async () => {
    const channel = appIdentity('channel-conflict');
    const first = await resolve(channel);
    await db.user.create({ data: { openid: 'mini-conflicting-union', unionid: 'union-conflicting-owner' } });
    const before = await count();
    await rejectsConflict(() => resolve({ ...channel, unionId: 'union-conflicting-owner', unionScope: scope }));
    assert.deepEqual(await count(), before);
    assert.equal((await resolve(channel)).id, first.id);
  });

  await check('Apple subjects never merge with WeChat, even when subject, app ID and supplied union match', async () => {
    const wechat = appIdentity('same-subject', { unionId: 'union-no-apple', unionScope: scope });
    const first = await resolve(wechat);
    const apple = await resolve({ ...wechat, provider: 'app-apple' });
    assert.notEqual(apple.id, first.id); assert.equal(apple.unionid, null);
    assert.equal(await db.userAuthIdentity.count({ where: { userId: apple.id, provider: 'wechat-union' } }), 0);
  });

  await check('identity hash preserves provider subject case rather than relying on DB collation', async () => {
    const upper = await resolve(appIdentity('CaseSensitive'));
    const lower = await resolve(appIdentity('casesensitive'));
    assert.notEqual(upper.id, lower.id);
    assert.notEqual(loginIdentityKey('app-weixin', 'app', 'Subject'), loginIdentityKey('app-weixin', 'app', 'subject'));
  });

  await check('without configured union scope an App login does not claim an existing mini account', async () => {
    const mini = await db.user.create({ data: { openid: 'mini-unscoped', unionid: 'union-unscoped' } });
    const app = await resolve(appIdentity('unscoped', { unionId: mini.unionid }));
    assert.notEqual(app.id, mini.id); assert.equal(app.unionid, null);
    assert.equal(await db.userAuthIdentity.count({ where: { userId: app.id, provider: 'wechat-union' } }), 0);
  });

  await check('verified mini phone login upgrades a phone-only account without creating a duplicate', async () => {
    const phone = await db.user.create({ data: { openid: 'phone_login_isolated', phone: '13800009001' } });
    const mini = await resolve(miniIdentity('phone-upgrade', { verifiedPhone: phone.phone, unionId: 'union-phone-upgrade', unionScope: scope }));
    assert.equal(mini.id, phone.id); assert.equal(mini.openid, 'mini-phone-upgrade');
    assert.equal(mini.phone, phone.phone);
  });

  await check('ambiguous verified phones or another real mini identity are never merged', async () => {
    await db.user.createMany({ data: [{ openid: 'phone_login_duplicate-a', phone: '13800009002' }, { openid: 'phone_login_duplicate-b', phone: '13800009002' }] });
    let before = await count();
    await rejectsConflict(() => resolve(miniIdentity('phone-conflict', { verifiedPhone: '13800009002' })));
    assert.deepEqual(await count(), before);
    await db.user.create({ data: { openid: 'mini-original-phone-owner', phone: '13800009003' } });
    before = await count();
    await rejectsConflict(() => resolve(miniIdentity('other-phone-owner', { verifiedPhone: '13800009003' })));
    assert.deepEqual(await count(), before);
  });

  await check('App identities cannot use a verifiedPhone field to claim any phone account', async () => {
    const before = await count();
    await assert.rejects(() => resolve(appIdentity('untrusted-phone', { verifiedPhone: '13800009001' })), /手机号绑定来源/);
    assert.deepEqual(await count(), before);
  });

  await check('deleted and inactive known identities are refused, with no replacement accounts', async () => {
    for (const status of ['DELETED', 'INACTIVE']) {
      const identity = appIdentity('disabled-' + status);
      const user = await resolve(identity);
      await db.user.update({ where: { id: user.id }, data: { status } });
      const before = await count();
      await assert.rejects(() => resolve(identity), (error) => error.getStatus?.() === 401);
      assert.deepEqual(await count(), before);
    }
  });

  await check('a second mini OpenID for a union cannot replace an already bound real mini OpenID', async () => {
    const shared = { unionId: 'union-mini-conflict', unionScope: scope };
    const owner = await resolve(miniIdentity('original', shared));
    const before = await count();
    await rejectsConflict(() => resolve(miniIdentity('replacement', shared)));
    assert.deepEqual(await count(), before);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).openid, 'mini-original');
  });

  await httpContracts();
  console.log(JSON.stringify({ result: 'passed', checks, database: 'fresh-disposable-postgresql', realExternalCalls: 0, productionDataUsed: false }));
}

async function httpContracts() {
  const { Test } = require('@nestjs/testing');
  const { JwtService } = require('@nestjs/jwt');
  const request = require('supertest');
  const axios = require('axios').default;
  const { JwtGuard } = require('../src/guards/jwt.guard.ts');
  const { AdminGuard } = require('../src/guards/admin.guard.ts');
  const { TransformInterceptor } = require('../src/interceptors/transform.interceptor.ts');
  const { AllExceptionsFilter } = require('../src/filters/all-exceptions.filter.ts');
  const { miniProgramApiCompatMiddleware, getMiniProgramGlobalPrefixExcludes } = require('../src/common/middleware/mini-program-api-compat.ts');
  const region = await db.region.create({ data: { name: 'App 登录测试校园', code: 'isolated-app-login' } });
  const document = (type) => db.richTextContent.create({ data: { type, regionId: region.id,
    title: `App测试${type}`, content: '<p>供隔离测试使用的已发布协议</p>', version: 'app-test-v1',
    isRequired: true, isShow: true, publishedAt: new Date(Date.now() - 1000) } });
  const docs = await Promise.all(['TERMS_OF_SERVICE', 'PRIVACY_POLICY'].map(document));
  const proofs = docs.map((doc) => ({ type: doc.type, document_id: doc.id, version: doc.version, content_hash: agreementContentHash(doc), region_id: region.id }));
  const secret = 'isolated-app-login-test-secret-never-used-outside-this-process';
  const settings = { NODE_ENV: 'test', JWT_SECRET: secret, JWT_ACCESS_EXPIRES_IN: '2h', JWT_REFRESH_EXPIRES_IN: '7d', WX_OPEN_PLATFORM_ACCOUNT_ID: scope,
    APPLE_TOKEN_ENCRYPTION_KEY_ID: 'test-only', APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'test-only': require('node:crypto').randomBytes(32).toString('base64') }) };
  const jwt = new JwtService({ secret });
  let signed = 0, verified = 0, onVerify = null;
  const sign = jwt.sign.bind(jwt);
  jwt.sign = (...args) => { signed++; return sign(...args); };
  const cache = new Map();
  const redis = { set: async (key, value) => { cache.set(key, value); }, get: async (key) => cache.get(key),
    del: async (key) => { cache.delete(key); }, delPattern: async () => 0 };
  const verifiedIdentities = new Map();
  const verify = async (code, provider) => {
    verified++;
    const identity = verifiedIdentities.get(code);
    assert.ok(identity, 'only explicitly prepared synthetic authorization codes are accepted');
    assert.equal(identity.provider, provider);
    if (onVerify) await onVerify();
    return identity;
  };
  const oauth = { verifyWechatCode: (code) => verify(code, 'wechat'), verifyAppleCode: (code) => verify(code, 'apple') };
  const config = { get: (key) => settings[key] };
  const lifecycle = new AppleLifecycleService(db, config, oauth, { revoke: async () => {} });
  const auth = new AuthService(db, jwt, config, redis, { resolve: async () => null }, oauth, lifecycle);
  auth.getMiniappCredentials = async () => ({ appid: 'isolated-mini-app', secret: 'synthetic-mini-secret' });
  const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: AuthService, useValue: auth }] })
    .overrideGuard(JwtGuard).useValue({ canActivate: () => false })
    .overrideGuard(AdminGuard).useValue({ canActivate: () => false }).compile();
  const app = module.createNestApplication({ logger: false });
  app.use(miniProgramApiCompatMiddleware);
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter({ error: () => {} }, db));
  app.setGlobalPrefix('/api/v1', { exclude: [...getMiniProgramGlobalPrefixExcludes(), 'api/{*path}'] });
  const originalGet = axios.get;
  const body = (code, extra = {}) => ({ channel: 'app-weixin', code, region_id: region.id, agreement_consents: proofs, ...extra });
  try {
    await app.listen(0, '127.0.0.1');
    process.env.UNIAPPX_TEST_HTTP_PORT = String(app.getHttpServer().address().port);
    const http = request(`http://127.0.0.1:${process.env.UNIAPPX_TEST_HTTP_PORT}`);
    const login = (dto) => http.post('/api/wx-auth/app-login').send(dto);

    await check('real App login HTTP requires complete current proofs before OAuth, DB account creation or JWT issuance', async () => {
      const before = await count(), beforeSigned = signed, beforeVerified = verified;
      for (const channel of ['app-weixin', 'app-apple']) {
        for (const invalid of [undefined, null, [], [proofs[0]], [proofs[0], proofs[0]], proofs.map((proof) => ({ ...proof, content_hash: '' }))]) {
          const response = await login(body('unused-code', { channel, agreement_consents: invalid })).expect(400);
          assert.equal(response.body.code, 400); assert.equal(response.body.error_code, 'AGREEMENT_PROOF_REQUIRED');
          assert.equal(response.body.token, undefined);
        }
      }
      for (const invalid of [proofs.map((proof) => ({ ...proof, version: 'stale' })), proofs.map((proof) => ({ ...proof, content_hash: '0'.repeat(64) }))]) {
        const response = await login(body('unused-code', { agreement_consents: invalid })).expect(409);
        assert.equal(response.body.error_code, 'AGREEMENT_UPDATED');
      }
      assert.deepEqual(await count(), before); assert.equal(signed, beforeSigned); assert.equal(verified, beforeVerified);
    });

    await check('App HTTP ignores client OpenID, union, app ID, email and identityToken and returns the server-owned identity', async () => {
      const identity = { provider: 'wechat', appId: 'isolated-wechat-app', subject: 'verified-http-wechat', unionId: 'verified-http-union' };
      verifiedIdentities.set('http-wechat-code', identity);
      const victim = await db.user.create({ data: { openid: 'client-forged-openid', unionid: 'client-forged-union' } });
      const response = await login(body('http-wechat-code', { openid: victim.openid, unionid: victim.unionid,
        appId: 'client-forged-app', userId: victim.id, email: 'untrusted@example.invalid', identityToken: 'untrusted-token' })).expect(201);
      const user = response.body;
      assert.notEqual(user.id, victim.id); assert.equal(user.login_channel, 'app-weixin');
      assert.equal(user.wx_bound, false); assert.equal(user.phone_bound, false);
      assert.equal(user.student_verified, false); assert.equal(user.student_verification_status, 'none');
      assert.equal(user.status, 'ACTIVE'); assert.ok(user.public_uid > 0);
      assert.equal(user.token, user.accessToken); assert.equal(user.expiresIn, 7200);
      const claims = jwt.verify(user.token);
      assert.equal(claims.sub, user.id); assert.equal(claims.restricted, false);
      const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(saved.openid, `app_login_${loginIdentityKey('app-weixin', identity.appId, identity.subject)}`);
      assert.equal(saved.unionid, identity.unionId);
      assert.equal(await db.userAgreementConsent.count({ where: { userId: user.id, scene: 'login', source: 'app-weixin-login' } }), 2);
      assert.ok(!JSON.stringify(user).includes('untrusted-token')); assert.ok(!JSON.stringify(user).includes('untrusted@example.invalid'));
      assert.ok(![...cache.keys()].some((key) => key === `session_key:${user.id}`));
      const repeated = await login(body('http-wechat-code')).expect(201);
      assert.equal(repeated.body.id, user.id);
    });

    await check('real mini login after App joins the same account and App never overwrites the verified mini OpenID', async () => {
      axios.get = async () => ({ data: { openid: 'verified-http-mini', unionid: 'verified-http-union', session_key: 'synthetic-mini-session' } });
      const mini = await http.post('/api/wx-auth/wx-mini-login').send({ code: 'http-mini-code', region_id: region.id }).expect(201);
      const again = await login(body('http-wechat-code')).expect(201);
      assert.equal(again.body.id, mini.body.id); assert.equal(again.body.wx_bound, true);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: mini.body.id } })).openid, 'verified-http-mini');
      assert.equal(cache.get(`session_key:${mini.body.id}`), 'synthetic-mini-session');
    });

    await check('Apple HTTP remains independent even when the client claims a known WeChat account or email', async () => {
      verifiedIdentities.set('http-apple-code', { provider: 'apple', appId: 'isolated-apple-app', subject: 'verified-http-apple', appleRefreshToken: 'synthetic-apple-refresh', appleAuthorizedAtMs: Date.now() - 1000 });
      const response = await login(body('http-apple-code', { channel: 'app-apple', openid: 'verified-http-mini',
        unionid: 'verified-http-union', email: 'same@example.invalid', identityToken: 'client-jwt-must-be-ignored' })).expect(201);
      const mini = await db.user.findUniqueOrThrow({ where: { openid: 'verified-http-mini' } });
      assert.notEqual(response.body.id, mini.id); assert.equal(response.body.login_channel, 'app-apple');
      assert.equal(response.body.wx_bound, false); assert.equal(jwt.verify(response.body.token).sub, response.body.id);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: response.body.id } })).unionid, null);
    });

    await check('an identity token without an authorization code and a closed region are rejected before OAuth', async () => {
      const before = verified;
      const invalid = await login(body('', { channel: 'app-apple', identityToken: 'arbitrary-client-token' })).expect(400);
      assert.equal(invalid.body.error_code, 'APP_LOGIN_INVALID');
      const closed = await db.region.create({ data: { name: '关闭测试校园', code: 'closed-isolated-app', isOpen: false } });
      await login(body('unused-code', { region_id: closed.id })).expect(400);
      assert.equal(verified, before);
    });

    await check('turning off the configured shared scope disables App-to-legacy union linking through HTTP', async () => {
      const legacy = await db.user.create({ data: { openid: 'mini-http-scope-off', unionid: 'http-scope-off' } });
      verifiedIdentities.set('scope-off-code', { provider: 'wechat', appId: 'isolated-wechat-app', subject: 'http-scope-off-subject', unionId: legacy.unionid });
      settings.WX_OPEN_PLATFORM_ACCOUNT_ID = '';
      try {
        const response = await login(body('scope-off-code')).expect(201);
        assert.notEqual(response.body.id, legacy.id);
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: response.body.id } })).unionid, null);
      } finally { settings.WX_OPEN_PLATFORM_ACCOUNT_ID = scope; }
    });

    await check('a policy changing during OAuth produces no JWT or partial consent rows', async () => {
      verifiedIdentities.set('policy-race-code', { provider: 'wechat', appId: 'isolated-wechat-app', subject: 'http-policy-race' });
      onVerify = () => db.richTextContent.update({ where: { id: docs[1].id }, data: { content: '<p>授权期间修改的正文</p>' } });
      const before = signed;
      try {
        const response = await login(body('policy-race-code')).expect(409);
        assert.equal(response.body.error_code, 'AGREEMENT_UPDATED'); assert.equal(signed, before);
        const identity = await db.userAuthIdentity.findUniqueOrThrow({ where: { identityKey: loginIdentityKey('app-weixin', 'isolated-wechat-app', 'http-policy-race') } });
        assert.equal(await db.userAgreementConsent.count({ where: { userId: identity.userId } }), 0);
      } finally {
        onVerify = null;
        await db.richTextContent.update({ where: { id: docs[1].id }, data: { content: docs[1].content } });
      }
    });

    await check('deleted and disabled App accounts fail HTTP login without new accounts or tokens', async () => {
      for (const status of ['DELETED', 'INACTIVE']) {
        const identity = appIdentity('http-blocked-' + status);
        const user = await resolve(identity);
        await db.user.update({ where: { id: user.id }, data: { status } });
        verifiedIdentities.set('http-blocked-' + status, { provider: 'wechat', appId: identity.appId, subject: identity.subject });
        const before = await count(), beforeSigned = signed;
        await login(body('http-blocked-' + status)).expect(401);
        assert.deepEqual(await count(), before); assert.equal(signed, beforeSigned);
      }
    });

    await check('a banned App account retains its own restricted session instead of creating a clean account', async () => {
      const identity = appIdentity('http-banned');
      const user = await resolve(identity);
      await db.user.update({ where: { id: user.id }, data: { status: 'BANNED' } });
      verifiedIdentities.set('http-banned-code', { provider: 'wechat', appId: identity.appId, subject: identity.subject });
      const response = await login(body('http-banned-code')).expect(201);
      assert.equal(response.body.id, user.id); assert.equal(response.body.status, 'BANNED');
      assert.equal(jwt.verify(response.body.token).restricted, true);
    });
  } finally {
    axios.get = originalGet;
    delete process.env.UNIAPPX_TEST_HTTP_PORT;
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
