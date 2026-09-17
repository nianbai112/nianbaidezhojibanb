const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../admin/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Exercise actual guard logic/crypto without loading the full Nest app or DB.
// The only shell is the framework decorator and HTTP exception class.
function guardRuntime(token) {
  class UnauthorizedException extends Error {}
  const source = read('backend/src/modules/campus-map/campus-map-read.guard.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
  } });
  const exports = {};
  const sandbox = {
    exports, Buffer, process: { env: { CAMPUS_MAP_READ_TOKEN: token } },
    require(id) {
      if (id === 'crypto') return require('node:crypto');
      if (id === '@nestjs/common') return { Injectable: () => (value) => value, UnauthorizedException };
      throw new Error(`unexpected dependency ${id}`);
    },
  };
  vm.runInNewContext(compiled.outputText, sandbox);
  return { ...exports, UnauthorizedException };
}

test('internal snapshot guard requires a local peer AND an independent service token', () => {
  const token = 'test-only-service-token-with-32-characters';
  const runtime = guardRuntime(token);
  const guard = new runtime.CampusMapReadGuard();
  const ctx = (peer, supplied) => ({ switchToHttp: () => ({ getRequest: () => ({
    socket: { remoteAddress: peer }, headers: { 'x-campus-map-read-token': supplied },
  }) }) });
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(guard.canActivate(ctx(peer, token)), true);
  for (const supplied of [undefined, '', 'wrong', [token], token + 'x']) assert.throws(() => guard.canActivate(ctx('127.0.0.1', supplied)), runtime.UnauthorizedException);
  assert.throws(() => guard.canActivate(ctx('203.0.113.42', token)), runtime.UnauthorizedException);
  assert.throws(() => new (guardRuntime('').CampusMapReadGuard)().canActivate(ctx('127.0.0.1', '')), /无效/);
  const a = runtime.campusMapReadThrottleTracker({ headers: { authorization: 'Bearer student-a' } });
  const b = runtime.campusMapReadThrottleTracker({ headers: { authorization: 'Bearer student-b' } });
  assert.notEqual(a, b);
  assert.ok(!a.includes('student-a'));
});

test('read-access cannot bypass account status and snapshot export cannot read drafts', () => {
  const controller = read('backend/src/modules/campus-map/campus-map.controller.ts');
  const access = controller.slice(controller.indexOf("@Get('campus-map/read-access')"), controller.indexOf("@Get('campus-map/read-snapshot')"));
  assert.match(access, /@UseGuards\(CampusMapReadGuard, JwtGuard\)/);
  assert.match(access, /getTracker: campusMapReadThrottleTracker/);
  assert.doesNotMatch(access, /SkipThrottle|service\.getActiveMap|service\.getRegionMap/);
  const snapshot = controller.slice(controller.indexOf("@Get('campus-map/read-snapshot')"), controller.indexOf("@Post('campus-map/places/"));
  assert.match(snapshot, /@UseGuards\(CampusMapReadGuard\)/);
  assert.match(snapshot, /this\.service\.getActiveMap/);
  assert.doesNotMatch(snapshot, /getRegionMap|saveDraft|publishDraft/);
});

test('deployment remains opt-in, internal-only and bounded instead of cascading fallback', () => {
  const http = read('deploy/campus-map-read-http.conf.example');
  const locations = read('deploy/campus-map-read-locations.conf.example');
  const service = read('deploy/campus-map-read.service.example');
  assert.match(http, /default http:\/\/127\.0\.0\.1:3000;/);
  assert.match(locations, /read-snapshot\|read-access/);
  assert.match(locations, /return 404;/);
  assert.match(locations, /proxy_next_upstream off;/);
  assert.match(locations, /X-Real-IP \$remote_addr/);
  assert.match(service, /MemoryMax=256M/);
  assert.match(service, /CPUQuota=100%/);
});
