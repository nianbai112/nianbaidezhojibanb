-- 代买店铺出单打印机：打印机可绑定代买店铺（每店一台）并可自定义小票模板，打印任务记录业务类型、联数与失效时间。可重复执行。
ALTER TABLE "printer_configs" ALTER COLUMN "merchantId" DROP NOT NULL;
ALTER TABLE "printer_configs" ADD COLUMN IF NOT EXISTS "purchaseShopId" TEXT;
ALTER TABLE "printer_configs" ADD COLUMN IF NOT EXISTS "ticketTemplate" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "printer_configs_purchaseShopId_key" ON "printer_configs"("purchaseShopId");

ALTER TABLE "print_jobs"
  ADD COLUMN IF NOT EXISTS "bizType" TEXT NOT NULL DEFAULT 'shop_order',
  ADD COLUMN IF NOT EXISTS "bizId" TEXT,
  ADD COLUMN IF NOT EXISTS "copies" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "print_jobs_bizType_bizId_idx" ON "print_jobs"("bizType", "bizId");
