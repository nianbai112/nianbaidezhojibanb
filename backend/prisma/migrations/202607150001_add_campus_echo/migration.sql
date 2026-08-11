ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "interactionIntent" TEXT NOT NULL DEFAULT 'share';

CREATE INDEX IF NOT EXISTS "posts_regionId_interactionIntent_createdAt_idx"
  ON "posts" ("regionId", "interactionIntent", "createdAt");

CREATE TABLE IF NOT EXISTS "post_echo_interactions" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_echo_interactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_echo_interactions_postId_userId_action_key"
  ON "post_echo_interactions" ("postId", "userId", "action");
CREATE INDEX IF NOT EXISTS "post_echo_interactions_postId_action_createdAt_idx"
  ON "post_echo_interactions" ("postId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "post_echo_interactions_userId_createdAt_idx"
  ON "post_echo_interactions" ("userId", "createdAt");

ALTER TABLE "post_echo_interactions"
  ADD CONSTRAINT "post_echo_interactions_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_echo_interactions"
  ADD CONSTRAINT "post_echo_interactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
