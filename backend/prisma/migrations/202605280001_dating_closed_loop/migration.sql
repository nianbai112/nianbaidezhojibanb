-- 对象匹配闭环：资料维度、区域配置、付费次数、互相喜欢和风控字段。

ALTER TABLE "dating_configs"
  ADD COLUMN IF NOT EXISTS "requireStudentAuth" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enableWhoLikedMe" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enablePaidPackage" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "aiRecommendEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "profileReviewMode" TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  ALTER TABLE "dating_configs"
    ADD CONSTRAINT "dating_configs_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "dating_profiles"
  ADD COLUMN IF NOT EXISTS "regionId" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "birthYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "height" INTEGER,
  ADD COLUMN IF NOT EXISTS "isStudent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "school" TEXT,
  ADD COLUMN IF NOT EXISTS "grade" TEXT,
  ADD COLUMN IF NOT EXISTS "major" TEXT,
  ADD COLUMN IF NOT EXISTS "work" TEXT,
  ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 6),
  ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10, 6),
  ADD COLUMN IF NOT EXISTS "hobbies" JSONB,
  ADD COLUMN IF NOT EXISTS "personalityTags" JSONB,
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'region',
  ADD COLUMN IF NOT EXISTS "likedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "matchedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);

DO $$
BEGIN
  ALTER TABLE "dating_profiles"
    ADD CONSTRAINT "dating_profiles_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "dating_profiles_regionId_idx" ON "dating_profiles"("regionId");
CREATE INDEX IF NOT EXISTS "dating_profiles_auditStatus_isOpen_idx" ON "dating_profiles"("auditStatus", "isOpen");

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "regionId" TEXT,
  ADD COLUMN IF NOT EXISTS "actionSource" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "matches_regionId_idx" ON "matches"("regionId");
CREATE INDEX IF NOT EXISTS "matches_status_createdAt_idx" ON "matches"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "dating_quotas" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "remainingCount" INTEGER NOT NULL DEFAULT 0,
  "totalPurchased" INTEGER NOT NULL DEFAULT 0,
  "usedPurchased" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dating_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dating_quotas_userId_key" ON "dating_quotas"("userId");

DO $$
BEGIN
  ALTER TABLE "dating_quotas"
    ADD CONSTRAINT "dating_quotas_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
