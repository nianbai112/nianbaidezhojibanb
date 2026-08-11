ALTER TABLE "share_settings"
  ADD COLUMN IF NOT EXISTS "requireInviterPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requireInviteePhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requireInviterStudentVerify" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requireInviteeStudentVerify" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "minInviterAccountAgeDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minInviteeAccountAgeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inviteCooldownMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxRecentInvites" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recentWindowMinutes" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "sameIpDailyLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sameDeviceDailyLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sameDeviceTotalLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalRewardBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "singleRewardCap" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rewardReleaseMode" TEXT NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS "rewardDelayHours" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inviterWhitelist" JSONB,
  ADD COLUMN IF NOT EXISTS "inviterBlacklist" JSONB,
  ADD COLUMN IF NOT EXISTS "inviteeBlacklist" JSONB,
  ADD COLUMN IF NOT EXISTS "blockedPhonePrefixes" JSONB;

ALTER TABLE "share_invites"
  ADD COLUMN IF NOT EXISTS "ip" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "riskReasons" JSONB,
  ADD COLUMN IF NOT EXISTS "rewardReleaseMode" TEXT,
  ADD COLUMN IF NOT EXISTS "rewardReadyAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "share_invites_region_inviter_created_idx" ON "share_invites"("regionId", "inviterId", "createdAt");
CREATE INDEX IF NOT EXISTS "share_invites_region_ip_created_idx" ON "share_invites"("regionId", "ip", "createdAt");
CREATE INDEX IF NOT EXISTS "share_invites_region_device_created_idx" ON "share_invites"("regionId", "deviceId", "createdAt");
