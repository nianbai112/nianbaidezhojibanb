ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "merchant_id" TEXT;

CREATE INDEX IF NOT EXISTS "categories_merchant_id_status_sort_order_idx"
  ON "categories"("merchant_id", "status", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "categories"
    ADD CONSTRAINT "categories_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
