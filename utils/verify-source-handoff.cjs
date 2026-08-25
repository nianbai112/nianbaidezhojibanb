#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const archivePath = path.resolve(process.argv[2] || '');
if (!archivePath || !fs.existsSync(archivePath)) throw new Error('archive path is required');

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const normalize = (root, target) => path.relative(root, target).split(path.sep).join('/');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-source-verify-'));

try {
  execFileSync('unzip', ['-tq', archivePath], { stdio: 'pipe' });
  execFileSync('unzip', ['-q', archivePath, '-d', temporaryRoot], { stdio: 'pipe' });
  const roots = fs.readdirSync(temporaryRoot).filter((name) => !name.startsWith('__MACOSX'));
  if (roots.length !== 1) throw new Error(`archive must contain exactly one root directory, found ${roots.length}`);
  const root = path.join(temporaryRoot, roots[0]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json'), 'utf8'));

  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) throw new Error(`manifest file missing: ${relative}`);
    if (sha256(file) !== expected) throw new Error(`manifest hash mismatch: ${relative}`);
  }

  const actual = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic link found: ${normalize(root, absolute)}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) actual.push(normalize(root, absolute));
      else throw new Error(`unsupported archive entry: ${normalize(root, absolute)}`);
    }
  };
  visit(root);

  const tracked = actual.filter((relative) => relative !== 'source-manifest.json');
  if (tracked.length !== Object.keys(manifest.files).length) throw new Error('manifest file count mismatch');

  const forbiddenPath = /(^|\/)(?:\.git|node_modules(?: [0-9]+)?|dist(?: [0-9]+)?|coverage)(\/|$)/i;
  const runtimePath = /^(?:backend\/)?(?:logs?|uploads?|storage|output|\.local-logs)(\/|$)/i;
  for (const relative of actual) {
    const basename = path.basename(relative).toLowerCase();
    if (forbiddenPath.test(relative) || runtimePath.test(relative)) throw new Error(`forbidden package path: ${relative}`);
    if (['.env', '.env.local', '.decorver-token', '.ds_store'].includes(basename) || basename.endsWith('.tsbuildinfo')) {
      throw new Error(`sensitive package file: ${relative}`);
    }
  }

  const required = [
    'package.json',
    'package-lock.json',
    'backend/src/main.ts',
    'backend/src/app.module.ts',
    'backend/prisma/schema.prisma',
    'backend/prisma/schema.mysql.prisma',
    'backend/prisma/schema.postgresql.prisma',
    'admin/src/main.ts',
    'site/src/App.vue',
    'contracts/miniapp-backend-api.json',
    'deploy/scripts/install.sh',
    'deploy/scripts/update.sh',
    'deploy/ecosystem.config.cjs',
    'README-交付说明.md',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`required source missing: ${relative}`);
  }

  const migrationCount = actual.filter((relative) => /^backend\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(relative)).length;
  if (migrationCount !== 120) throw new Error(`unexpected migration count: ${migrationCount}`);

  const markers = [
    'LicenseRuntimeModule',
    'license-runtime',
    'LICENSING_ENABLED',
    'LICENSE_KEY',
    '授权中心',
    '授权与更新',
    'protectedModules',
  ];
  const scanRuntime = (relativeRoot) => {
    const base = path.join(root, relativeRoot);
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(absolute);
        else if (entry.isFile() && fs.statSync(absolute).size <= 16 * 1024 * 1024) {
          const content = fs.readFileSync(absolute);
          if (content.includes(0)) continue;
          const text = content.toString('utf8');
          const marker = markers.find((value) => text.includes(value));
          if (marker) throw new Error(`commercial authorization marker found: ${normalize(root, absolute)}`);
        }
      }
    };
    scan(base);
  };
  for (const relativeRoot of ['backend/src', 'admin/src', 'deploy', 'contracts']) scanRuntime(relativeRoot);

  if (manifest.containsSource !== true || manifest.containsNodeModules !== false || manifest.dependenciesBundled !== false) {
    throw new Error('invalid source package flags');
  }

  execFileSync('bash', ['-n', path.join(root, 'deploy/scripts/install.sh')]);
  execFileSync('bash', ['-n', path.join(root, 'deploy/scripts/update.sh')]);
  execFileSync(process.execPath, ['--check', path.join(root, 'utils/checkApiContract.js')]);
  execFileSync(process.execPath, ['--check', path.join(root, 'utils/checkNodeVersion.js')]);
  execFileSync(process.execPath, ['--check', path.join(root, 'utils/updateAndInstall.js')]);

  process.stdout.write(`${JSON.stringify({
    archivePath,
    archiveBytes: fs.statSync(archivePath).size,
    sha256: sha256(archivePath),
    version: manifest.version,
    verifiedManifestHashes: Object.keys(manifest.files).length,
    archiveFiles: actual.length,
    migrationCount,
    containsSource: manifest.containsSource,
    containsNodeModules: manifest.containsNodeModules,
    dependenciesBundled: manifest.dependenciesBundled,
  }, null, 2)}\n`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
