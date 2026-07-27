-- Public random-looking user IDs and feed freshness indexes.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "publicUid" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY md5("id" || ':' || COALESCE("openid", ''))) AS rn
  FROM "users"
  WHERE "publicUid" IS NULL
),
generated AS (
  SELECT
    "id",
    10000000 + ((rn * 7919) % 90000000) AS public_uid
  FROM numbered
)
UPDATE "users" u
SET "publicUid" = g.public_uid
FROM generated g
WHERE u."id" = g."id"
  AND u."publicUid" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_publicUid_key"
  ON "users"("publicUid");

CREATE INDEX IF NOT EXISTS "users_publicUid_idx"
  ON "users"("publicUid");

CREATE INDEX IF NOT EXISTS "posts_regionId_status_auditStatus_createdAt_idx"
  ON "posts"("regionId", "status", "auditStatus", "createdAt");

CREATE INDEX IF NOT EXISTS "posts_circleId_status_auditStatus_createdAt_idx"
  ON "posts"("circleId", "status", "auditStatus", "createdAt");

CREATE INDEX IF NOT EXISTS "comments_postId_status_auditStatus_parentId_createdAt_idx"
  ON "comments"("postId", "status", "auditStatus", "parentId", "createdAt");
