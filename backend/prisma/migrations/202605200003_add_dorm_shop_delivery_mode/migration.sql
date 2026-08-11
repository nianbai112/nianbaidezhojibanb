-- Add delivery routing for dorm shops:
-- self_delivery stays with the shop owner, rider_delivery enters the rider pool.

DO $$ BEGIN ALTER TABLE "merchants" ADD COLUMN "delivery_mode" TEXT NOT NULL DEFAULT 'platform_rider'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "orders" ADD COLUMN "delivery_mode" TEXT NOT NULL DEFAULT 'platform_rider'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

UPDATE "merchants"
SET "delivery_mode" = 'self_delivery'
WHERE "business_type" = 'dorm_shop'
  AND COALESCE("delivery_mode", 'platform_rider') = 'platform_rider';

UPDATE "orders"
SET "delivery_mode" = 'rider_delivery'
WHERE "business_type" = 'dorm_shop'
  AND COALESCE("delivery_mode", 'platform_rider') = 'platform_rider';

CREATE INDEX IF NOT EXISTS "merchants_business_type_delivery_mode_idx" ON "merchants"("business_type", "delivery_mode");
CREATE INDEX IF NOT EXISTS "orders_delivery_mode_status_idx" ON "orders"("delivery_mode", "status");
