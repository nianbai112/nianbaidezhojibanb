/**
 * Real Nest HTTP controller, publication filter, JWT crypto, guards, throttler
 * and TransformInterceptor -> compiled Go process. Prisma is an in-memory
 * test double: no database, Redis, production config or AppModule is loaded.
 * Opt in with CAMPUS_MAP_TEST_BINARY=/absolute/path/to/campus-map-read.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { CampusMapController } from './campus-map.controller';
import { CampusMapService } from './campus-map.service';
import { CampusMapReadGuard } from './campus-map-read.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { ApiThrottlerGuard } from '../../guards/api-throttler.guard';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { UploadService } from '../upload/upload.service';
import { TransformInterceptor } from '../../interceptors/transform.interceptor';
import { getMiniProgramGlobalPrefixExcludes, miniProgramApiCompatMiddleware } from '../../common/middleware/mini-program-api-compat';

const binary = process.env.CAMPUS_MAP_TEST_BINARY;
const nginxBinary = process.env.CAMPUS_MAP_TEST_NGINX;
const deployDir = process.env.CAMPUS_MAP_TEST_DEPLOY_DIR;
const integration = binary ? describe : describe.skip;

integration('real Nest + Go read integration (Prisma test double)', () => {
  const regionId = 'integration-campus';
  const serviceToken = 'integration-only-read-service-token-32';
  const jwtSecret = 'integration-only-jwt-signing-secret-32';
  const previousToken = process.env.CAMPUS_MAP_READ_TOKEN;
  const statuses = new Map<string, string>();
  let app: INestApplication;
  let child: ChildProcess;
  let exited: Promise<any[]>;
  let nodeURL: string;
  let goURL: string;
  let live = true;
  let nginxChild: ChildProcess | undefined;
  let nginxExited: Promise<any[]>;
  let nginxURL: string;
  const nginxTest = nginxBinary && deployDir ? it : it.skip;
  const stopGo = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.kill('SIGTERM');
    try { await exited; } finally { clearTimeout(timer); }
  };
  const stopNginx = async () => {
    if (!nginxChild || nginxChild.exitCode !== null || nginxChild.signalCode !== null) return;
    const processToStop = nginxChild;
    const timer = setTimeout(() => processToStop.kill('SIGKILL'), 3000);
    processToStop.kill('SIGQUIT');
    try { await nginxExited; } finally { clearTimeout(timer); }
  };
  const published = {
    id: 'map-integration', regionId, enabled: true, activeVersionId: 'version-16',
    draft: { manifest: { title: 'PRIVATE DRAFT MUST NOT LEAK' } },
    activeVersion: {
      id: 'version-16', version: 16,
      manifest: {
        enabled: true, title: 'Published campus', mapId: 'map-integration',
        layers: [{ id: 'pois', inlineData: { type: 'FeatureCollection', features: [{
          type: 'Feature', geometry: { type: 'Point', coordinates: [106, 29] },
          properties: { officialNumber: 38, officialName: '北大门', constructionStatus: 'built',
            visibilityScope: 'phase1_active', geometryStatus: 'verified_point', publishStatus: 'published' },
        }] } }],
      },
    },
  };
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }: any) => statuses.has(where.id)
      ? { id: where.id, status: statuses.get(where.id) } : null) },
    campusMap: { findUnique: jest.fn(async ({ where }: any) => where.regionId === regionId ? published : null) },
    campusMapProject: { findMany: jest.fn(async () => live
      ? [{ id: 'place-38', officialNumber: 38, media: [] }] : []) },
  };
  const jwt = new JwtService({ secret: jwtSecret });
  const bearer = (id: string) => {
    statuses.set(id, 'ACTIVE');
    return `Bearer ${jwt.sign({ sub: id }, { expiresIn: '5m' })}`;
  };
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
    const body = await response.text();
    return { status: response.status, headers: response.headers, body: body ? JSON.parse(body) : null };
  };
  const waitFor = async (check: () => Promise<boolean>, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await check()) return true; } catch { /* process starting */ }
      await delay(50);
    }
    return false;
  };
  const startNginx = async (target: string) => {
    await stopNginx();
    const folder = mkdtempSync(join(tmpdir(), 'campus-map-nginx-'));
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const httpConfig = readFileSync(join(deployDir!, 'campus-map-read-http.conf.example'), 'utf8')
      .replace('default http://127.0.0.1:3000;', `default ${target};`);
    const locations = readFileSync(join(deployDir!, 'campus-map-read-locations.conf.example'), 'utf8');
    const config = join(folder, 'nginx.conf');
    // Only disposable fixture configuration is generated here, never live config.
    writeFileSync(config, `daemon off; master_process off; error_log stderr; pid ${folder}/nginx.pid;
events { worker_connections 128; }
http { access_log off; client_body_temp_path ${folder}/client; proxy_temp_path ${folder}/proxy;
${httpConfig}
server { listen 127.0.0.1:${port}; server_name localhost;
${locations}
location / { proxy_pass ${nodeURL}; }
} }`);
    const check = spawnSync(nginxBinary!, ['-p', folder + '/', '-c', config, '-t', '-e', 'stderr'], { encoding: 'utf8', timeout: 5000 });
    if (check.status !== 0) throw new Error(`isolated nginx -t failed: ${check.stderr}`);
    nginxChild = spawn(nginxBinary!, ['-p', folder + '/', '-c', config, '-e', 'stderr'], { stdio: 'ignore' });
    nginxExited = once(nginxChild, 'exit');
    nginxURL = `http://127.0.0.1:${port}`;
    expect(await waitFor(async () => (await fetch(nginxURL + '/campus-map/read-snapshot', { signal: AbortSignal.timeout(1000) })).status === 404)).toBe(true);
  };

  beforeAll(async () => {
    process.env.CAMPUS_MAP_READ_TOKEN = serviceToken;
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 20 }])],
      controllers: [CampusMapController],
      providers: [CampusMapService, CampusMapReadGuard, JwtGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? jwtSecret : undefined } },
        { provide: AdminDataScopeService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: APP_GUARD, useClass: ApiThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(miniProgramApiCompatMiddleware);
    app.setGlobalPrefix('/api/v1', { exclude: [
      ...getMiniProgramGlobalPrefixExcludes(),
      'balance-recharge', 'balance-recharge/{*path}', 'api/{*path}',
      'dashboard', 'dashboard/{*path}', 'admin/{*path}', 'mall/{*path}',
    ] });
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
    nodeURL = await app.getUrl();
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    goURL = `http://127.0.0.1:${port}`;
    child = spawn(binary!, [], { env: {
      PATH: process.env.PATH, CAMPUS_MAP_READ_LISTEN: `127.0.0.1:${port}`,
      CAMPUS_MAP_ORIGIN: nodeURL, CAMPUS_MAP_READ_TOKEN: serviceToken,
      CAMPUS_MAP_REGIONS: regionId, CAMPUS_MAP_REFRESH: '1s', CAMPUS_MAP_LEASE: '3s',
      CAMPUS_MAP_ORIGIN_TIMEOUT: '500ms',
    }, stdio: 'ignore' });
    exited = once(child, 'exit');
    expect(await waitFor(async () => (await get(goURL + '/healthz')).status === 200)).toBe(true);
  }, 15000);

  afterAll(async () => {
    await stopNginx();
    await stopGo();
    if (app) await app.close();
    if (previousToken === undefined) delete process.env.CAMPUS_MAP_READ_TOKEN;
    else process.env.CAMPUS_MAP_READ_TOKEN = previousToken;
  });

  it('accepts actual Nest code=0 and preserves its published response, not the draft', async () => {
    const old = await get(`${nodeURL}/campus-map/site?regionId=${regionId}`);
    expect(old.status).toBe(200);
    expect(old.body.code).toBe(0);
    expect(old.body.data.enabled).toBe(true);
    expect(await waitFor(async () => (await get(goURL + '/readyz')).status === 200)).toBe(true);
    const next = await get(`${goURL}/campus-map/site?regionId=${regionId}`);
    expect(next.status).toBe(200);
    const { readRevision } = next.body.data;
    expect(readRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(next.body.code).toBe(old.body.code);
    expect(next.body.data).toEqual(old.body.data);
    expect(JSON.stringify(next.body)).not.toContain('PRIVATE DRAFT');
    const oldApi = await get(`${nodeURL}/api/campus-map/site?regionId=${regionId}`);
    const nextApi = await get(`${goURL}/api/campus-map/site?regionId=${regionId}`);
    expect(oldApi.status).toBe(200);
    expect(nextApi.status).toBe(200);
    const { readRevision: apiRevision } = nextApi.body.data;
    expect(apiRevision).toBe(readRevision);
    expect(nextApi.body.data).toEqual(oldApi.body.data);
  }, 10000);

  it('returns the same lightweight version through Nest and Go without exposing map geometry', async () => {
    for (const route of ['site/version', 'version']) {
      const headers: Record<string, string> = route === 'version' ? { Authorization: bearer('student-version') } : {};
      const direct = await get(`${nodeURL}/campus-map/${route}?regionId=${regionId}`, headers);
      const cached = await get(`${goURL}/campus-map/${route}?regionId=${regionId}`, headers);
      expect(direct.status).toBe(200);
      expect(cached.status).toBe(200);
      expect(cached.body.data).toEqual(direct.body.data);
      expect(direct.body.data).not.toHaveProperty('navigation');
      expect(direct.body.data).not.toHaveProperty('publicPlaces');
    }
    expect((await get(`${nodeURL}/campus-map/version?regionId=${regionId}`)).status).toBe(401);
  });

  it('executes real JWT verification and refuses expired, forged, banned and deleted users', async () => {
    const url = `${goURL}/campus-map/active?regionId=${regionId}`;
    const token = bearer('student-auth');
    expect((await get(url, { Authorization: token })).status).toBe(200);
    expect((await get(url)).status).toBe(401);
    expect((await get(url, { Authorization: 'Bearer forged' })).status).toBe(401);
    const expired = `Bearer ${jwt.sign({ sub: 'student-auth' }, { expiresIn: -1 })}`;
    expect((await get(url, { Authorization: expired })).status).toBe(401);
    for (const status of ['BANNED', 'INACTIVE', 'DELETED']) {
      statuses.set('student-auth', status);
      expect((await get(url, { Authorization: token })).status).toBe(401);
    }
    statuses.delete('student-auth');
    expect((await get(url, { Authorization: token })).status).toBe(401);
  });

  it('real throttler separates 24 users sharing loopback IP, and limits one repeated token', async () => {
    const url = `${goURL}/campus-map/active?regionId=${regionId}`;
    for (let i = 0; i < 24; i++) {
      expect((await get(url, { Authorization: bearer(`nat-student-${i}`) })).status).toBe(200);
    }
    const token = bearer('busy-student');
    for (let i = 0; i < 20; i++) expect((await get(url, { Authorization: token })).status).toBe(200);
    expect((await get(url, { Authorization: token })).status).toBe(429);
    expect((await get(url, { Authorization: bearer('other-student') })).status).toBe(200);
  });

  it('real publication filter removes a withdrawn place without changing formal version', async () => {
    const url = `${goURL}/campus-map/site?regionId=${regionId}`;
    const before = await get(url);
    expect(before.body.data.layers[0].inlineData.features).toHaveLength(1);
    live = false;
    expect(await waitFor(async () => (await get(url)).body?.data?.layers[0]?.inlineData.features.length === 0)).toBe(true);
    const after = await get(url);
    expect(after.body.data.workflow.activeVersionId).toBe('version-16');
    expect(after.body.data.readRevision).not.toBe(before.body.data.readRevision);
  }, 10000);

  it('internal exports require the service secret; old user route still works', async () => {
    const auth = { Authorization: bearer('student-old') };
    expect((await get(`${nodeURL}/campus-map/read-access`, auth)).status).toBe(401);
    expect((await get(`${nodeURL}/campus-map/read-snapshot?regionId=${regionId}`)).status).toBe(401);
    expect((await get(`${nodeURL}/campus-map/active?regionId=${regionId}`, auth)).status).toBe(200);
  });

  nginxTest('Nginx defaults to Node, blocks internal routes, and switches reads to Go only', async () => {
    await startNginx(nodeURL);
    const old = await get(`${nginxURL}/campus-map/site?regionId=${regionId}`);
    expect(old.status).toBe(200);
    expect(old.headers.get('x-campus-map-service')).toBeNull();
    await startNginx(goURL);
    const next = await get(`${nginxURL}/api/campus-map/active?regionId=${regionId}`, { Authorization: bearer('nginx-student') });
    expect(next.status).toBe(200);
    expect(next.headers.get('x-campus-map-service')).toBe('go-read-v1');
    for (const path of ['/campus-map/read-snapshot', '/api/campus-map/read-access']) {
      expect((await fetch(nginxURL + path, { signal: AbortSignal.timeout(2000) })).status).toBe(404);
    }
    const admin = await get(`${nginxURL}/admin/campus-map/project-catalog?regionId=${regionId}`);
    expect(admin.status).toBe(401);
    expect(admin.headers.get('x-campus-map-service')).toBeNull();
  }, 15000);

  nginxTest('Go failure does not auto-flood Node; explicit rollback restores the old read route', async () => {
    await stopGo();
    const failed = await fetch(`${nginxURL}/campus-map/site?regionId=${regionId}`, { signal: AbortSignal.timeout(2000) });
    expect(failed.status).toBe(502);
    expect((await get(`${nodeURL}/campus-map/site?regionId=${regionId}`)).status).toBe(200);
    await startNginx(nodeURL);
    const restored = await get(`${nginxURL}/api/campus-map/active?regionId=${regionId}`, { Authorization: bearer('rollback-student') });
    expect(restored.status).toBe(200);
    expect(restored.headers.get('x-campus-map-service')).toBeNull();
  }, 15000);
});
