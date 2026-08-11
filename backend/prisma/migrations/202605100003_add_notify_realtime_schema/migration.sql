-- Sync notification center / WeChat messaging / realtime session schema.
-- This migration is intentionally guarded because several fields may already
-- exist in local databases that were partially updated during development.

DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'REPLY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'SQUAT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'REFUND'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'MERCHANT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_BROADCAST'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "regionId" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "scene" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "linkType" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "linkValue" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "channelMask" JSONB;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "notifications" SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
ALTER TABLE "notifications" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "wechat_template_configs" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "wechat_template_configs" ADD COLUMN IF NOT EXISTS "fieldMapping" JSONB;
ALTER TABLE "wechat_template_configs" ADD COLUMN IF NOT EXISTS "exampleData" JSONB;
ALTER TABLE "wechat_template_configs" ADD COLUMN IF NOT EXISTS "pageTemplate" TEXT;
ALTER TABLE "wechat_template_configs" ADD COLUMN IF NOT EXISTS "regionId" TEXT;

DROP INDEX IF EXISTS "wechat_template_configs_platformType_templateType_key";

CREATE TABLE IF NOT EXISTS "wechat_subscribe_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceScene" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wechat_subscribe_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wechat_message_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "openid" TEXT,
    "platformType" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "page" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wechat_message_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wechat_official_bindings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "officialOpenid" TEXT NOT NULL,
    "unionid" TEXT,
    "subscribe" BOOLEAN NOT NULL DEFAULT false,
    "subscribeAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "qrScene" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wechat_official_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "realtime_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT,
    "socketId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "realtime_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wechat_subscribe_consents_userId_status_idx" ON "wechat_subscribe_consents"("userId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "wechat_subscribe_consents_userId_templateType_key" ON "wechat_subscribe_consents"("userId", "templateType");

CREATE INDEX IF NOT EXISTS "wechat_message_logs_userId_platformType_createdAt_idx" ON "wechat_message_logs"("userId", "platformType", "createdAt");
CREATE INDEX IF NOT EXISTS "wechat_message_logs_status_createdAt_idx" ON "wechat_message_logs"("status", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "wechat_official_bindings_officialOpenid_key" ON "wechat_official_bindings"("officialOpenid");
CREATE UNIQUE INDEX IF NOT EXISTS "wechat_official_bindings_userId_key" ON "wechat_official_bindings"("userId");
CREATE INDEX IF NOT EXISTS "wechat_official_bindings_unionid_idx" ON "wechat_official_bindings"("unionid");

CREATE INDEX IF NOT EXISTS "realtime_sessions_userId_online_idx" ON "realtime_sessions"("userId", "online");
CREATE INDEX IF NOT EXISTS "realtime_sessions_adminId_online_idx" ON "realtime_sessions"("adminId", "online");
CREATE INDEX IF NOT EXISTS "realtime_sessions_platform_online_idx" ON "realtime_sessions"("platform", "online");

CREATE INDEX IF NOT EXISTS "notifications_regionId_type_createdAt_idx" ON "notifications"("regionId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "wechat_template_configs_platformType_enabled_idx" ON "wechat_template_configs"("platformType", "enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "wechat_template_configs_platformType_templateType_regionId_key" ON "wechat_template_configs"("platformType", "templateType", "regionId");
