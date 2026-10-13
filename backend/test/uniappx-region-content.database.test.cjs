// Run only through scripts/test-region-content-isolated.cjs; no existing DB or .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/region_content_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(path.basename(process.cwd()).startsWith('uniappx-region-content-'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { UnauthorizedException } = require('@nestjs/common');
const { OperationService } = require('../src/modules/operation/operation.service.ts');
const { OperationController } = require('../src/modules/operation/operation.controller.ts');
const { JwtGuard } = require('../src/guards/jwt.guard.ts');
const { OptionalAuthGuard } = require('../src/guards/optional-auth.guard.ts');
const { TransformInterceptor } = require('../src/interceptors/transform.interceptor.ts');
const { getMiniProgramGlobalPrefixExcludes, miniProgramApiCompatMiddleware } = require('../src/common/middleware/mini-program-api-compat.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const service = new OperationService(db, {}, {}, {}, {}, {});
const updatedAt = new Date('2026-01-01T00:00:00Z');
const article = (id, regionId, sortOrder, extra = {}) => ({ id, regionId, sortOrder, title: `synthetic-${id}`, type: 'article', content: '<p>合成已发布内容</p>', isShow: true, publishedAt: null, updatedAt, ...extra });
const custom = (id, regionId, displayScope, sortOrder, extra = {}) => ({ id, regionId, displayScope, sortOrder, title: `synthetic-${id}`, content: '<p>合成区域内容</p>', isShow: true, ...extra });
const ids = (rows) => rows.map((row) => row.id);
let checks = 0, app;
async function check(name, work) { await work(); checks++; console.log('PASS', name); }
async function get(target) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: process.env.UNIAPPX_TEST_HTTP_PORT, path: target, method: 'GET' }, (response) => {
      let source = ''; response.on('data', (part) => { source += part; }); response.on('end', () => {
        try { resolve({ status: response.statusCode, body: source ? JSON.parse(source) : null }); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('isolated HTTP timeout'))); req.end();
  });
}

async function main() {
  const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(identity.name, url.pathname.slice(1)); assert.equal(identity.host, '127.0.0.1'); assert.equal(String(identity.port), url.port);
  await db.richTextContent.createMany({ data: [
    article('global-a', null, 0), article('campus-a-1', 'campus-a', 1), article('global-b', null, 2), article('campus-a-2', 'campus-a', 3),
    article('campus-b-only', 'campus-b', -20), article('campus-a-hidden', 'campus-a', -10, { isShow: false }),
    article('global-future', null, -30, { publishedAt: new Date(Date.now() + 86400000) }),
    article('campus-a-future', 'campus-a', -40, { publishedAt: new Date(Date.now() + 86400000) }),
  ] });
  await db.regionCustomPage.createMany({ data: [
    custom('custom-all', 'campus-a', 'all', 0), custom('custom-module-a', 'campus-a', 'module', 1), custom('custom-module-b', 'campus-a', 'module', 1),
    custom('custom-home', 'campus-a', 'home', -10), custom('custom-mine', 'campus-a', 'mine', -10),
    custom('custom-foreign', 'campus-b', 'module', -20), custom('custom-hidden', 'campus-a', 'module', -30, { isShow: false }),
  ] });
  await check('real SQL list returns current campus plus global, excluding hidden, future and foreign rows', async () => {
    assert.deepEqual(ids(await service.getRichTextContents({ region_id: 'campus-a' })), ['global-a', 'campus-a-1', 'global-b', 'campus-a-2']);
  });
  await check('missing/zero scope cannot become an undefined Prisma filter that returns all campuses', async () => {
    for (const query of [{}, { region_id: '' }, { region_id: 0 }, { region_id: '0' }, { region_id: '__global__' }]) {
      assert.deepEqual(ids(await service.getRichTextContents(query)), ['global-a', 'global-b']);
    }
    assert.deepEqual(ids(await service.getRichTextContents({ region_id: 'campus-missing' })), ['global-a', 'global-b']);
  });
  await check('stable DB pagination does not duplicate or skip ties, and invalid limits/scope fail before returning content', async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => service.getRichTextContents({ region_id: 'campus-a', page: String(page), limit: '2' })));
    assert.deepEqual(pages.map(ids), [['global-a', 'campus-a-1'], ['global-b', 'campus-a-2'], []]);
    for (const query of [{ page: -1 }, { page: '1.5' }, { page: '1000001' }, { limit: 0 }, { limit: 51 }, { limit: 'Infinity' }, { region_id: {} }, { region_id: ['campus-a'] }, { region_id: '../a' }]) await assert.rejects(() => service.getRichTextContents(query), (error) => error.getStatus?.() === 400);
  });
  await check('exact published ID remains publicly shareable while draft/future IDs are unreadable', async () => {
    assert.equal((await service.getRichTextContent('campus-b-only')).regionId, 'campus-b');
    for (const id of ['campus-a-hidden', 'campus-a-future', 'global-future', 'missing']) assert.equal(await service.getRichTextContent(id), null);
  });
  await check('type mapping excludes future versions and honors campus precedence over a lower sorted global', async () => {
    const map = await service.getRegionContentTypes('campus-a');
    assert.deepEqual(map.types.map((row) => row.content_id), ['campus-a-1']); assert.deepEqual(map.data.types, map.types);
    assert.deepEqual((await service.getRegionContentTypes('0')).types.map((row) => row.content_id), ['global-a']);
  });
  await check('custom pages obey campus and explicit module/all scope, stable order and pagination', async () => {
    assert.deepEqual(ids(await service.getRegionCustomPages('campus-a', { display_scope: 'module' })), ['custom-all', 'custom-module-a', 'custom-module-b']);
    assert.deepEqual(ids(await service.getRegionCustomPages('campus-a', { display_scope: 'home' })), ['custom-home', 'custom-all']);
    assert.deepEqual(ids(await service.getRegionCustomPages('campus-a', { display_scope: 'mine' })), ['custom-mine', 'custom-all']);
    assert.deepEqual(ids(await service.getRegionCustomPages('campus-a', {})), ['custom-all']);
    assert.deepEqual(ids(await service.getRegionCustomPages('campus-a', { display_scope: 'module', page: '2', page_size: '1' })), ['custom-module-a']);
    for (const [region, query] of [['0', {}], ['', {}], ['campus-a', { display_scope: 'invalid' }], ['campus-a', { page_size: 51 }], ['campus-a', { page: 0 }]]) await assert.rejects(() => service.getRegionCustomPages(region, query), (error) => error.getStatus?.() === 400);
  });

  const module = await Test.createTestingModule({ controllers: [OperationController], providers: [{ provide: OperationService, useValue: service }] })
    .overrideGuard(JwtGuard).useValue({ canActivate: () => { throw new UnauthorizedException(); } })
    .overrideGuard(OptionalAuthGuard).useValue({ canActivate: () => true }).compile();
  app = module.createNestApplication({ logger: false });
  app.use(miniProgramApiCompatMiddleware); app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('/api/v1', { exclude: [...getMiniProgramGlobalPrefixExcludes(), 'api/{*path}'] });
  await app.listen(0, '127.0.0.1'); process.env.UNIAPPX_TEST_HTTP_PORT = String(app.getHttpServer().address().port);
  await check('actual Nest HTTP route preserves query scope/page and the public array response without articles fiction', async () => {
    const response = await get('/api/rich-text-content?region_id=campus-a&page=2&limit=2');
    assert.equal(response.status, 200); assert.ok(Array.isArray(response.body)); assert.deepEqual(ids(response.body), ['global-b', 'campus-a-2']);
    const noScope = await get('/api/rich-text-content'); assert.equal(noScope.status, 200); assert.deepEqual(ids(noScope.body), ['global-a', 'global-b']);
  });
  await check('actual HTTP detail and type-map enforce publication time, including nested route selection', async () => {
    const future = await get('/api/rich-text-content/global-future'); assert.equal(future.status, 200); assert.equal(future.body, null);
    const shared = await get('/api/rich-text-content/campus-b-only'); assert.equal(shared.status, 200); assert.equal(shared.body.id, 'campus-b-only');
    const map = await get('/api/rich-text-content/config/region/campus-a/all-types'); assert.equal(map.status, 200); assert.deepEqual(map.body.data.types.map((row) => row.content_id), ['campus-a-1']);
  });
  await check('actual HTTP custom-page query passes scope and pagination, malformed requests return 400', async () => {
    const response = await get('/api/region-custom-pages/regions/campus-a/pages?display_scope=module&page=2&page_size=1');
    assert.equal(response.status, 200); assert.deepEqual(ids(response.body), ['custom-module-a']);
    for (const target of ['/api/rich-text-content?limit=999999', '/api/rich-text-content?page=-1', '/api/region-custom-pages/regions/0/pages', '/api/region-custom-pages/regions/campus-a/pages?display_scope=private']) assert.equal((await get(target)).status, 400);
  });
  console.log(`PASS: ${checks} PostgreSQL + real Nest HTTP region-content contracts. Only synthetic data, isolated loopback DB/HTTP, no project .env or provider requests.`);
}
main().catch((error) => { console.error(String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[isolated database URL]')); process.exitCode = 1; })
  .finally(async () => { if (app) await app.close(); await db.$disconnect(); });
