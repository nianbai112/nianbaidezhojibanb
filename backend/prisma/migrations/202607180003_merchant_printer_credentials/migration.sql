ALTER TABLE "printer_configs"
  ADD COLUMN "connectionMode" TEXT NOT NULL DEFAULT 'platform_managed',
  ADD COLUMN "credentialCiphertext" TEXT;

-- 已存在的设备沿用上一版的全局飞鹅配置；新建设备默认由商家自行管理凭证。
ALTER TABLE "printer_configs" ALTER COLUMN "connectionMode" SET DEFAULT 'merchant_owned';

ALTER TABLE "print_jobs" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'feie';
