ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notifyLikeMode" TEXT NOT NULL DEFAULT 'reduced',
  ADD COLUMN IF NOT EXISTS "notifyCommentMode" TEXT NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS "notifyReplyMode" TEXT NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS "notifyMentionMode" TEXT NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS "notifyFollowMode" TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS "notifySquatMode" TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS "notifyOfficialAccount" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyInteractionBadge" BOOLEAN NOT NULL DEFAULT true;

UPDATE "user_settings"
SET
  "notifyLikeMode" = CASE WHEN "notifyLike" THEN 'reduced' ELSE 'off' END,
  "notifyCommentMode" = CASE WHEN "notifyComment" THEN 'instant' ELSE 'off' END,
  "notifyReplyMode" = CASE WHEN "notifyComment" THEN 'instant' ELSE 'off' END,
  "notifyMentionMode" = CASE WHEN "notifyComment" THEN 'instant' ELSE 'off' END,
  "notifyFollowMode" = CASE WHEN "notifyFollow" THEN 'inbox' ELSE 'off' END,
  "notifySquatMode" = CASE WHEN "notifySquat" THEN 'inbox' ELSE 'off' END,
  "notifySystem" = true,
  "notifyOrder" = true;
