-- New records are idempotent without rewriting or discarding historical duplicates.
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tags" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_dedupeKey_key" ON "reviews"("dedupeKey");

ALTER TABLE "merchant_settlements" ADD COLUMN IF NOT EXISTS "periodKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_settlements_periodKey_key" ON "merchant_settlements"("periodKey");
