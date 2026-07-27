-- Store anonymous publishing/comment identity while keeping the real userId auditable.

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "anonymousIdentityId" TEXT,
  ADD COLUMN IF NOT EXISTS "anonymousName" TEXT,
  ADD COLUMN IF NOT EXISTS "anonymousAvatar" TEXT;

ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "anonymousIdentityId" TEXT,
  ADD COLUMN IF NOT EXISTS "anonymousName" TEXT,
  ADD COLUMN IF NOT EXISTS "anonymousAvatar" TEXT;

CREATE INDEX IF NOT EXISTS "posts_isAnonymous_anonymousIdentityId_idx"
  ON "posts"("isAnonymous", "anonymousIdentityId");

CREATE INDEX IF NOT EXISTS "comments_isAnonymous_anonymousIdentityId_idx"
  ON "comments"("isAnonymous", "anonymousIdentityId");

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_anonymousIdentityId_fkey"
  FOREIGN KEY ("anonymousIdentityId") REFERENCES "anonymous_identities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_anonymousIdentityId_fkey"
  FOREIGN KEY ("anonymousIdentityId") REFERENCES "anonymous_identities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
