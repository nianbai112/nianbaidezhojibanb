-- Complete drift bottle gameplay: region config, pickup records, and lifecycle fields.
-- Additive and idempotent so existing drift_bottles data can survive upgrades.

DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "regionId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "imageUrl" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "pickupMode" TEXT NOT NULL DEFAULT 'single'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "pickupLimit" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "pickupPrice" DECIMAL(10,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "expiresAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "deletedAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drift_bottles" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "drift_bottle_pickups" (
    "id" TEXT NOT NULL,
    "bottleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT,
    "pickupPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drift_bottle_pickups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "drift_bottle_configs" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyPostLimit" INTEGER NOT NULL DEFAULT 3,
    "dailyPickLimit" INTEGER NOT NULL DEFAULT 10,
    "expiresInHours" INTEGER NOT NULL DEFAULT 72,
    "allowImage" BOOLEAN NOT NULL DEFAULT true,
    "requireAudit" BOOLEAN NOT NULL DEFAULT false,
    "allowMultiPick" BOOLEAN NOT NULL DEFAULT true,
    "maxPickupLimit" INTEGER NOT NULL DEFAULT 5,
    "singlePickDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowPickMale" BOOLEAN NOT NULL DEFAULT true,
    "allowPickFemale" BOOLEAN NOT NULL DEFAULT true,
    "malePickPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "femalePickPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ruleText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drift_bottle_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "drift_bottle_pickups_bottleId_userId_key" ON "drift_bottle_pickups"("bottleId", "userId");
CREATE INDEX IF NOT EXISTS "drift_bottle_pickups_userId_createdAt_idx" ON "drift_bottle_pickups"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "drift_bottle_pickups_regionId_createdAt_idx" ON "drift_bottle_pickups"("regionId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "drift_bottle_configs_regionId_key" ON "drift_bottle_configs"("regionId");
CREATE INDEX IF NOT EXISTS "drift_bottles_regionId_status_createdAt_idx" ON "drift_bottles"("regionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "drift_bottles_userId_createdAt_idx" ON "drift_bottles"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "drift_bottles_expiresAt_idx" ON "drift_bottles"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "drift_bottles"
  ADD CONSTRAINT "drift_bottles_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "drift_bottle_pickups"
  ADD CONSTRAINT "drift_bottle_pickups_bottleId_fkey"
  FOREIGN KEY ("bottleId") REFERENCES "drift_bottles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "drift_bottle_pickups"
  ADD CONSTRAINT "drift_bottle_pickups_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "drift_bottle_pickups"
  ADD CONSTRAINT "drift_bottle_pickups_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "drift_bottle_configs"
  ADD CONSTRAINT "drift_bottle_configs_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
