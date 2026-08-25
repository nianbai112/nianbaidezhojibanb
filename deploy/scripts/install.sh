#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/admin/dist" ]; then
  PACKAGE_ROOT="$SCRIPT_DIR"
  ENV_TEMPLATE="$PACKAGE_ROOT/.env.example"
else
  PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  ENV_TEMPLATE="$PACKAGE_ROOT/deploy/env.backend.example"
fi

APP_ROOT="${APP_ROOT:-/opt/lingmeng}"
BACKEND_DIR="$APP_ROOT/backend"
ADMIN_DIST="$APP_ROOT/admin/dist"
SITE_DIST="$APP_ROOT/site/dist"
PM2_NAME="${PM2_NAME:-lingmeng-backend}"
VERSION="$(cat "$PACKAGE_ROOT/VERSION" 2>/dev/null || cat "$PACKAGE_ROOT/deploy/VERSION")"

echo "== Lingmeng self-hosted $VERSION install =="
echo "Package: $PACKAGE_ROOT"
echo "Target : $APP_ROOT"

missing=""
need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "OK  $1: $(command -v "$1")"
  else
    echo "MISS $1"
    missing="$missing $1"
  fi
}

need_cmd node
need_cmd npm
need_cmd pm2
need_cmd redis-cli
need_cmd ffmpeg
if command -v nginx >/dev/null 2>&1 || [ -x /www/server/nginx/sbin/nginx ]; then
  echo "OK  nginx"
else
  echo "MISS nginx"
  missing="$missing nginx"
fi

configured_provider="$(grep '^DB_PROVIDER=' "$ENV_TEMPLATE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]')"
configured_provider="${configured_provider:-mysql}"
if [ "$configured_provider" = "postgres" ]; then configured_provider="postgresql"; fi
if [ "$configured_provider" = "mysql" ]; then need_cmd mysql; else need_cmd psql; fi

if [ -n "$missing" ]; then
  echo "Missing runtime tools:$missing"
  exit 1
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -ne 22 ]; then
  echo "Lingmeng self-hosted requires Node.js 22.x, current: $(node -v)"
  exit 1
fi

mkdir -p "$BACKEND_DIR" "$ADMIN_DIST" "$SITE_DIST" "$APP_ROOT/logs"
chmod 0755 "$APP_ROOT" "$(dirname "$ADMIN_DIST")" "$ADMIN_DIST" "$(dirname "$SITE_DIST")" "$SITE_DIST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude ".env" \
    --exclude "node_modules" \
    --exclude "uploads" \
    --exclude "storage" \
    --exclude "logs" \
    "$PACKAGE_ROOT/backend/" "$BACKEND_DIR/"
  rsync -a --delete "$PACKAGE_ROOT/admin/dist/" "$ADMIN_DIST/"
  rsync -a --delete "$PACKAGE_ROOT/site/dist/" "$SITE_DIST/"
  rsync -a "$PACKAGE_ROOT/ecosystem.config.cjs" "$APP_ROOT/ecosystem.config.cjs"
else
  cp -R "$PACKAGE_ROOT/backend/." "$BACKEND_DIR/"
  cp -R "$PACKAGE_ROOT/admin/dist/." "$ADMIN_DIST/"
  cp -R "$PACKAGE_ROOT/site/dist/." "$SITE_DIST/"
  cp "$PACKAGE_ROOT/ecosystem.config.cjs" "$APP_ROOT/ecosystem.config.cjs"
fi
find "$(dirname "$ADMIN_DIST")" "$(dirname "$SITE_DIST")" -type d -exec chmod 0755 {} +
find "$ADMIN_DIST" "$SITE_DIST" -type f -exec chmod 0644 {} +
mkdir -p "$BACKEND_DIR/uploads" "$BACKEND_DIR/storage" "$BACKEND_DIR/logs"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$ENV_TEMPLATE" "$BACKEND_DIR/.env"
fi

write_env() {
  node - "$BACKEND_DIR/.env" "$1" "$2" <<'NODE'
const fs = require('fs');
const [file, key, value] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').replaceAll('\r', '').split('\n');
let found = false;
const next = lines.map((line) => {
  if (!line.startsWith(key + '=')) return line;
  found = true;
  return key + '=' + value;
});
if (!found) next.push(key + '=' + value);
fs.writeFileSync(file, next.filter((line, index) => line || index < next.length - 1).join('\n') + '\n');
NODE
}

read_env() {
  { grep "^$1=" "$BACKEND_DIR/.env" 2>/dev/null || true; } | tail -1 | cut -d= -f2-
}

ensure_secret() {
  local key="$1"
  local bytes="$2"
  local current
  current="$(read_env "$key")"
  case "$current" in
    ""|please-*|CHANGE_*|change-*|example-*|default-*)
      write_env "$key" "$(node -e "console.log(require('crypto').randomBytes(Number(process.argv[1])).toString('hex'))" "$bytes")"
      ;;
  esac
}

write_env APP_VERSION "$VERSION"
write_env DB_PROVIDER "$configured_provider"
ensure_secret SETUP_TOKEN 24
ensure_secret JWT_SECRET 48
ensure_secret ADMIN_JWT_SECRET 48

cd "$BACKEND_DIR"
npm ci --no-audit --no-fund
DB_PROVIDER="$configured_provider" npm run db:generate

database_url="$(read_env DATABASE_URL)"
if [ -n "$database_url" ]; then
  node scripts/migrate-release.cjs install
else
  echo "DATABASE_URL is empty; database initialization remains in the protected setup wizard."
fi

APP_ROOT="$APP_ROOT" PM2_NAME="$PM2_NAME" pm2 start "$APP_ROOT/ecosystem.config.cjs" --only "$PM2_NAME" --update-env
pm2 save

echo "Application files installed."
echo "Setup token is stored only in $BACKEND_DIR/.env"
echo "Next: configure Nginx, open /setup, finish initialization, then restart PM2."
