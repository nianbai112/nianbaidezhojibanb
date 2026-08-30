const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildSelfHostedRelease } = require('./self-hosted-release.cjs');

function write(root, relative, content = '') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function fixture(version = '1.0.45-selfhosted.1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-selfhost-source-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-selfhost-out-'));
  const pkg = JSON.stringify({ name: 'fixture', version }, null, 2);
  write(root, 'package.json', pkg);
  write(root, 'backend/package.json', pkg);
  write(root, 'backend/package-lock.json', JSON.stringify({ name: 'fixture', version, lockfileVersion: 3, packages: {} }));
  write(root, 'backend/dist/src/main.js', 'console.log("ready")\n');
  write(root, 'backend/dist/src/worker.js', 'console.log("worker ready")\n');
  write(root, 'backend/dist/src/realtime.js', 'console.log("realtime ready")\n');
  write(root, 'backend/dist/src/app.module.js', 'exports.AppModule = class AppModule {}\n');
  write(root, 'backend/dist/src/modules/upload/upload.controller.js', 'exports.UploadController = class UploadController {}\n');
  write(root, 'backend/prisma/schema.mysql.prisma', 'datasource db { provider = "mysql" url = env("DATABASE_URL") }\n');
  write(root, 'backend/prisma/schema.postgresql.prisma', 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\n');
  write(root, 'backend/scripts/migrate-release.cjs', 'process.exit(0)\n');
  write(root, 'backend/scripts/sync-prisma-schema-variants.cjs', 'process.exit(0)\n');
  write(root, 'backend/scripts/audit-official-assistant-data.cjs', 'process.exit(0)\n');
  write(root, 'backend/scripts/backfill-official-support-links.cjs', 'process.exit(0)\n');
  write(root, 'backend/scripts/smoke-official-support-schema.cjs', 'process.exit(0)\n');
  write(root, 'admin/package.json', pkg);
  write(root, 'admin/dist/index.html', '<html>admin</html>\n');
  write(root, 'site/package.json', pkg);
  write(root, 'site/dist/index.html', '<html>site</html>\n');
  write(root, 'deploy/VERSION', `${version}\n`);
  write(root, 'deploy/env.backend.example', 'NODE_ENV=production\nSETUP_WIZARD=true\n');
  write(root, 'deploy/scripts/install.sh', '#!/usr/bin/env bash\nexit 0\n');
  write(root, 'deploy/scripts/update.sh', '#!/usr/bin/env bash\nexit 0\n');
  write(root, 'deploy/ecosystem.config.cjs', 'module.exports = { apps: [{ script: "dist/src/main.js" }, { script: "dist/src/worker.js" }, { script: "dist/src/realtime.js" }] };\n');
  write(root, 'deploy/nginx/portal-site.conf.sample', 'server { listen 80; }\n');
  write(root, '.env', 'DATABASE_URL=must-not-ship\n');
  write(root, '.decorver-token', 'must-not-ship\n');
  return { root, out, version };
}

test('builds a runtime-only archive and hashes every staged file', () => {
  const { root, out, version } = fixture();
  const result = buildSelfHostedRelease({ sourceRoot: root, outputDir: out, version });

  assert.equal(fs.existsSync(result.archivePath), true);
  const entries = execFileSync('unzip', ['-Z1', result.archivePath], { encoding: 'utf8' });
  assert.match(entries, /backend\/dist\/src\/main\.js/);
  assert.match(entries, /backend\/dist\/src\/worker\.js/);
  assert.match(entries, /backend\/dist\/src\/realtime\.js/);
  assert.match(entries, /release-manifest\.json/);
  assert.match(entries, /ecosystem\.config\.cjs/);
  assert.match(entries, /backend\/scripts\/audit-official-assistant-data\.cjs/);
  assert.match(entries, /backend\/scripts\/backfill-official-support-links\.cjs/);
  assert.match(entries, /backend\/scripts\/smoke-official-support-schema\.cjs/);
  assert.doesNotMatch(entries, /(^|\/)\.env$/m);
  assert.doesNotMatch(entries, /decorver-token|node_modules|backend\/src\//);

  const manifestText = execFileSync('unzip', ['-p', result.archivePath, '*/release-manifest.json'], { encoding: 'utf8' });
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.version, version);
  assert.equal(manifest.packageType, 'self-hosted');
  assert.equal(manifest.containsSource, false);
  assert.equal(manifest.containsNodeModules, false);
  assert.ok(Object.keys(manifest.files).length >= 10);
  assert.match(manifest.files['backend/dist/src/main.js'], /^[a-f0-9]{64}$/);
  assert.match(manifest.files['backend/dist/src/worker.js'], /^[a-f0-9]{64}$/);
  assert.match(manifest.files['backend/dist/src/realtime.js'], /^[a-f0-9]{64}$/);
});

test('requires the production process configuration', () => {
  const { root, out, version } = fixture();
  fs.rmSync(path.join(root, 'deploy/ecosystem.config.cjs'));

  assert.throws(
    () => buildSelfHostedRelease({ sourceRoot: root, outputDir: out, version }),
    /missing release input: deploy\/ecosystem\.config\.cjs/i,
  );
});

test('can consume build artifacts from a non-iCloud staging root', () => {
  const { root, out, version } = fixture();
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-selfhost-artifacts-'));
  for (const relative of ['backend/dist', 'admin/dist', 'site/dist']) {
    const source = path.join(root, relative);
    const target = path.join(artifactRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
  }

  const result = buildSelfHostedRelease({ sourceRoot: root, artifactRoot, outputDir: out, version });
  const entries = execFileSync('unzip', ['-Z1', result.archivePath], { encoding: 'utf8' });
  assert.match(entries, /backend\/dist\/src\/main\.js/);
  assert.match(entries, /admin\/dist\/index\.html/);
  assert.match(entries, /site\/dist\/index\.html/);
});

test('rejects a compiled backend that still registers commercial licensing', () => {
  const { root, out, version } = fixture();
  write(root, 'backend/dist/src/app.module.js', 'imports: [LicenseRuntimeModule]\n');

  assert.throws(
    () => buildSelfHostedRelease({ sourceRoot: root, outputDir: out, version }),
    /commercial licensing marker/i,
  );
});

test('rejects mismatched application versions', () => {
  const { root, out, version } = fixture();
  write(root, 'admin/package.json', JSON.stringify({ name: 'admin', version: '9.9.9' }));

  assert.throws(
    () => buildSelfHostedRelease({ sourceRoot: root, outputDir: out, version }),
    /version mismatch/i,
  );
});
