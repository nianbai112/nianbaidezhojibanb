-- AlterTable: Drop old punch_in tables and recreate with expanded schema
-- These tables had no backend module, so no data to preserve

-- 1. Drop existing punch_in tables (order matters due to FK constraints)
DROP TABLE IF EXISTS "punch_in_records" CASCADE;
DROP TABLE IF EXISTS "punch_in_locations" CASCADE;
DROP TABLE IF EXISTS "punch_in_configs" CASCADE;

-- 2. Create PunchInCategory (new table)
CREATE TYPE "PunchInCategoryStatus" AS ENUM ('ENABLED', 'DISABLED');
CREATE TABLE "punch_in_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PunchInCategoryStatus" NOT NULL DEFAULT 'ENABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_in_categories_pkey" PRIMARY KEY ("id")
);

-- 3. Create PunchInConfig with expanded fields (replaces old punch_in_configs)
CREATE TYPE "RankingCycle" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TABLE "punch_in_configs" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxDailyCheckins" INTEGER NOT NULL DEFAULT 10,
    "maxLocationCheckins" INTEGER NOT NULL DEFAULT 3,
    "minCheckinInterval" INTEGER NOT NULL DEFAULT 300,
    "allowDuplicateLocation" BOOLEAN NOT NULL DEFAULT true,
    "requireLocationVerify" BOOLEAN NOT NULL DEFAULT false,
    "locationVerifyRadius" INTEGER NOT NULL DEFAULT 100,
    "allowImageUpload" BOOLEAN NOT NULL DEFAULT true,
    "maxImageCount" INTEGER NOT NULL DEFAULT 9,
    "allowVideoUpload" BOOLEAN NOT NULL DEFAULT true,
    "maxContentLength" INTEGER NOT NULL DEFAULT 500,
    "requireContent" BOOLEAN NOT NULL DEFAULT false,
    "allowComment" BOOLEAN NOT NULL DEFAULT true,
    "allowReply" BOOLEAN NOT NULL DEFAULT true,
    "maxCommentLength" INTEGER NOT NULL DEFAULT 300,
    "enableRanking" BOOLEAN NOT NULL DEFAULT true,
    "rankingCycle" "RankingCycle" NOT NULL DEFAULT 'WEEKLY',
    "enableSharedLocations" BOOLEAN NOT NULL DEFAULT true,
    "enableUserSuggest" BOOLEAN NOT NULL DEFAULT true,
    "workingHoursStart" TEXT NOT NULL DEFAULT '00:00:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '23:59:59',
    "weekendEnabled" BOOLEAN NOT NULL DEFAULT true,
    "holidayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_in_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "punch_in_configs_regionId_key" ON "punch_in_configs"("regionId");

-- 4. Create PunchInLocation with expanded fields (replaces old punch_in_locations)
CREATE TYPE "PunchInLocationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
CREATE TABLE "punch_in_locations" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverImage" TEXT,
    "images" JSONB,
    "videos" JSONB,
    "status" "PunchInLocationStatus" NOT NULL DEFAULT 'DRAFT',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_in_locations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "punch_in_locations" ADD CONSTRAINT "punch_in_locations_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "punch_in_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Create PunchInRecord with expanded fields (replaces old punch_in_records)
CREATE TYPE "PunchInRecordStatus" AS ENUM ('NORMAL', 'DELETED');
CREATE TABLE "punch_in_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT,
    "regionId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "images" JSONB,
    "content" TEXT,
    "status" "PunchInRecordStatus" NOT NULL DEFAULT 'NORMAL',
    "rewardValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isMakeup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_in_records_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "punch_in_records" ADD CONSTRAINT "punch_in_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "punch_in_records" ADD CONSTRAINT "punch_in_records_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "punch_in_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "punch_in_records_userId_regionId_date_key" ON "punch_in_records"("userId", "regionId", "date");

-- 6. Create PunchInComment (new table)
CREATE TYPE "PunchInCommentStatus" AS ENUM ('NORMAL', 'DELETED');
CREATE TABLE "punch_in_comments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "status" "PunchInCommentStatus" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_in_comments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "punch_in_comments" ADD CONSTRAINT "punch_in_comments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "punch_in_comments" ADD CONSTRAINT "punch_in_comments_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "punch_in_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "punch_in_comments" ADD CONSTRAINT "punch_in_comments_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "punch_in_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Add status column to rating_items
ALTER TABLE "rating_items" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'enabled';
