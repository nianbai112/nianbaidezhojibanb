const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function write(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mode) fs.chmodSync(file, mode);
}

test('package-layout installer generates setup secrets and uses the MySQL toolchain', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-install-package-'));
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lingmeng-install-target-'));
  const fakeBin = path.join(root, 'fake-bin');
  const calls = path.join(root, 'calls.log');
  fs.copyFileSync(path.resolve(__dirname, '../deploy/scripts/install.sh'), path.join(root, 'install.sh'));
  write(path.join(root, 'VERSION'), '1.0.45-selfhosted.1\n');
  write(path.join(root, 'backend/package.json'), '{"name":"fixture","scripts":{"start:prod":"node dist/src/main.js"}}\n');
  write(path.join(root, 'backend/package-lock.json'), '{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
  write(path.join(root, 'backend/dist/src/main.js'), 'console.log("ok")\n');
  write(path.join(root, 'backend/scripts/migrate-release.cjs'), 'process.exit(0)\n');
  write(path.join(root, 'admin/dist/index.html'), '<html>admin</html>\n');
  write(path.join(root, 'site/dist/index.html'), '<html>site</html>\n');
  write(path.join(root, 'ecosystem.config.cjs'), 'module.exports = { apps: [] }\n');
  write(
    path.join(root, '.env.example'),
    'NODE_ENV=production\nDB_PROVIDER=mysql\nDATABASE_URL=\nSETUP_WIZARD=true\nJWT_SECRET=\nADMIN_JWT_SECRET=\n',
  );

  for (const command of ['npm', 'mysql', 'redis-cli', 'nginx']) {
    write(path.join(fakeBin, command), `#!/usr/bin/env bash\necho "${command} $*" >> "${calls}"\nexit 0\n`, 0o755);
  }
  write(
    path.join(fakeBin, 'pm2'),
    `#!/usr/bin/env bash\necho "pm2 $*" >> "${calls}"\nif [ "$1" = "describe" ]; then exit 1; fi\nexit 0\n`,
    0o755,
  );

  const result = spawnSync('/bin/bash', [path.join(root, 'install.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_ROOT: appRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const envText = fs.readFileSync(path.join(appRoot, 'backend/.env'), 'utf8');
  assert.match(envText, /^SETUP_TOKEN=[a-f0-9]{48}$/m);
  assert.match(envText, /^JWT_SECRET=[a-f0-9]{96}$/m);
  assert.match(envText, /^ADMIN_JWT_SECRET=[a-f0-9]{96}$/m);
  assert.equal(fs.existsSync(path.join(appRoot, 'backend/dist/src/main.js')), true);
  assert.equal(fs.statSync(appRoot).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.join(appRoot, 'admin/dist')).mode & 0o777, 0o755);
  const callText = fs.readFileSync(calls, 'utf8');
  assert.match(callText, /npm ci/);
  assert.match(callText, /npm run db:generate/);
  assert.match(callText, /npm prune --omit=dev/);
  assert.ok(callText.indexOf('npm run db:generate') < callText.indexOf('npm prune --omit=dev'));
  assert.ok(callText.indexOf('npm prune --omit=dev') < callText.indexOf('pm2 start'));
  assert.match(callText, /pm2 start/);
});
