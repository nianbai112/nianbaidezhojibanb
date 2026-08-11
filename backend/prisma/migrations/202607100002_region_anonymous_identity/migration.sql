-- Make anonymous identities region-owned. Existing global records are cloned to
-- every existing region, then removed; historical posts/comments keep snapshots.
ALTER TABLE "anonymous_identities" ADD COLUMN IF NOT EXISTS "regionId" TEXT;

INSERT INTO "anonymous_identities" ("id", "name", "avatar", "createdAt", "regionId")
SELECT 'legacy-' || md5(identity."id" || ':' || region."id"), identity."name", identity."avatar", identity."createdAt", region."id"
FROM "anonymous_identities" AS identity
CROSS JOIN "regions" AS region
WHERE identity."regionId" IS NULL
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "anonymous_identities" WHERE "regionId" IS NULL;

ALTER TABLE "anonymous_identities" ALTER COLUMN "regionId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "anonymous_identities_regionId_createdAt_idx"
  ON "anonymous_identities" ("regionId", "createdAt");
ALTER TABLE "anonymous_identities"
  ADD CONSTRAINT "anonymous_identities_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
