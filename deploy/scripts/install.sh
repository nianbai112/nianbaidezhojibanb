#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${APP_ROOT:-/www/wwwroot/lingmeng}"
BACKEND_DIR="$APP_ROOT/backend"
ADMIN_DIR="$APP_ROOT/admin"
SITE_DIR="$APP_ROOT/site"
PM2_NAME="${PM2_NAME:-lingmeng-backend}"

echo "== Lingmeng v1.0.24 first install =="
echo "Package: $PACKAGE_ROOT"
echo "Target : $APP_ROOT"

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "OK  $1: $(command -v "$1")"
  else
    echo "MISS $1"
    MISSING_CMDS="${MISSING_CMDS:-} $1"
  fi
}

echo "Checking server runtime..."
need_cmd node
need_cmd npm
need_cmd pm2
need_cmd psql
need_cmd redis-cli
if command -v nginx >/dev/null 2>&1 || [ -x /www/server/nginx/sbin/nginx ]; then
  echo "OK  nginx"
else
  echo "MISS nginx"
  MISSING_CMDS="${MISSING_CMDS:-} nginx"
fi

if [ -n "${MISSING_CMDS:-}" ]; then
  echo "Some runtime tools are missing:${MISSING_CMDS}"
  echo "Install them first, then run this script again."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js version is $(node -v), but Lingmeng requires Node.js 22 or newer."
  echo "Install or switch to Node.js 22 LTS, then run this script again."
  exit 1
fi
echo "OK  node version >= 22"

mkdir -p "$BACKEND_DIR" "$ADMIN_DIR" "$SITE_DIR"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$PACKAGE_ROOT/backend/" "$BACKEND_DIR/" \
    --exclude ".env" \
    --exclude "node_modules" \
    --exclude "uploads" \
    --exclude "storage" \
    --exclude "logs"
  rsync -a --delete "$PACKAGE_ROOT/admin/dist/" "$ADMIN_DIR/"
  if [ -d "$PACKAGE_ROOT/site/dist" ]; then
    rsync -a --delete "$PACKAGE_ROOT/site/dist/" "$SITE_DIR/"
  fi
else
  cp -R "$PACKAGE_ROOT/backend/." "$BACKEND_DIR/"
  rm -rf "$ADMIN_DIR"/*
  cp -R "$PACKAGE_ROOT/admin/dist/." "$ADMIN_DIR/"
  if [ -d "$PACKAGE_ROOT/site/dist" ]; then
    rm -rf "$SITE_DIR"/*
    cp -R "$PACKAGE_ROOT/site/dist/." "$SITE_DIR/"
  fi
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$PACKAGE_ROOT/env.backend.example" "$BACKEND_DIR/.env"
  echo "Created $BACKEND_DIR/.env from env.backend.example"
fi

if grep -q "SETUP_TOKEN=please-change-this-long-random-token" "$BACKEND_DIR/.env"; then
  SETUP_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  sed -i "s#^SETUP_TOKEN=.*#SETUP_TOKEN=$SETUP_TOKEN#" "$BACKEND_DIR/.env"
else
  SETUP_TOKEN="$(grep '^SETUP_TOKEN=' "$BACKEND_DIR/.env" | tail -1 | cut -d= -f2-)"
fi

if grep -q "JWT_SECRET=please-generate-a-long-random-secret-at-least-32-chars" "$BACKEND_DIR/.env"; then
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT_SECRET#" "$BACKEND_DIR/.env"
fi

if ! grep -q "^APP_VERSION=" "$BACKEND_DIR/.env"; then
  APP_VERSION_VALUE="$(cat "$PACKAGE_ROOT/VERSION" 2>/dev/null || echo "1.0.24")"
  printf "\nAPP_VERSION=%s\n" "$APP_VERSION_VALUE" >> "$BACKEND_DIR/.env"
fi

cd "$BACKEND_DIR"
echo "Installing backend dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

DATABASE_URL_VALUE="$(grep '^DATABASE_URL=' "$BACKEND_DIR/.env" | tail -1 | cut -d= -f2-)"
DB_PROVIDER="$(grep '^DB_PROVIDER=' "$BACKEND_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]')"
if [ -z "$DB_PROVIDER" ]; then
  case "$DATABASE_URL_VALUE" in
    mysql://*) DB_PROVIDER="mysql" ;;
    *) DB_PROVIDER="postgresql" ;;
  esac
fi
if [ "$DB_PROVIDER" = "postgres" ]; then DB_PROVIDER="postgresql"; fi
if [ "$DB_PROVIDER" = "mysql" ]; then PRISMA_SCHEMA="prisma/schema.mysql.prisma"; else PRISMA_SCHEMA="prisma/schema.postgresql.prisma"; fi

echo "Generating Prisma Client..."
DB_PROVIDER="$DB_PROVIDER" npm run db:generate

if [ -n "$DATABASE_URL_VALUE" ]; then
  echo "Trying database migration with existing DATABASE_URL..."
  node scripts/migrate-release.cjs install
  echo "Database schema sync finished."
else
  echo "DATABASE_URL is empty. The /setup wizard will collect database account/password and run migrations."
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" --update-env
  else
    pm2 start npm --name "$PM2_NAME" -- run start:prod
  fi
  pm2 save
else
  echo "PM2 not found. Install it first: npm i -g pm2"
fi

echo "Install files deployed."
echo "SETUP_TOKEN: $SETUP_TOKEN"
echo "Next:"
echo "1. Open http://your-admin-domain/setup"
echo "2. Enter SETUP_TOKEN and complete the setup wizard"
echo "3. Change SETUP_WIZARD=false in $BACKEND_DIR/.env and restart PM2"
