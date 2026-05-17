#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${APP_ROOT:-/www/wwwroot/lingmeng}"
BACKEND_DIR="$APP_ROOT/backend"
ADMIN_DIR="$APP_ROOT/admin"
PM2_NAME="${PM2_NAME:-lingmeng-backend}"

echo "== Lingmeng v1.0.1 first install =="
echo "Package: $PACKAGE_ROOT"
echo "Target : $APP_ROOT"

mkdir -p "$BACKEND_DIR" "$ADMIN_DIR"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$PACKAGE_ROOT/backend/" "$BACKEND_DIR/" \
    --exclude ".env" \
    --exclude "node_modules" \
    --exclude "uploads" \
    --exclude "storage" \
    --exclude "logs"
  rsync -a --delete "$PACKAGE_ROOT/admin/dist/" "$ADMIN_DIR/"
else
  cp -R "$PACKAGE_ROOT/backend/." "$BACKEND_DIR/"
  rm -rf "$ADMIN_DIR"/*
  cp -R "$PACKAGE_ROOT/admin/dist/." "$ADMIN_DIR/"
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$PACKAGE_ROOT/env.backend.example" "$BACKEND_DIR/.env"
  echo "Created $BACKEND_DIR/.env from env.backend.example"
fi

cd "$BACKEND_DIR"
echo "Installing backend dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "Generating Prisma Client..."
npx prisma generate

echo "Trying database migration. If DATABASE_URL is still placeholder, edit .env and run this command again."
if npx prisma migrate deploy; then
  echo "Database migration finished."
else
  echo "Migration skipped or failed. Please edit $BACKEND_DIR/.env, then run:"
  echo "cd $BACKEND_DIR && npx prisma migrate deploy && npx prisma generate"
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
echo "Next:"
echo "1. Open http://your-admin-domain/setup"
echo "2. Complete setup wizard"
echo "3. Change SETUP_WIZARD=false in $BACKEND_DIR/.env and restart PM2"
