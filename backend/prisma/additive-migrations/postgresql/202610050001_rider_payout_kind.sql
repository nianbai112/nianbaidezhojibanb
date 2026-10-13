ALTER TABLE "rider_wechat_payouts"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'delivery_fee';

CREATE UNIQUE INDEX IF NOT EXISTS "rider_wechat_payouts_orderId_kind_key" ON "rider_wechat_payouts"("orderId", "kind");

DROP INDEX IF EXISTS "rider_wechat_payouts_orderId_key";
