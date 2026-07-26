-- Admin WeChat binding and QR-code login sessions.
-- Guarded for local databases that may have been partially updated during development.

DO $$ BEGIN
  CREATE TYPE "AdminWechatBindingStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdminQrLoginStatus" AS ENUM ('PENDING', 'SCANNED', 'CONFIRMED', 'EXPIRED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_wechat_bindings" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "openid" TEXT,
  "unionid" TEXT,
  "nickname" TEXT,
  "avatar" TEXT,
  "status" "AdminWechatBindingStatus" NOT NULL DEFAULT 'ACTIVE',
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_wechat_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admin_qr_login_sessions" (
  "id" TEXT NOT NULL,
  "ticket" TEXT NOT NULL,
  "status" "AdminQrLoginStatus" NOT NULL DEFAULT 'PENDING',
  "accountId" TEXT,
  "userId" TEXT,
  "openid" TEXT,
  "nickname" TEXT,
  "avatar" TEXT,
  "webIp" TEXT,
  "webUserAgent" TEXT,
  "scanIp" TEXT,
  "scanUserAgent" TEXT,
  "rejectReason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scannedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_qr_login_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_wechat_bindings_accountId_key" ON "admin_wechat_bindings"("accountId");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_wechat_bindings_userId_key" ON "admin_wechat_bindings"("userId");
CREATE INDEX IF NOT EXISTS "admin_wechat_bindings_openid_idx" ON "admin_wechat_bindings"("openid");
CREATE INDEX IF NOT EXISTS "admin_wechat_bindings_unionid_idx" ON "admin_wechat_bindings"("unionid");

CREATE UNIQUE INDEX IF NOT EXISTS "admin_qr_login_sessions_ticket_key" ON "admin_qr_login_sessions"("ticket");
CREATE INDEX IF NOT EXISTS "admin_qr_login_sessions_status_expiresAt_idx" ON "admin_qr_login_sessions"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "admin_qr_login_sessions_userId_idx" ON "admin_qr_login_sessions"("userId");
CREATE INDEX IF NOT EXISTS "admin_qr_login_sessions_accountId_idx" ON "admin_qr_login_sessions"("accountId");

DO $$ BEGIN
  ALTER TABLE "admin_wechat_bindings"
    ADD CONSTRAINT "admin_wechat_bindings_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "admin_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "admin_wechat_bindings"
    ADD CONSTRAINT "admin_wechat_bindings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "admin_qr_login_sessions"
    ADD CONSTRAINT "admin_qr_login_sessions_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "admin_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "admin_qr_login_sessions"
    ADD CONSTRAINT "admin_qr_login_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
