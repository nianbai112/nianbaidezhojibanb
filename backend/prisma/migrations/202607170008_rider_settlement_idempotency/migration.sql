-- Keep historic records untouched; new settlement cycles are unique per rider.
ALTER TABLE "rider_settlements" ADD COLUMN IF NOT EXISTS "periodKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "rider_settlements_periodKey_key" ON "rider_settlements"("periodKey");
