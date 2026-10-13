#!/usr/bin/env node
// Real PostgreSQL contracts, isolated from project .env, shared Prisma clients and existing DBs.
// Run: node backend/scripts/test-uniappx-isolated.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const backend = path.resolve(__dirname, '..');
const repo = path.resolve(backend, '..');
let temporary = '', runningChild = null, cleaning = false;
const redact = (value) => String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[isolated database URL]');
const baseEnv = () => ({
  PATH: process.env.PATH || '', HOME: process.env.HOME || '',
  LANG: 'C', LC_ALL: 'C', NODE_ENV: 'test',
  PRISMA_GENERATE_SKIP_AUTOINSTALL: '1', CHECKPOINT_DISABLE: '1',
  PRISMA_ENGINES_MIRROR: 'http://127.0.0.1:1',
});
function execute(command, args, env, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: temporary, env, stdio: ['ignore', 'pipe', 'pipe'] });
    runningChild = child;
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', (error) => { clearTimeout(timer); runningChild = null; reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); runningChild = null;
      if (code !== 0) reject(new Error(`${path.basename(command)} failed (${signal || code}):\n${redact(output).slice(-14000)}`));
      else resolve(redact(output));
    });
  });
}
function cleanup() {
  if (!temporary || cleaning) return;
  cleaning = true;
  if (runningChild) runningChild.kill('SIGKILL');
  const cluster = path.join(temporary, 'cluster');
  // The directory was created by this process; never stop any pre-existing cluster.
  if (fs.existsSync(path.join(cluster, 'postmaster.pid'))) {
    const stopped = spawnSync('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', '-t', '15', 'stop'], {
      cwd: temporary, env: baseEnv(), encoding: 'utf8', timeout: 20000,
    });
    if (stopped.status !== 0) {
      console.error('Temporary PostgreSQL could not be stopped; preserving its directory for inspection:', temporary);
      process.exitCode = 1;
      return;
    }
  }
  assert.ok(path.basename(temporary).startsWith('uniappx-contract-'));
  fs.rmSync(temporary, { recursive: true, force: true });
  console.log('CLEANUP: removed only this run\'s temporary PostgreSQL cluster and client.');
  temporary = '';
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

async function main() {
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [backend] });
  for (const binary of ['initdb', 'pg_ctl', 'createdb']) {
    const check = spawnSync(binary, ['--version'], { env: baseEnv(), encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${binary} must be installed before running isolated contracts`);
  }
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'uniappx-contract-'));
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
  const cluster = path.join(temporary, 'cluster');
  const database = 'student_identity_test_uniappx_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const url = `postgresql://uniappx_test@127.0.0.1:${port}/${database}?schema=public`;
  const env = { ...baseEnv(), DATABASE_URL: url, TEST_DATABASE_URL: url,
    STUDENT_IDENTITY_TEST_DATABASE_URL: url, UNIAPPX_TEST_DATABASE_URL: url,
    DB_PROVIDER: 'postgresql', TS_NODE_PROJECT: path.join(backend, 'tsconfig.json'),
    UNIAPPX_ISOLATED_ROOT: temporary, UNIAPPX_ISOLATED_PORT: String(port),
  };
  console.log('ISOLATION: fresh loopback cluster, synthetic data, empty environment allowlist; existing services untouched.');
  await execute('initdb', ['-D', cluster, '-U', 'uniappx_test', '--auth=trust', '--no-locale', '-E', 'UTF8'], env);
  // TCP only: avoid platform-specific Unix socket path length limits.
  await execute('pg_ctl', ['-D', cluster, '-l', path.join(temporary, 'postgres.log'), '-w', '-t', '15',
    '-o', `-h 127.0.0.1 -p ${port} -k '' -F`, 'start'], env, 20000);
  await execute('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'uniappx_test', database], env);
  const source = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');
  assert.match(source, /datasource db\s*\{\s*provider\s*=\s*"postgresql"/);
  const client = path.join(temporary, 'client');
  const schema = source.replace(/generator client\s*\{/, `generator client {\n  output = ${JSON.stringify(client)}`);
  const schemaFile = path.join(temporary, 'schema.prisma');
  fs.writeFileSync(schemaFile, schema);
  // Reuse installed compiler dependencies without writing the shared generated client.
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  console.log('SCHEMA: create tables and generate a temporary Prisma client.');
  await execute(process.execPath, [prismaCli, 'db', 'push', '--schema', schemaFile, '--skip-generate'], env);
  await execute(process.execPath, [prismaCli, 'generate', '--schema', schemaFile], env);

  const preload = path.join(temporary, 'isolated-preload.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
const client = require(${JSON.stringify(client)});
Module._load = function(id, parent, main) {
  if (id === '@prisma/client') return client;
  return originalLoad.call(this, id, parent, main);
};
// Fail if a tested module attempts to load project secrets or make an external HTTP call.
const originalRead = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (typeof file === 'string' && /^\\.env(?:\\.|$)/.test(path.basename(file))) throw new Error('Project env loading is forbidden in isolated tests');
  return originalRead.call(this, file, ...args);
};
for (const protocol of ['node:http', 'node:https']) {
  const api = require(protocol);
  for (const method of ['request', 'get']) {
    const original = api[method];
    api[method] = function(input, ...args) {
      const endpoint = typeof input === 'string' || input instanceof URL ? new URL(input) : input || {};
      if (protocol !== 'node:http' || (endpoint.hostname || endpoint.host) !== '127.0.0.1' ||
          !process.env.UNIAPPX_TEST_HTTP_PORT || String(endpoint.port) !== process.env.UNIAPPX_TEST_HTTP_PORT) {
        throw new Error('Only this run\\'s loopback test HTTP server is allowed');
      }
      return original.call(this, input, ...args);
    };
  }
}
global.fetch = async () => { throw new Error('Real fetch requests are forbidden in isolated tests'); };
`);
  const failures = [];
  for (const file of ['student-identity.database.test.cjs', 'uniappx-account-contract.database.test.cjs', 'uniappx-app-login.database.test.cjs']) {
    console.log('TEST:', file);
    try {
      const output = await execute(process.execPath, ['--require', preload, path.join(backend, 'test', file)], env, 180000);
      console.log(output.trim());
    } catch (error) { failures.push(file); console.error(error.message); }
  }
  if (failures.length) throw new Error(`Failed isolated suites: ${failures.join(', ')}`);
  console.log('PASS: isolated student identity, agreement, App identity and login database contracts.');
}
main().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; }).finally(cleanup);
