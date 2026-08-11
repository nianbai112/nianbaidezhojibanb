ALTER TABLE "merchants"
  ADD COLUMN IF NOT EXISTS "min_order_amount" DECIMAL(10, 2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "packaging_fee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delivery_time_minutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "business_license_url" TEXT,
  ADD COLUMN IF NOT EXISTS "food_safety_license_url" TEXT;

UPDATE "merchants" SET "min_order_amount" = 0 WHERE "business_type" = 'dorm_shop';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "packaging_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
