// Black-box test of the built Go executable. The origin is a local HTTP fixture,
// NOT the real Nest application, JWT verifier, database or production server.
// Run after: go build -o bin/campus-map-read .
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};
async function until(check, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(40);
  }
  assert.fail(`timed out: ${label}`);
}

test('built Go process coexists with an old HTTP origin and recovers safely', { timeout: 30000 }, async (t) => {
  const token = 'local-smoke-only-service-secret-32-characters';
  const bearer = 'Bearer local-smoke-user';
  const counters = { snapshots: 0, access: 0, badSecret: 0 };
  let unavailable = false;
  let revoked = false;
  let publicPlaces = [{ id: 'north-gate', name: '北大门' }];
  const payload = () => ({
    code: 200, message: 'success', timestamp: new Date().toISOString(),
    data: { enabled: true, regionId: 'smoke-campus', workflow: { activeVersionId: 'v16' },
      publicPlaces, layers: [], navigation: { graph: { edges: [] } } },
  });
  const origin = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/campus-map/read-snapshot' || pathname === '/campus-map/read-access') {
      if (req.headers['x-campus-map-read-token'] !== token) {
        counters.badSecret++;
        res.writeHead(401).end('{}');
        return;
      }
      if (pathname.endsWith('read-snapshot')) counters.snapshots++;
      else counters.access++;
    }
    if (unavailable) { res.writeHead(503).end('{}'); return; }
    if (pathname === '/campus-map/read-access' || pathname === '/campus-map/active') {
      if (revoked || req.headers.authorization !== bearer) { res.writeHead(401).end('{}'); return; }
      if (pathname.endsWith('read-access')) { res.end(JSON.stringify({ code: 200, data: { allowed: true } })); return; }
    }
    if (['/campus-map/read-snapshot', '/campus-map/active', '/campus-map/site'].includes(pathname)) {
      res.end(JSON.stringify(payload()));
    } else res.writeHead(404).end('{}');
  });
  const originPort = await listen(origin);
  t.after(() => close(origin));
  const reservation = http.createServer();
  const readerPort = await listen(reservation);
  await close(reservation);
  const base = `http://127.0.0.1:${readerPort}`;
  const originBase = `http://127.0.0.1:${originPort}`;
  let child;
  let exited;
  let logs = '';
  const start = () => {
    child = spawn(path.join(__dirname, 'bin/campus-map-read'), [], {
      cwd: __dirname,
      env: {
        PATH: process.env.PATH,
        CAMPUS_MAP_READ_LISTEN: `127.0.0.1:${readerPort}`,
        CAMPUS_MAP_ORIGIN: originBase,
        CAMPUS_MAP_READ_TOKEN: token,
        CAMPUS_MAP_REGIONS: 'smoke-campus',
        CAMPUS_MAP_REFRESH: '1s', CAMPUS_MAP_LEASE: '3s', CAMPUS_MAP_ORIGIN_TIMEOUT: '500ms',
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    exited = once(child, 'exit');
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk).slice(-32000); });
  };
  const stop = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const deadline = setTimeout(() => child.kill('SIGKILL'), 2500);
    child.kill('SIGTERM');
    try { return await exited; } finally { clearTimeout(deadline); }
  };
  t.after(stop);
  const request = async (pathname, options = {}) => {
    const response = await fetch(base + pathname, { ...options, signal: AbortSignal.timeout(2000) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  };
  const site = '/campus-map/site?regionId=smoke-campus';
  const active = '/api/campus-map/active?region_id=smoke-campus';
  const auth = { headers: { Authorization: bearer } };
  start();
  await until(async () => {
    try { return (await request('/readyz')).status === 200; } catch { return false; }
  }, 'initial readiness');

  await t.test('old and Go public content are equal, apart from readRevision', async () => {
    const old = await (await fetch(originBase + site)).json();
    const next = await request(site);
    assert.equal(next.status, 200);
    const { readRevision, ...content } = next.data.data;
    assert.match(readRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(content, old.data);
  });

  await t.test('512 reads use the cache, but each protected request still checks access', async () => {
    const before = { ...counters };
    const started = Date.now();
    await Promise.all(Array.from({ length: 16 }, async () => {
      for (let i = 0; i < 32; i++) assert.equal((await request(active, auth)).status, 200);
    }));
    assert.equal(counters.access - before.access, 512);
    assert.ok(counters.snapshots - before.snapshots <= Math.ceil((Date.now() - started) / 1000) + 1);
    assert.equal(counters.badSecret, 0);
    t.diagnostic(`512 reads; ${counters.access - before.access} access checks; ${counters.snapshots - before.snapshots} background map fetches`);
  });

  await t.test('missing login and revoked account cannot use the cached ETag', async () => {
    assert.equal((await request(active)).status, 401);
    const first = await request(active, auth);
    revoked = true;
    assert.equal((await request(active, { headers: { Authorization: bearer, 'If-None-Match': first.headers.get('etag') } })).status, 401);
    revoked = false;
    assert.equal((await request(active, auth)).status, 200);
  });

  await t.test('same-version withdrawal propagates and changes the revision', async () => {
    const previous = await request(site);
    publicPlaces = [];
    await until(async () => (await request(site)).data?.data?.publicPlaces.length === 0, 'withdrawal');
    const next = await request(site);
    assert.equal(next.data.data.workflow.activeVersionId, 'v16');
    assert.notEqual(next.data.data.readRevision, previous.data.data.readRevision);
  });

  await t.test('origin outage fails auth immediately and public data after its lease, then recovers', async () => {
    unavailable = true;
    assert.equal((await request(active, auth)).status, 503);
    await until(async () => (await request(site)).status === 503, 'expired public cache', 4500);
    assert.equal((await request('/readyz')).status, 503);
    assert.equal((await request('/healthz')).status, 200);
    unavailable = false;
    await until(async () => (await request('/readyz')).status === 200, 'origin recovery');
    assert.equal((await request(active, auth)).status, 200);
  });

  await t.test('Go shutdown leaves old origin working; restart does not resurrect stale data', async () => {
    assert.deepEqual(await stop(), [0, null]);
    assert.equal((await fetch(originBase + '/campus-map/active?regionId=smoke-campus', auth)).status, 200);
    unavailable = true;
    start();
    await until(async () => {
      try { return (await request('/healthz')).status === 200; } catch { return false; }
    }, 'restarted liveness');
    assert.equal((await request(site)).status, 503);
    unavailable = false;
    await until(async () => (await request('/readyz')).status === 200, 'restart recovery');
  });

  await t.test('writes, internal routes and unknown regions cannot reach map state', async () => {
    assert.equal((await request(site, { method: 'POST' })).status, 405);
    assert.equal((await request('/campus-map/read-snapshot')).status, 404);
    assert.equal((await request('/campus-map/site?regionId=unknown')).status, 404);
    assert.equal((await request('/campus-map/site?regionId=smoke-campus&regionId=unknown')).status, 400);
    assert.equal(logs.includes(token), false);
    assert.equal(logs.includes(bearer), false);
  });
});
