#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${1:?missing app dir}"
ZIP_FILE="${2:?missing zip file}"
STATUS_FILE="${3:?missing status file}"
TARGET_VERSION="${4:-unknown}"
RELEASE_ID="${5:-}"
COMPONENT="${6:-full}"
TASK_ID="${7:-legacy-$(date +%s)}"
UPDATE_DIR="$APP_DIR/storage/updates"
BACKUP_DIR="$APP_DIR/storage/backups"
LOG_FILE="$UPDATE_DIR/update-runner.log"
LOCK_DIR="$UPDATE_DIR/apply.lock"
WORK_DIR=""
BACKUP_FILE=""
CURRENT_STEP="初始化"
RUNNER_PID="$$"
HEARTBEAT_PID=""

mkdir -p "$UPDATE_DIR" "$BACKUP_DIR"
exec >>"$LOG_FILE" 2>&1

write_status() {
  local state="$1"
  local message="$2"
  node - "$STATUS_FILE" "$state" "$message" "$TARGET_VERSION" "$RELEASE_ID" "$COMPONENT" "$CURRENT_STEP" "$TASK_ID" "$RUNNER_PID" <<'NODE'
const fs = require("fs");
const path = require("path");
const [file, status, message, targetVersion, releaseId, component, step, taskId, runnerPid] = process.argv.slice(2);
const now = new Date().toISOString();
let previous = {};
try { previous = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
const next = { ...previous, status, message, step, targetVersion, releaseId, component, taskId, runnerPid: Number(runnerPid), heartbeatAt: now, updatedAt: now };
if (!next.startedAt) next.startedAt = now;
if (["success", "failed", "rolled_back"].includes(status)) next.finishedAt = now;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(next, null, 2));
NODE
}

touch_heartbeat() {
  node - "$STATUS_FILE" "$TASK_ID" <<'NODE'
const fs = require("fs");
const [file, taskId] = process.argv.slice(2);
try {
  const current = JSON.parse(fs.readFileSync(file, "utf8"));
  if (current.status !== "running" || String(current.taskId || "") !== taskId) process.exit(0);
  current.heartbeatAt = new Date().toISOString();
  current.updatedAt = current.heartbeatAt;
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
} catch {}
NODE
}

start_heartbeat() {
  (
    while kill -0 "$RUNNER_PID" 2>/dev/null; do
      sleep 15
      kill -0 "$RUNNER_PID" 2>/dev/null || exit 0
      touch_heartbeat
    done
  ) &
  HEARTBEAT_PID="$!"
}

stop_heartbeat() {
  if [ -n "$HEARTBEAT_PID" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
  fi
  HEARTBEAT_PID=""
}

release_lock() {
  local owner=""
  [ -f "$LOCK_DIR/pid" ] && owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  [ "$owner" = "$RUNNER_PID" ] && rm -rf "$LOCK_DIR" 2>/dev/null || true
}

cleanup() {
  stop_heartbeat
  release_lock
}

restart_app() {
  cd "$APP_DIR"
  if command -v pm2 >/dev/null 2>&1 && [ -f ecosystem.config.js ]; then
    pm2 startOrReload ecosystem.config.js --env production || pm2 restart lingmeng-backend --update-env
    pm2 save || true
  elif [ -f restart.sh ]; then
    bash restart.sh
  else
    return 1
  fi
}

health_check() {
  local port health_path
  port="$(grep '^PORT=' "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d '=' -f2- | tr -d '"' || true)"
  port="${port:-3000}"
  health_path="${UPDATE_HEALTH_PATH:-/healthz}"
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  for _ in $(seq 1 45); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}${health_path}" >/dev/null 2>&1; then
      local diagnostics_code
      diagnostics_code="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/admin/license-runtime/diagnostics" || true)"
      if [ "$diagnostics_code" != "000" ] && [ "$diagnostics_code" != "404" ]; then return 0; fi
    fi
    sleep 2
  done
  return 1
}

rollback_files() {
  [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] || return 1
  CURRENT_STEP="回滚旧版文件"
  write_status running "新版健康检查失败，正在自动回滚旧版文件"
  tar -xzf "$BACKUP_FILE" -C "$APP_DIR"
  restart_app || true
  health_check
}

on_error() {
  local line="$1"
  local message="更新失败：${CURRENT_STEP}（第 ${line} 行）"
  if [ "$CURRENT_STEP" = "验证新版健康状态" ] && rollback_files; then
    write_status rolled_back "${message}，已自动恢复旧版本"
  else
    write_status failed "$message"
  fi
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR" 2>/dev/null || true
  exit 1
}
trap 'on_error $LINENO' ERR
trap 'write_status failed "更新任务被系统中断，可重新执行"; exit 1' HUP INT TERM
trap cleanup EXIT

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "已有更新任务在执行，本次未重复启动"
    exit 1
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
printf '%s\n' "$RUNNER_PID" > "$LOCK_DIR/pid"
start_heartbeat

CURRENT_STEP="校验更新包"
write_status running "正在校验并解压更新包"
[ -f "$ZIP_FILE" ]
WORK_DIR="$(mktemp -d "$UPDATE_DIR/work-${TARGET_VERSION}-XXXXXX")"
unzip -q "$ZIP_FILE" -d "$WORK_DIR"

PAYLOAD_DIR=""
if [ -f "$WORK_DIR/release-manifest.json" ] && { [ -d "$WORK_DIR/backend" ] || [ -d "$WORK_DIR/admin" ]; }; then
  PAYLOAD_DIR="$WORK_DIR"
else
  while IFS= read -r candidate; do
    if [ -f "$candidate/release-manifest.json" ] && { [ -d "$candidate/backend" ] || [ -d "$candidate/admin" ]; }; then PAYLOAD_DIR="$candidate"; break; fi
  done < <(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
fi
[ -n "$PAYLOAD_DIR" ] || { echo "更新包缺少 release-manifest.json"; false; }

MANIFEST_VERSION="$(node -e "const m=require(process.argv[1]);process.stdout.write(String(m.version||''))" "$PAYLOAD_DIR/release-manifest.json")"
[ "$MANIFEST_VERSION" = "$TARGET_VERSION" ] || { echo "包版本 $MANIFEST_VERSION 与目标版本 $TARGET_VERSION 不一致"; false; }

case "$COMPONENT" in
  full) [ -d "$PAYLOAD_DIR/backend/dist" ] && [ -d "$PAYLOAD_DIR/admin/dist" ] ;;
  backend|database) [ -d "$PAYLOAD_DIR/backend/dist" ] ;;
  admin) [ -d "$PAYLOAD_DIR/admin/dist" ] ;;
  *) echo "不支持的更新范围：$COMPONENT"; false ;;
esac

CURRENT_STEP="准备新版运行环境"
write_status running "正在准备新版依赖"
if [ -d "$PAYLOAD_DIR/backend" ] && [ "$COMPONENT" != "admin" ]; then
  [ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" "$PAYLOAD_DIR/backend/.env"
  cd "$PAYLOAD_DIR/backend"
  NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
  ARCHIVE=""
  if [ -d "$PAYLOAD_DIR/deps" ]; then
    ARCHIVE="$(find "$PAYLOAD_DIR/deps" -maxdepth 1 -type f -name "backend-node_modules-linux-*-node${NODE_MAJOR}.tar.gz" | head -1 || true)"
  fi
  if [ -n "$ARCHIVE" ]; then
    rm -rf node_modules
    tar -xzf "$ARCHIVE" -C "$PAYLOAD_DIR/backend"
    npm rebuild --omit=dev --no-audit --no-fund || true
  else
    npm install --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline
  fi
  node -e "require('bcrypt')"
  node node_modules/prisma/build/index.js generate --schema "prisma/schema.$(node -e "const fs=require('fs');const t=fs.readFileSync('.env','utf8');const p=(t.match(/^DB_PROVIDER=(.*)$/m)||[])[1]||'';const u=(t.match(/^DATABASE_URL=(.*)$/m)||[])[1]||'';process.stdout.write((p.trim().replace(/[\"']/g,'')||(/^(postgres|postgresql):/.test(u)?'postgresql':'mysql')).replace('postgres','postgresql'))").prisma"
fi

CURRENT_STEP="备份当前系统"
write_status running "正在备份当前文件和数据库"
BACKUP_FILE="$BACKUP_DIR/update-${TARGET_VERSION}-$(date +%Y%m%d-%H%M%S)-files.tar.gz"
tar --warning=no-file-changed --ignore-failed-read \
  --exclude='./storage' --exclude='./backups' --exclude='./.npm-cache' \
  --exclude='./backend/node_modules' --exclude='./*.zip' \
  -czf "$BACKUP_FILE" -C "$APP_DIR" .

if [ -d "$PAYLOAD_DIR/backend" ] && [ "$COMPONENT" != "admin" ]; then
  DB_BACKUP="$BACKUP_DIR/update-${TARGET_VERSION}-$(date +%Y%m%d-%H%M%S)-database.sql"
  node - "$PAYLOAD_DIR/backend/.env" "$DB_BACKUP" <<'NODE'
const child = require("child_process");
const fs = require("fs");
const [envFile, output] = process.argv.slice(2);
const text = fs.readFileSync(envFile, "utf8");
const raw = (text.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!raw) throw new Error("DATABASE_URL 为空");
const url = new URL(raw);
if (url.protocol !== "mysql:") process.exit(0);
const candidates = ["mysqldump", "/www/server/mysql/bin/mysqldump"];
const command = candidates.find((item) => item.includes("/") ? fs.existsSync(item) : child.spawnSync("sh", ["-c", `command -v ${item}`]).status === 0);
if (!command) throw new Error("缺少 mysqldump，已拒绝在无数据库备份时更新");
const fd = fs.openSync(output, "w");
const result = child.spawnSync(command, ["--single-transaction", "--quick", "--routines", "--triggers", "-h", url.hostname, "-P", url.port || "3306", "-u", decodeURIComponent(url.username), decodeURIComponent(url.pathname.slice(1))], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ["ignore", fd, "inherit"] });
fs.closeSync(fd);
if (result.status !== 0) throw new Error(`mysqldump 失败，退出码 ${result.status}`);
NODE
fi

if [ -d "$PAYLOAD_DIR/backend" ] && [ "$COMPONENT" != "admin" ]; then
  CURRENT_STEP="执行版本数据库迁移"
  write_status running "正在执行带 checksum 的版本迁移"
  cd "$PAYLOAD_DIR/backend"
  node scripts/migrate-release.cjs apply
  if [ -f dist/prisma/seed.js ]; then node dist/prisma/seed.js; fi
fi

sync_dir() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then rsync -a --delete "$src/" "$dst/"; else rm -rf "$dst"; mkdir -p "$dst"; cp -R "$src/." "$dst/"; fi
}

CURRENT_STEP="切换新版文件"
write_status running "数据库已校验，正在切换新版文件"
OLD_ENV="$WORK_DIR/backend.env"
[ -f "$APP_DIR/backend/.env" ] && cp "$APP_DIR/backend/.env" "$OLD_ENV"
[ -d "$PAYLOAD_DIR/backend" ] && [ "$COMPONENT" != "admin" ] && sync_dir "$PAYLOAD_DIR/backend" "$APP_DIR/backend"
[ -d "$PAYLOAD_DIR/admin" ] && [ "$COMPONENT" != "backend" ] && [ "$COMPONENT" != "database" ] && sync_dir "$PAYLOAD_DIR/admin" "$APP_DIR/admin"
[ -d "$PAYLOAD_DIR/site" ] && [ "$COMPONENT" = "full" ] && sync_dir "$PAYLOAD_DIR/site" "$APP_DIR/site"
[ -d "$PAYLOAD_DIR/deps" ] && sync_dir "$PAYLOAD_DIR/deps" "$APP_DIR/deps"
[ -f "$OLD_ENV" ] && cp "$OLD_ENV" "$APP_DIR/backend/.env"
[ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" "$APP_DIR/backend/.env"
for file in release-manifest.json ecosystem.config.js restart.sh backup.sh cleanup.sh configure-nginx.sh; do
  [ -f "$PAYLOAD_DIR/$file" ] && cp "$PAYLOAD_DIR/$file" "$APP_DIR/$file"
done
mkdir -p "$APP_DIR/deploy"
printf '%s\n' "$TARGET_VERSION" > "$APP_DIR/deploy/VERSION"

CURRENT_STEP="验证新版健康状态"
write_status running "正在重启并校验新版本"
restart_app
health_check

CURRENT_STEP="提交更新"
stop_heartbeat
write_status success "更新完成：下载、备份、迁移、切换、重启和健康检查均已通过"
rm -rf "$WORK_DIR"
find "$BACKUP_DIR" -type f -name 'update-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | tail -n +7 | cut -d ' ' -f2- | xargs -r rm -f
