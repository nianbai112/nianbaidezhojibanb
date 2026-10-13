-- 福利抽奖开奖人数门槛：不足人数时报名与开奖自动顺延，超过最多顺延次数仍不足则作废。可重复执行。
ALTER TABLE "welfare_campaigns"
  ADD COLUMN IF NOT EXISTS "minParticipants" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extendHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "maxExtensions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extensionCount" INTEGER NOT NULL DEFAULT 0;
