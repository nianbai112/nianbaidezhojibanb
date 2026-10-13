// Only run through scripts/test-uniappx-isolated.cjs: real temporary DB, no real WeChat/JWT/Redis.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/student_identity_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { recordAgreementConsents, agreementContentHash, findPublishedAgreement } = require('../src/common/agreement-consent.ts');
const { OperationService } = require('../src/modules/operation/operation.service.ts');
const { AuthService } = require('../src/modules/auth/auth.service.ts');
const { UserService } = require('../src/modules/user/user.service.ts');
const { InteractionPermissionService } = require('../src/common/services/interaction-permission.service.ts');
const axios = require('axios').default;
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const operation = new OperationService(db, {}, {}, {}, {}, {});
let checks = 0;
async function check(label, task) { await task(); checks += 1; console.log('PASS', label); }
const rejects = (task, code) => assert.rejects(task, (error) => error.getResponse?.().code === code);
const consentCount = (userId) => db.userAgreementConsent.count({ where: { userId } });
const proof = (document, regionId) => ({ type: document.type, document_id: document.id, version: document.version,
  content_hash: agreementContentHash(document), region_id: regionId });
const createUser = (id) => db.user.create({ data: { openid: `uniappx-${id}`, nickname: `测试-${id}` } });
const createDocument = (type, extra = {}) => db.richTextContent.create({ data: {
  type, title: `测试-${type}`, content: '<p>明确发布的合成测试协议</p>', version: '2026.9',
  scene: 'login', isRequired: true, isShow: true, publishedAt: new Date(Date.now() - 1000), ...extra,
} });

async function main() {
  const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(identity.name, url.pathname.slice(1)); assert.equal(identity.host, '127.0.0.1'); assert.equal(String(identity.port), url.port);
  const regionA = await db.region.create({ data: { name: '协议测试A', code: 'uniappx-agreement-a' } });
  const regionB = await db.region.create({ data: { name: '协议测试B', code: 'uniappx-agreement-b' } });
  const user = await createUser('agreement');
  const globalTerms = await createDocument('TERMS_OF_SERVICE');
  const globalPrivacy = await createDocument('PRIVACY_POLICY');
  const localTerms = await createDocument('TERMS_OF_SERVICE', { regionId: regionA.id, version: '2026.10' });
  await createDocument('TERMS_OF_SERVICE', { regionId: regionA.id, version: 'hidden', isShow: false });
  await createDocument('TERMS_OF_SERVICE', { regionId: regionA.id, version: 'future', publishedAt: new Date(Date.now() + 86400000) });
  const terms = proof(localTerms, regionA.id), privacy = proof(globalPrivacy, regionA.id);
  const options = { regionId: regionA.id, scene: 'login', source: 'uniappx-isolated', requireContentHash: true };

  await check('published documents prefer exact region, ignore hidden/future documents and fall back globally', async () => {
    assert.equal((await findPublishedAgreement(db, 'user', regionA.id)).id, localTerms.id);
    assert.equal((await findPublishedAgreement(db, 'TERMS_OF_SERVICE', regionB.id)).id, globalTerms.id);
    const response = await operation.getAgreementDocument('privacy', { region_id: regionA.id });
    assert.equal(response.data.id, globalPrivacy.id);
    assert.equal(response.data.content_hash, agreementContentHash(globalPrivacy));
  });
  await check('missing or forged proof never creates consent', async () => {
    await rejects(() => recordAgreementConsents(db, user.id, [{ type: 'PRIVACY_POLICY' }], options), 'AGREEMENT_PROOF_REQUIRED');
    await rejects(() => recordAgreementConsents(db, user.id, [{ ...terms, document_id: 'forged-document' }], options), 'AGREEMENT_UPDATED');
    await rejects(() => recordAgreementConsents(db, user.id, [{ ...terms, version: '1.0.0' }], options), 'AGREEMENT_UPDATED');
    await rejects(() => recordAgreementConsents(db, user.id, [{ ...terms, region_id: regionB.id }], options), 'AGREEMENT_SCOPE_MISMATCH');
    await rejects(() => recordAgreementConsents(db, user.id, [{ ...terms, content_hash: undefined }], options), 'AGREEMENT_PROOF_REQUIRED');
    assert.equal(await consentCount(user.id), 0);
  });
  await check('two valid proofs record exact document/version and requested region', async () => {
    const saved = await recordAgreementConsents(db, user.id, [terms, privacy], options);
    assert.equal(saved.length, 2);
    assert.deepEqual(saved.map((row) => row.documentId), [localTerms.id, globalPrivacy.id]);
    assert.deepEqual(saved.map((row) => row.version), ['2026.10', '2026.9']);
    assert.ok(saved.every((row) => row.regionId === regionA.id && row.scene === 'login' && row.source === 'uniappx-isolated'));
  });
  await check('concurrent duplicate confirmations stay at one row per user/type/version/region', async () => {
    await Promise.all([0, 1, 2].map(() => recordAgreementConsents(db, user.id, [terms, privacy], options)));
    assert.equal(await consentCount(user.id), 2);
  });
  await check('a changed body with the same version rejects the old content hash', async () => {
    const before = await db.userAgreementConsent.findMany({ where: { userId: user.id }, orderBy: { code: 'asc' } });
    await db.richTextContent.update({ where: { id: localTerms.id }, data: { content: '<p>同版本但已修改的正文</p>' } });
    await rejects(() => recordAgreementConsents(db, user.id, [terms, privacy], options), 'AGREEMENT_UPDATED');
    assert.deepEqual(await db.userAgreementConsent.findMany({ where: { userId: user.id }, orderBy: { code: 'asc' } }), before);
    await db.richTextContent.update({ where: { id: localTerms.id }, data: { content: localTerms.content } });
  });
  await check('invalid second proof leaves no partial consent rows', async () => {
    const other = await createUser('atomic');
    await rejects(() => recordAgreementConsents(db, other.id, [terms, { ...privacy, version: 'stale' }], options), 'AGREEMENT_UPDATED');
    assert.equal(await consentCount(other.id), 0);
  });
  await check('unpublished documents and unreadable content cannot be confirmed', async () => {
    await db.richTextContent.update({ where: { id: globalPrivacy.id }, data: { isShow: false } });
    await rejects(() => recordAgreementConsents(db, user.id, [privacy], options), 'AGREEMENT_UNAVAILABLE');
    await db.richTextContent.update({ where: { id: globalPrivacy.id }, data: { isShow: true, content: '<script>hidden()</script>&nbsp;' } });
    await rejects(() => recordAgreementConsents(db, user.id, [privacy], options), 'AGREEMENT_UNAVAILABLE');
    await db.richTextContent.update({ where: { id: globalPrivacy.id }, data: { content: globalPrivacy.content } });
  });
  await check('global fallback is saved under the requesting region and explicit manual confirmation uses the same rules', async () => {
    const fallback = await createUser('fallback');
    const response = await operation.acceptAgreement(fallback.id, { ...proof(globalTerms, regionB.id), scene: 'manual', source: 'uniappx-isolated' });
    assert.equal(response.success, true);
    const [row] = await db.userAgreementConsent.findMany({ where: { userId: fallback.id } });
    assert.equal(row.documentId, globalTerms.id); assert.equal(row.regionId, regionB.id);
    await rejects(() => operation.acceptAgreement(fallback.id, { type: 'privacy', region_id: regionB.id }), 'AGREEMENT_PROOF_REQUIRED');
  });

  let signed = 0, cached = 0;
  const auth = new AuthService(db,
    { sign: () => { signed += 1; return `test-only-jwt-${signed}`; } },
    { get: (key) => ({ NODE_ENV: 'test', JWT_ACCESS_EXPIRES_IN: '2h', JWT_REFRESH_EXPIRES_IN: '7d' })[key] },
    { set: async () => { cached += 1; }, get: async () => null, del: async () => {}, delPattern: async () => 0 },
    { resolve: async () => null });
  const loginUser = await createUser('login');
  auth.getMiniappCredentials = async () => ({ appid: 'synthetic-app', secret: 'synthetic-secret' });
  const originalGet = axios.get;
  axios.get = async () => ({ data: { openid: loginUser.openid, session_key: 'synthetic-session-key' } });
  try {
    await check('legacy and silent login without explicit proofs do not fabricate acceptance', async () => {
      await auth.recordLoginAgreementConsent(loginUser.id, regionA.id);
      const response = await auth.wxMiniLogin({ code: 'synthetic-code', region_id: regionA.id });
      assert.ok(response.token); assert.equal(await consentCount(loginUser.id), 0);
      assert.equal((await db.userProfile.findUniqueOrThrow({ where: { userId: loginUser.id } })).regionId, regionA.id);
    });
    await check('incomplete proof arrays and missing body hashes do not issue any new tokens', async () => {
      for (const agreement_consents of [null, [], [terms], [terms, terms], [{ ...terms, content_hash: undefined }, privacy]]) {
        const tokensBefore = signed, cacheBefore = cached;
        await rejects(() => auth.wxMiniLogin({ code: 'synthetic-code', region_id: regionA.id, agreement_consents }), 'AGREEMENT_PROOF_REQUIRED');
        assert.equal(signed, tokensBefore); assert.equal(cached, cacheBefore);
      }
      assert.equal(await consentCount(loginUser.id), 0);
    });
    await check('a stale login agreement prevents JWT generation and both consent writes', async () => {
      const tokensBefore = signed, cacheBefore = cached;
      await rejects(() => auth.wxMiniLogin({ code: 'synthetic-code', region_id: regionA.id,
        agreement_consents: [terms, { ...privacy, version: 'stale' }] }), 'AGREEMENT_UPDATED');
      assert.equal(signed, tokensBefore); assert.equal(cached, cacheBefore); assert.equal(await consentCount(loginUser.id), 0);
    });
    await check('explicit current login proofs are recorded before returning a session', async () => {
      const response = await auth.wxMiniLogin({ code: 'synthetic-code', region_id: regionA.id, agreement_consents: [terms, privacy] });
      assert.ok(response.token); assert.equal(await consentCount(loginUser.id), 2);
      const rows = await db.userAgreementConsent.findMany({ where: { userId: loginUser.id } });
      assert.ok(rows.every((row) => row.scene === 'login' && row.source === 'miniapp-login'));
    });
  } finally { axios.get = originalGet; }

  await check('guidance config, cached self profile, save and re-entry preserve real fields and selected tags', async () => {
    const profileUser = await createUser('guidance');
    const cache = new Map(), invalidated = [];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const redis = {
      getJson: async (key) => cache.has(key) ? clone(cache.get(key)) : null,
      setJson: async (key, value) => { cache.set(key, clone(value)); },
      delPattern: async (pattern) => {
        invalidated.push(pattern);
        for (const key of cache.keys()) if (key.startsWith(pattern.replace(/\*$/, ''))) cache.delete(key);
      },
    };
    const guidedOperation = new OperationService(db, {}, {}, {}, {}, {}, redis);
    const reader = new UserService(db, redis, {}, {}, new InteractionPermissionService(db),
      { getUserGrowthSummary: async () => null }, {}, {}, { visibleLocation: async () => null }, {});
    const oldProfile = await reader.getProfile(profileUser.id, regionA.id, profileUser.id);
    assert.equal(oldProfile.nickname, profileUser.nickname); assert.ok(cache.size > 0);
    const localTag = await db.userTagDefinition.create({ data: { regionId: regionA.id, tagName: '测试摄影', tagColor: '#227744' } });
    const foreignTag = await db.userTagDefinition.create({ data: { regionId: regionB.id, tagName: '其他校区', tagColor: '#663322' } });
    await db.userGuidancePage.create({ data: { regionId: regionA.id, title: '测试资料', sortOrder: 2,
      content: JSON.stringify({ page_no: 2, nickname_max_length: 12, grade_title: '您的年级' }) } });
    const config = await operation.getUserGuidancePages(regionA.id);
    assert.equal(config.success, true); assert.equal(config.data.pages[0].page_no, 2);
    assert.ok(config.data.tags.some((tag) => tag.tag_id === localTag.id));
    assert.ok(!config.data.tags.some((tag) => tag.tag_id === foreignTag.id));
    const body = { region_id: regionA.id, nickname: '资料测试同学', avatar: '/uploads/avatar/synthetic.jpg',
      gender: '女', birthday: '2000-02-29', user_identity: 'junior', selected_tags: [localTag.id] };
    const response = JSON.parse(JSON.stringify(await guidedOperation.saveUserGuidanceInfo(profileUser.id, body)));
    assert.equal(response.success, true); assert.equal(response.data.user.id, profileUser.id);
    assert.equal(response.data.user.profile.gender, 'FEMALE');
    assert.equal(response.data.user.profile.birthday.slice(0, 10), body.birthday);
    assert.equal(response.data.user.profile.grade, body.user_identity);
    assert.deepEqual(response.data.selected_tags, [localTag.id]);
    assert.deepEqual(response.data.user.selected_tags, [localTag.id]);
    assert.ok(invalidated.includes(`user:profile:${profileUser.id}:*`));
    assert.ok(invalidated.includes(`user:profile:v2:${profileUser.id}:*`));
    const profile = JSON.parse(JSON.stringify(await reader.getProfile(profileUser.id, regionA.id, profileUser.id)));
    assert.equal(profile.nickname, body.nickname); assert.equal(profile.avatar, body.avatar);
    assert.equal(profile.profile.grade, body.user_identity); assert.equal(profile.profile.birthday.slice(0, 10), body.birthday);
    assert.equal(profile.gender, 2);
    assert.deepEqual(profile.selected_tags, [localTag.id]); assert.equal(profile.selection_unresolved, false);
    const tags = await db.userTag.findMany({ where: { userId: profileUser.id } });
    assert.deepEqual(tags.map((tag) => tag.name), [localTag.tagName]);
    const invalidationCount = invalidated.length;
    await assert.rejects(() => guidedOperation.saveUserGuidanceInfo(profileUser.id, { ...body, nickname: '不得写入', selected_tags: [foreignTag.id] }), /部分标签无效/);
    assert.equal(invalidated.length, invalidationCount, 'failed saves do not invalidate a valid cached profile');
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: profileUser.id } })).nickname, body.nickname);
    const unchangedTags = await guidedOperation.saveUserGuidanceInfo(profileUser.id, { region_id: regionA.id, nickname: '仅修改昵称' });
    assert.deepEqual(unchangedTags.data.selected_tags, [localTag.id]);
    assert.deepEqual(unchangedTags.data.user.selected_tags, [localTag.id]);
    await db.userTagDefinition.create({ data: { regionId: null, tagName: localTag.tagName, tagColor: localTag.tagColor } });
    cache.clear();
    const ambiguous = await reader.getProfile(profileUser.id, regionA.id, profileUser.id);
    assert.equal(ambiguous.selection_unresolved, true); assert.deepEqual(ambiguous.selected_tags, []);
  });
  await check('real Nest HTTP and DB serve public agreements and authenticated guidance/profile with stable error codes', async () => {
    const { Test } = require('@nestjs/testing');
    const { UnauthorizedException } = require('@nestjs/common');
    const request = require('supertest');
    const { OperationController } = require('../src/modules/operation/operation.controller.ts');
    const { UserController } = require('../src/modules/user/user.controller.ts');
    const { FinanceService } = require('../src/modules/finance/finance.service.ts');
    const { JwtGuard } = require('../src/guards/jwt.guard.ts');
    const { OptionalAuthGuard } = require('../src/guards/optional-auth.guard.ts');
    const { TransformInterceptor } = require('../src/interceptors/transform.interceptor.ts');
    const { AllExceptionsFilter } = require('../src/filters/all-exceptions.filter.ts');
    const { miniProgramApiCompatMiddleware, getMiniProgramGlobalPrefixExcludes } = require('../src/common/middleware/mini-program-api-compat.ts');
    const httpUser = await createUser('http');
    const reader = new UserService(db, { getJson: async () => null, setJson: async () => {} }, {}, {}, new InteractionPermissionService(db),
      { getUserGrowthSummary: async () => null }, {}, {}, { visibleLocation: async () => null }, {});
    const module = await Test.createTestingModule({
      controllers: [OperationController, UserController],
      providers: [{ provide: OperationService, useValue: operation }, { provide: UserService, useValue: reader }, { provide: FinanceService, useValue: {} }],
    }).overrideGuard(JwtGuard).useValue({ canActivate(context) {
      const req = context.switchToHttp().getRequest();
      if (req.headers['x-uniappx-test-user'] !== httpUser.id) throw new UnauthorizedException();
      req.user = { sub: httpUser.id }; return true;
    } }).overrideGuard(OptionalAuthGuard).useValue({ canActivate: () => true }).compile();
    const app = module.createNestApplication({ logger: false });
    app.use(miniProgramApiCompatMiddleware);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter({ error: () => {} }, db));
    app.setGlobalPrefix('/api/v1', { exclude: [...getMiniProgramGlobalPrefixExcludes(), 'api/{*path}'] });
    try {
      await app.listen(0, '127.0.0.1');
      process.env.UNIAPPX_TEST_HTTP_PORT = String(app.getHttpServer().address().port);
      const http = request(`http://127.0.0.1:${process.env.UNIAPPX_TEST_HTTP_PORT}`);
      const read = await http.get('/api/agreements/PRIVACY_POLICY').query({ region_id: regionA.id }).expect(200);
      assert.equal(read.body.data.content_hash, agreementContentHash(globalPrivacy));
      await http.post('/api/agreements/consent').send(privacy).expect(401);
      const invalid = await http.post('/api/agreements/consent').set('x-uniappx-test-user', httpUser.id)
        .send({ ...privacy, version: 'obsolete' }).expect(409);
      assert.equal(invalid.body.code, 409); assert.equal(invalid.body.error_code, 'AGREEMENT_UPDATED');
      assert.equal(await consentCount(httpUser.id), 0);
      await http.post('/api/agreements/consent').set('x-uniappx-test-user', httpUser.id).send(privacy).expect(201);
      assert.equal(await consentCount(httpUser.id), 1);
      const config = await http.get(`/api/user-guidance/pages/${regionA.id}`).expect(200);
      assert.equal(config.body.success, true); assert.ok(config.body.data.pages.length > 0);
      const payload = { region_id: regionA.id, nickname: 'HTTP测试同学', avatar: '/uploads/avatar/http-test.jpg',
        gender: '男', birthday: '2001-01-02', user_identity: 'senior', selected_tags: [] };
      await http.post('/api/user-guidance/save-user-info').send(payload).expect(401);
      const saved = await http.post('/api/user-guidance/save-user-info').set('x-uniappx-test-user', httpUser.id).send(payload).expect(201);
      assert.equal(saved.body.success, true); assert.equal(saved.body.data.user.id, httpUser.id);
      const self = await http.get('/api/auth/me').set('x-uniappx-test-user', httpUser.id).query({ region_id: regionA.id }).expect(200);
      assert.equal(self.body.id, httpUser.id); assert.equal(self.body.nickname, payload.nickname);
      assert.equal(self.body.avatar, payload.avatar); assert.equal(self.body.profile.grade, payload.user_identity);
      assert.equal(self.body.profile.birthday.slice(0, 10), payload.birthday); assert.equal(self.body.gender, 1);
      assert.deepEqual(self.body.selected_tags, []);
    } finally { delete process.env.UNIAPPX_TEST_HTTP_PORT; await app.close(); }
  });
  console.log(JSON.stringify({ result: 'passed', checks, database: 'fresh-disposable-postgresql', realExternalCalls: 0, productionDataUsed: false }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
