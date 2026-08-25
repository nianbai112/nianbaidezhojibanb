#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-/opt/lingmeng}"
VERSION="$(cat "$PACKAGE_ROOT/VERSION")"
BACKUP_ROOT="$APP_ROOT/backups"
BACKUP_FILE="$BACKUP_ROOT/files-before-$VERSION-$(date +%Y%m%d-%H%M%S).tar.gz"

if [ ! -f "$APP_ROOT/backend/.env" ]; then
  echo "Existing installation not found at $APP_ROOT"
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
tar -czf "$BACKUP_FILE" \
  --exclude='backend/.env' \
  --exclude='backend/node_modules' \
  --exclude='backend/uploads' \
  --exclude='backend/storage' \
  --exclude='backend/logs' \
  --exclude='logs' \
  --exclude='backups' \
  -C "$APP_ROOT" backend admin site ecosystem.config.cjs

echo "Backup created: $BACKUP_FILE"
APP_ROOT="$APP_ROOT" exec bash "$PACKAGE_ROOT/install.sh"
