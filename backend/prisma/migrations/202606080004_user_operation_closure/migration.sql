ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "regionId" TEXT;
CREATE INDEX IF NOT EXISTS "user_profiles_regionId_idx" ON "user_profiles"("regionId");
