-- AlterTable
ALTER TABLE "welfare_campaigns" ADD COLUMN     "groupRecheckAtDraw" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupVerificationMode" TEXT NOT NULL DEFAULT 'wechat_card';

-- AlterTable
ALTER TABLE "welfare_entries" ADD COLUMN     "exclusionReason" TEXT,
ADD COLUMN     "groupCheckedAtDraw" TIMESTAMP(3),
ADD COLUMN     "groupVerifiedId" TEXT;

-- CreateTable
CREATE TABLE "welfare_wecom_groups" (
    "id" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "regionId" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "identifiableCount" INTEGER NOT NULL DEFAULT 0,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "memberHashes" JSONB,
    "memberVersion" TEXT,
    "configFingerprint" TEXT,
    "dirtyVersion" INTEGER NOT NULL DEFAULT 0,
    "snapshotVersion" INTEGER NOT NULL DEFAULT -1,
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welfare_wecom_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "welfare_wecom_groups_regionId_updatedAt_idx" ON "welfare_wecom_groups"("regionId", "updatedAt");

-- CreateIndex
CREATE INDEX "welfare_wecom_groups_syncedAt_idx" ON "welfare_wecom_groups"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_wecom_groups_corpId_chatId_key" ON "welfare_wecom_groups"("corpId", "chatId");

