ALTER TABLE "incentive_records"
  ADD COLUMN IF NOT EXISTS "orderType" TEXT,
  ADD COLUMN IF NOT EXISTS "orderId" TEXT,
  ADD COLUMN IF NOT EXISTS "actionKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "incentive_records_actionKey_key"
  ON "incentive_records"("actionKey");

CREATE INDEX IF NOT EXISTS "incentive_records_orderType_orderId_idx"
  ON "incentive_records"("orderType", "orderId");
