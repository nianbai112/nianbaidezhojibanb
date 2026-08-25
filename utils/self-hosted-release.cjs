#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMMERCIAL_LICENSE_MARKERS = [
  'LicenseRuntimeModule',
  'license-runtime',
  'LICENSING_ENABLED',
  'LICENSE_KEY',
  '授权中心',
  '授权与更新',
];

const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.decorver-token',
  'id_rsa',
  'id_ed25519',
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readVersion(filePath) {
  if (path.basename(filePath) === 'VERSION') return fs.readFileSync(filePath, 'utf8').trim();
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).version;
}

function copyRequired(sourceRoot, stageRoot, sourceRelative, targetRelative = sourceRelative) {
  const source = path.join(sourceRoot, sourceRelative);
  if (!fs.existsSync(source)) throw new Error(`missing release input: ${sourceRelative}`);
  const target = path.join(stageRoot, targetRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true });
}

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`unsupported release entry: ${path.relative(root, absolute)}`);
    }
  };
  visit(root);
  return files.sort();
}

function assertSafeStage(stageRoot) {
  let dataless = '';
  try {
    dataless = execFileSync('find', [stageRoot, '-flags', '+dataless', '-type', 'f'], { encoding: 'utf8' }).trim();
  } catch (error) {
    if (process.platform === 'darwin' && error.status !== 0) throw error;
  }
  if (dataless) throw new Error(`dataless release input: ${dataless.split('\n')[0]}`);

  for (const file of listFiles(stageRoot)) {
    const relative = path.relative(stageRoot, file).split(path.sep).join('/');
    const basename = path.basename(file).toLowerCase();
    const dependencyPath = /(^|\/)node_modules(\/|$)/i.test(relative);
    const runtimePath = /^(backend\/)?(logs?|uploads?|storage)(\/|$)/i.test(relative);
    if (SENSITIVE_BASENAMES.has(basename) || dependencyPath || runtimePath) {
      throw new Error(`sensitive or runtime file staged: ${relative}`);
    }
    const stat = fs.statSync(file);
    if (stat.size > 12 * 1024 * 1024) continue;
    const content = fs.readFileSync(file);
    if (content.includes(0)) continue;
    const text = content.toString('utf8');
    const marker = COMMERCIAL_LICENSE_MARKERS.find((value) => text.includes(value));
    if (marker) throw new Error(`commercial licensing marker ${marker} in ${relative}`);
  }
}

function assertVersions(sourceRoot, version) {
  const files = ['package.json', 'backend/package.json', 'admin/package.json', 'site/package.json', 'deploy/VERSION'];
  for (const relative of files) {
    const actual = readVersion(path.join(sourceRoot, relative));
    if (actual !== version) throw new Error(`version mismatch: ${relative} is ${actual}, expected ${version}`);
  }
}

function buildSelfHostedRelease({ sourceRoot, artifactRoot, outputDir, version }) {
  if (!sourceRoot || !outputDir || !version) throw new Error('sourceRoot, outputDir and version are required');
  sourceRoot = path.resolve(sourceRoot);
  artifactRoot = path.resolve(artifactRoot || sourceRoot);
  outputDir = path.resolve(outputDir);
  assertVersions(sourceRoot, version);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-selfhost-build-'));
  const packageName = `lingmeng-selfhosted-${version}`;
  const stageRoot = path.join(temporaryRoot, packageName);
  fs.mkdirSync(stageRoot, { recursive: true });

  try {
    copyRequired(artifactRoot, stageRoot, 'backend/dist');
    copyRequired(sourceRoot, stageRoot, 'backend/package.json');
    copyRequired(sourceRoot, stageRoot, 'backend/package-lock.json');
    copyRequired(sourceRoot, stageRoot, 'backend/prisma');
    copyRequired(sourceRoot, stageRoot, 'backend/scripts/migrate-release.cjs');
    copyRequired(sourceRoot, stageRoot, 'backend/scripts/sync-prisma-schema-variants.cjs');
    copyRequired(sourceRoot, stageRoot, 'backend/scripts/audit-official-assistant-data.cjs');
    copyRequired(sourceRoot, stageRoot, 'backend/scripts/backfill-official-support-links.cjs');
    copyRequired(sourceRoot, stageRoot, 'backend/scripts/smoke-official-support-schema.cjs');
    copyRequired(artifactRoot, stageRoot, 'admin/dist');
    copyRequired(artifactRoot, stageRoot, 'site/dist');
    copyRequired(sourceRoot, stageRoot, 'deploy/env.backend.example', '.env.example');
    copyRequired(sourceRoot, stageRoot, 'deploy/scripts/install.sh', 'install.sh');
    copyRequired(sourceRoot, stageRoot, 'deploy/scripts/update.sh', 'update.sh');
    copyRequired(sourceRoot, stageRoot, 'deploy/nginx', 'nginx');
    copyRequired(sourceRoot, stageRoot, 'deploy/VERSION', 'VERSION');
    copyRequired(sourceRoot, stageRoot, 'deploy/ecosystem.config.cjs', 'ecosystem.config.cjs');

    assertSafeStage(stageRoot);
    const files = {};
    for (const file of listFiles(stageRoot)) {
      files[path.relative(stageRoot, file).split(path.sep).join('/')] = sha256(file);
    }
    const manifest = {
      name: 'lingmeng',
      version,
      packageType: 'self-hosted',
      builtAt: new Date().toISOString(),
      platform: 'linux-x64-node22',
      containsSource: false,
      containsNodeModules: false,
      files,
    };
    fs.writeFileSync(path.join(stageRoot, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    assertSafeStage(stageRoot);

    fs.mkdirSync(outputDir, { recursive: true });
    const archivePath = path.join(outputDir, `${packageName}.zip`);
    if (fs.existsSync(archivePath)) fs.rmSync(archivePath);
    execFileSync('zip', ['-q', '-r', archivePath, packageName], { cwd: temporaryRoot, stdio: 'inherit' });
    return { archivePath, manifest, packageName };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function cli() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const result = buildSelfHostedRelease({
    sourceRoot: value('--source-root') || process.cwd(),
    artifactRoot: value('--artifact-root'),
    outputDir: value('--output-dir') || path.join(process.cwd(), 'output'),
    version: value('--version'),
  });
  process.stdout.write(`${result.archivePath}\n`);
}

if (require.main === module) cli();

module.exports = { buildSelfHostedRelease };
