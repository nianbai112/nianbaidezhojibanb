-- 强化 admin_accounts 安全字段
-- 为管理员账号增加软删除、密码变更追踪、MFA、强密码重置等生产级字段
-- 所有字段使用 ADD COLUMN IF NOT EXISTS 确保幂等安全

ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "passwordChangedAt"    TIMESTAMPTZ;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "mfaEnabled"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "mfaSecret"            TEXT;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMPTZ;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "lastLoginUserAgent"   TEXT;

-- 为现有活跃管理员设置默认 passwordChangedAt（避免 NULL 导致逻辑错误）
UPDATE "admin_accounts" SET "passwordChangedAt" = NOW() WHERE "passwordChangedAt" IS NULL AND "status" = 'active';
