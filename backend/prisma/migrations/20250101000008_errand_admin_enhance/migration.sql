-- AlterTable: RegionRider add balance
ALTER TABLE "region_riders"
  ADD COLUMN "balance" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- CreateTable: errand_page_configs
CREATE TABLE "errand_page_configs" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "notice" TEXT,
    "orderTips" TEXT,
    "defaultRiderAvatar" TEXT,
    "servicePhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_page_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "errand_page_configs_regionId_key" ON "errand_page_configs"("regionId");

-- CreateTable: errand_reward_punishes
CREATE TABLE "errand_reward_punishes" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "timeoutPenalty" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "badReviewPenalty" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "goodReviewReward" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "nightReward" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_reward_punishes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "errand_reward_punishes_regionId_key" ON "errand_reward_punishes"("regionId");
