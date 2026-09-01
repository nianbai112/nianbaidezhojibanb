ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notifyLikeMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyCommentMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyReplyMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyMentionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyFollowMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifySquatMode" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyOfficialAccount" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "notifyInteractionBadge" BOOLEAN;

-- 每列只回填 NULL，保留已写入的新模式值和原有系统/订单通知偏好。
UPDATE "user_settings"
SET "notifyLikeMode" = CASE WHEN "notifyLike" = false THEN 'off' ELSE 'reduced' END
WHERE "notifyLikeMode" IS NULL;

UPDATE "user_settings"
SET "notifyCommentMode" = CASE WHEN "notifyComment" = false THEN 'off' ELSE 'instant' END
WHERE "notifyCommentMode" IS NULL;

UPDATE "user_settings"
SET "notifyReplyMode" = CASE WHEN "notifyComment" = false THEN 'off' ELSE 'instant' END
WHERE "notifyReplyMode" IS NULL;

UPDATE "user_settings"
SET "notifyMentionMode" = CASE WHEN "notifyComment" = false THEN 'off' ELSE 'instant' END
WHERE "notifyMentionMode" IS NULL;

UPDATE "user_settings"
SET "notifyFollowMode" = CASE WHEN "notifyFollow" = false THEN 'off' ELSE 'inbox' END
WHERE "notifyFollowMode" IS NULL;

UPDATE "user_settings"
SET "notifySquatMode" = CASE WHEN "notifySquat" = false THEN 'off' ELSE 'inbox' END
WHERE "notifySquatMode" IS NULL;

UPDATE "user_settings"
SET "notifyOfficialAccount" = true
WHERE "notifyOfficialAccount" IS NULL;

UPDATE "user_settings"
SET "notifyInteractionBadge" = true
WHERE "notifyInteractionBadge" IS NULL;

-- 回填后统一恢复 Prisma schema 要求的 NOT NULL 与默认值。
ALTER TABLE "user_settings"
  ALTER COLUMN "notifyLikeMode" SET DEFAULT 'reduced',
  ALTER COLUMN "notifyLikeMode" SET NOT NULL,
  ALTER COLUMN "notifyCommentMode" SET DEFAULT 'instant',
  ALTER COLUMN "notifyCommentMode" SET NOT NULL,
  ALTER COLUMN "notifyReplyMode" SET DEFAULT 'instant',
  ALTER COLUMN "notifyReplyMode" SET NOT NULL,
  ALTER COLUMN "notifyMentionMode" SET DEFAULT 'instant',
  ALTER COLUMN "notifyMentionMode" SET NOT NULL,
  ALTER COLUMN "notifyFollowMode" SET DEFAULT 'inbox',
  ALTER COLUMN "notifyFollowMode" SET NOT NULL,
  ALTER COLUMN "notifySquatMode" SET DEFAULT 'inbox',
  ALTER COLUMN "notifySquatMode" SET NOT NULL,
  ALTER COLUMN "notifyOfficialAccount" SET DEFAULT true,
  ALTER COLUMN "notifyOfficialAccount" SET NOT NULL,
  ALTER COLUMN "notifyInteractionBadge" SET DEFAULT true,
  ALTER COLUMN "notifyInteractionBadge" SET NOT NULL;
