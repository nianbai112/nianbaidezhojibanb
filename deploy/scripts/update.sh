#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${APP_ROOT:-/www/wwwroot/lingmeng}"
BACKEND_DIR="$APP_ROOT/backend"
ADMIN_DIR="$APP_ROOT/admin"
PM2_NAME="${PM2_NAME:-lingmeng-backend}"

echo "== Lingmeng v1.0.1 update =="
echo "Package: $PACKAGE_ROOT"
echo "Target : $APP_ROOT"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "Missing $BACKEND_DIR/.env. This looks like a first install; run scripts/install.sh first."
  exit 1
fi

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$PACKAGE_ROOT/backend/dist/" "$BACKEND_DIR/dist/"
  rsync -a --delete "$PACKAGE_ROOT/backend/prisma/" "$BACKEND_DIR/prisma/"
  rsync -a "$PACKAGE_ROOT/backend/package.json" "$BACKEND_DIR/package.json"
  if [ -f "$PACKAGE_ROOT/backend/package-lock.json" ]; then
    rsync -a "$PACKAGE_ROOT/backend/package-lock.json" "$BACKEND_DIR/package-lock.json"
  fi
  rsync -a --delete "$PACKAGE_ROOT/admin/dist/" "$ADMIN_DIR/"
else
  rm -rf "$BACKEND_DIR/dist" "$BACKEND_DIR/prisma" "$ADMIN_DIR"/*
  cp -R "$PACKAGE_ROOT/backend/dist" "$BACKEND_DIR/dist"
  cp -R "$PACKAGE_ROOT/backend/prisma" "$BACKEND_DIR/prisma"
  cp "$PACKAGE_ROOT/backend/package.json" "$BACKEND_DIR/package.json"
  [ -f "$PACKAGE_ROOT/backend/package-lock.json" ] && cp "$PACKAGE_ROOT/backend/package-lock.json" "$BACKEND_DIR/package-lock.json"
  cp -R "$PACKAGE_ROOT/admin/dist/." "$ADMIN_DIR/"
fi

cd "$BACKEND_DIR"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npx prisma migrate deploy
npx prisma generate

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start npm --name "$PM2_NAME" -- run start:prod
fi
pm2 save

echo "Update completed. Check:"
echo "curl http://127.0.0.1:3000/healthz"
