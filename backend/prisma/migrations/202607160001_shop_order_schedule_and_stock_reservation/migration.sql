ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "scheduled_delivery_time" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stock_reserved" BOOLEAN NOT NULL DEFAULT false;
