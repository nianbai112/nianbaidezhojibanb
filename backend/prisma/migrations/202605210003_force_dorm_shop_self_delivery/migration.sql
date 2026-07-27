ALTER TABLE "merchants"
ADD COLUMN IF NOT EXISTS "delivery_fee" DECIMAL(10, 2) NOT NULL DEFAULT 0;

UPDATE "merchants"
SET "delivery_mode" = 'self_delivery'
WHERE "business_type" = 'dorm_shop';

UPDATE "orders"
SET "delivery_mode" = 'self_delivery'
WHERE "business_type" = 'dorm_shop';
