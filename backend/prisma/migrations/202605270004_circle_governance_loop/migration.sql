-- 圈子运营闭环：圈主绑定、创建审核、公告圈规、成员申请/禁言/封禁。

ALTER TABLE "circles"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "auditStatus" TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "auditReason" TEXT,
  ADD COLUMN IF NOT EXISTS "announcement" TEXT,
  ADD COLUMN IF NOT EXISTS "rules" TEXT,
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "circle_members"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "muteEndAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "muteReason" TEXT,
  ADD COLUMN IF NOT EXISTS "auditReason" TEXT,
  ADD COLUMN IF NOT EXISTS "auditedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "operatorId" TEXT;

UPDATE "circles" AS c
SET "ownerUserId" = owner_member."userId"
FROM (
  SELECT DISTINCT ON ("circleId") "circleId", "userId"
  FROM "circle_members"
  WHERE "role" = 'OWNER'
  ORDER BY "circleId", "joinAt" ASC
) AS owner_member
WHERE owner_member."circleId" = c."id"
  AND c."ownerUserId" IS NULL;

UPDATE "circles" AS c
SET "lastActiveAt" = latest_post."createdAt"
FROM (
  SELECT "circleId", MAX("createdAt") AS "createdAt"
  FROM "posts"
  WHERE "circleId" IS NOT NULL
  GROUP BY "circleId"
) AS latest_post
WHERE latest_post."circleId" = c."id"
  AND c."lastActiveAt" IS NULL;

CREATE INDEX IF NOT EXISTS "circles_ownerUserId_idx" ON "circles"("ownerUserId");
CREATE INDEX IF NOT EXISTS "circles_auditStatus_status_idx" ON "circles"("auditStatus", "status");
CREATE INDEX IF NOT EXISTS "circles_regionId_status_createdAt_idx" ON "circles"("regionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "circle_members_circleId_status_idx" ON "circle_members"("circleId", "status");
CREATE INDEX IF NOT EXISTS "circle_members_userId_status_idx" ON "circle_members"("userId", "status");
