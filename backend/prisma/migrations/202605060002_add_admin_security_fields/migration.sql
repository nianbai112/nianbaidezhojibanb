-- AlterTable: 为 admin_accounts 增加登录安全字段
-- loginFailCount: 登录连续失败计数（成功登录后清零）
-- lockedUntil: 锁定截止时间（超过阈值后临时锁定）
-- 注意: lastLoginAt / lastLoginIp 已在初始迁移中创建，此处仅对缺失环境做安全建列

ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "loginFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
