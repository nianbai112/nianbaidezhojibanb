#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SOURCE_ENTRIES = [
  '.eslintrc.js',
  '.gitignore',
  '.node-version',
  '.nvmrc',
  '.github',
  'package.json',
  'package-lock.json',
  'backend/.dockerignore',
  'backend/.env.example',
  'backend/.gitignore',
  'backend/Dockerfile',
  'backend/docker-compose.yml',
  'backend/jest.aud.config.js',
  'backend/nest-cli.json',
  'backend/package.json',
  'backend/package-lock.json',
  'backend/tsconfig.json',
  'backend/prisma',
  'backend/scripts',
  'backend/src',
  'admin/components.d.ts',
  'admin/index.html',
  'admin/package.json',
  'admin/package-lock.json',
  'admin/tsconfig.json',
  'admin/tsconfig.node.json',
  'admin/vite.config.ts',
  'admin/public',
  'admin/scripts',
  'admin/src',
  'site/index.html',
  'site/package.json',
  'site/vite.config.ts',
  'site/public',
  'site/src',
  'site/tests',
  'contracts',
  'deploy',
  'minitest',
  'utils/checkApiContract.js',
  'utils/checkApiContract.test.cjs',
  'utils/checkNodeVersion.js',
  'utils/updateAndInstall.js',
];

const DEPENDENCY_OR_BUILD_PATH = /(^|\/)(?:\.git|node_modules(?: [0-9]+)?|dist(?: [0-9]+)?|coverage)(\/|$)/i;
const RUNTIME_DATA_PATH = /^(?:backend\/)?(?:logs?|uploads?|storage|output|\.local-logs)(\/|$)/i;
const FORBIDDEN_BASENAMES = new Set([
  '.ds_store',
  '.env',
  '.env.local',
  '.decorver-token',
  'id_rsa',
  'id_ed25519',
]);
const COMMERCIAL_RUNTIME_MARKERS = [
  'LicenseRuntimeModule',
  'license-runtime',
  'LICENSING_ENABLED',
  'LICENSE_KEY',
  '授权中心',
  '授权与更新',
  'protectedModules',
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function copySourceEntry(sourceRoot, stageRoot, relative) {
  const source = path.join(sourceRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`missing source entry: ${relative}`);
  const visit = (currentSource, currentTarget) => {
    const stat = fs.lstatSync(currentSource);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${normalizeRelative(sourceRoot, currentSource)}`);
    if (stat.isDirectory()) {
      fs.mkdirSync(currentTarget, { recursive: true });
      for (const name of fs.readdirSync(currentSource).sort()) {
        if (name.toLowerCase() === '.ds_store') continue;
        visit(path.join(currentSource, name), path.join(currentTarget, name));
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`unsupported source entry: ${normalizeRelative(sourceRoot, currentSource)}`);
    fs.mkdirSync(path.dirname(currentTarget), { recursive: true });
    fs.copyFileSync(currentSource, currentTarget);
    fs.chmodSync(currentTarget, stat.mode & 0o777);
  };
  visit(source, path.join(stageRoot, relative));
}

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`unsupported staged entry: ${normalizeRelative(root, absolute)}`);
    }
  };
  visit(root);
  return files;
}

function assertVersions(sourceRoot, version) {
  for (const relative of ['package.json', 'backend/package.json', 'admin/package.json', 'site/package.json']) {
    const actual = JSON.parse(fs.readFileSync(path.join(sourceRoot, relative), 'utf8')).version;
    if (actual !== version) throw new Error(`version mismatch: ${relative} is ${actual}, expected ${version}`);
  }
  const deployVersion = fs.readFileSync(path.join(sourceRoot, 'deploy/VERSION'), 'utf8').trim();
  if (deployVersion !== version) throw new Error(`version mismatch: deploy/VERSION is ${deployVersion}, expected ${version}`);
}

function assertSafeStage(stageRoot) {
  let dataless = '';
  if (process.platform === 'darwin') {
    dataless = execFileSync('find', [stageRoot, '-flags', '+dataless', '-type', 'f'], { encoding: 'utf8' }).trim();
  }
  if (dataless) throw new Error(`dataless file staged: ${dataless.split('\n')[0]}`);

  for (const file of listFiles(stageRoot)) {
    const relative = normalizeRelative(stageRoot, file);
    const basename = path.basename(file).toLowerCase();
    if (DEPENDENCY_OR_BUILD_PATH.test(relative) || RUNTIME_DATA_PATH.test(relative) || FORBIDDEN_BASENAMES.has(basename) || basename.endsWith('.tsbuildinfo')) {
      throw new Error(`dependency, runtime or sensitive file staged: ${relative}`);
    }
    const stat = fs.statSync(file);
    if (stat.size > 16 * 1024 * 1024) continue;
    const content = fs.readFileSync(file);
    if (content.includes(0)) continue;
    const text = content.toString('utf8');
    const secretPattern = SECRET_PATTERNS.find((pattern) => pattern.test(text));
    if (secretPattern) throw new Error(`secret-like content staged: ${relative}`);
    if (/^(backend\/src|admin\/src|deploy|contracts)\//.test(relative)) {
      const marker = COMMERCIAL_RUNTIME_MARKERS.find((value) => text.includes(value));
      if (marker) throw new Error(`commercial authorization marker ${marker} staged in ${relative}`);
    }
  }
}

function handoffReadme(version) {
  return `# 灵萌完整源码交付包\n\n` +
    `版本：${version}\n\n` +
    `这是不携带第三方依赖和本地运行数据的完整源码包。交付包包含 NestJS 后端、Vue 运营后台、Vue 官网、Prisma Schema 与迁移、API 合同、测试和生产部署脚本。\n\n` +
    `## 不包含的内容\n\n` +
    `- node_modules 和任何已安装的 npm 依赖\n` +
    `- dist、构建缓存和类型检查临时文件\n` +
    `- .env、密码、Token、密钥和服务器配置\n` +
    `- 日志、上传文件、备份、本地数据库和 Git 历史\n` +
    `- 商业授权中心及授权码运行逻辑\n\n` +
    `## 首次启动\n\n` +
    `1. 安装 Node.js 22、MySQL 8 和 Redis 7。\n` +
    `2. 在根目录执行 \`npm ci\`安装锁定版本的依赖。\n` +
    `3. 将 \`backend/.env.example\` 复制为 \`backend/.env\`，并自行填写强随机密码和业务密钥。\n` +
    `4. 执行 \`npm run db:generate\`，然后使用 \`npm run dev:backend\`、\`npm run dev:admin\` 和 \`npm run dev:site\` 启动开发环境。\n` +
    `5. 生产部署参考 \`deploy/\` 中的安装脚本、PM2 配置和 Nginx 模板。\n\n` +
    `注意：“无依赖”表示交付包未夹带 node_modules；项目仍需按 package-lock.json 执行 npm ci 安装开源依赖。\n`;
}

function buildSourceHandoff({ sourceRoot, outputDir, version, dateTag }) {
  sourceRoot = path.resolve(sourceRoot || process.cwd());
  outputDir = path.resolve(outputDir || path.join(sourceRoot, 'output'));
  version = version || JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).version;
  dateTag = dateTag || new Date().toISOString().slice(0, 10).replaceAll('-', '');
  assertVersions(sourceRoot, version);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-source-handoff-'));
  const packageName = `lingmeng-complete-source-${version}-${dateTag}`;
  const stageRoot = path.join(temporaryRoot, packageName);
  fs.mkdirSync(stageRoot, { recursive: true });

  try {
    for (const entry of SOURCE_ENTRIES) copySourceEntry(sourceRoot, stageRoot, entry);
    fs.writeFileSync(path.join(stageRoot, 'README-交付说明.md'), handoffReadme(version));
    assertSafeStage(stageRoot);

    const files = {};
    for (const file of listFiles(stageRoot)) files[normalizeRelative(stageRoot, file)] = sha256(file);
    const manifest = {
      name: 'lingmeng',
      version,
      packageType: 'complete-source-handoff',
      builtAt: new Date().toISOString(),
      containsSource: true,
      containsNodeModules: false,
      dependenciesBundled: false,
      installRequired: true,
      files,
    };
    fs.writeFileSync(path.join(stageRoot, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    assertSafeStage(stageRoot);

    fs.mkdirSync(outputDir, { recursive: true });
    const archivePath = path.join(outputDir, `${packageName}.zip`);
    if (fs.existsSync(archivePath)) throw new Error(`output already exists: ${archivePath}`);
    execFileSync('zip', ['-q', '-r', archivePath, packageName], { cwd: temporaryRoot, stdio: 'inherit' });
    return { archivePath, packageName, manifest, sha256: sha256(archivePath) };
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
  const result = buildSourceHandoff({
    sourceRoot: value('--source-root') || process.cwd(),
    outputDir: value('--output-dir'),
    version: value('--version'),
    dateTag: value('--date-tag'),
  });
  process.stdout.write(`${JSON.stringify({
    archivePath: result.archivePath,
    packageName: result.packageName,
    sha256: result.sha256,
    fileCount: Object.keys(result.manifest.files).length,
  }, null, 2)}\n`);
}

if (require.main === module) cli();

module.exports = { buildSourceHandoff };
