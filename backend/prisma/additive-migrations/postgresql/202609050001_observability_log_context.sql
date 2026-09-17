ALTER TABLE "admin_login_logs" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "wechat_message_logs" ADD COLUMN IF NOT EXISTS "requestIp" TEXT;
ALTER TABLE "wechat_message_logs" ADD COLUMN IF NOT EXISTS "requestIpSource" TEXT;
ALTER TABLE "admin_login_logs" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "admin_login_logs" DROP CONSTRAINT IF EXISTS "admin_login_logs_accountId_fkey";
ALTER TABLE "admin_login_logs" ADD CONSTRAINT "admin_login_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
