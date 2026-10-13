-- 福利抽奖企业微信群成员核验：活动的群核验方式与开奖前复核、报名记录的群核验结果、企业微信官方群名册。可重复执行。
ALTER TABLE "welfare_campaigns"
  ADD COLUMN IF NOT EXISTS "groupRecheckAtDraw" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "groupVerificationMode" TEXT NOT NULL DEFAULT 'wechat_card';

ALTER TABLE "welfare_entries"
  ADD COLUMN IF NOT EXISTS "exclusionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "groupCheckedAtDraw" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "groupVerifiedId" TEXT;

CREATE TABLE IF NOT EXISTS "welfare_wecom_groups" (
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
CREATE INDEX IF NOT EXISTS "welfare_wecom_groups_regionId_updatedAt_idx" ON "welfare_wecom_groups"("regionId", "updatedAt");
CREATE INDEX IF NOT EXISTS "welfare_wecom_groups_syncedAt_idx" ON "welfare_wecom_groups"("syncedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "welfare_wecom_groups_corpId_chatId_key" ON "welfare_wecom_groups"("corpId", "chatId");
