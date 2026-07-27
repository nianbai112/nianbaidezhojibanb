-- Add post/comment mention storage and notification type.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTION';

CREATE TABLE IF NOT EXISTS "post_mentions" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_mentions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "comment_mentions" (
  "id" TEXT NOT NULL,
  "comment_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_mentions_post_id_user_id_key" ON "post_mentions"("post_id", "user_id");
CREATE INDEX IF NOT EXISTS "post_mentions_user_id_created_at_idx" ON "post_mentions"("user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "comment_mentions_comment_id_user_id_key" ON "comment_mentions"("comment_id", "user_id");
CREATE INDEX IF NOT EXISTS "comment_mentions_user_id_created_at_idx" ON "comment_mentions"("user_id", "created_at");

ALTER TABLE "post_mentions"
  ADD CONSTRAINT "post_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_mentions"
  ADD CONSTRAINT "post_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_mentions"
  ADD CONSTRAINT "comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_mentions"
  ADD CONSTRAINT "comment_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
