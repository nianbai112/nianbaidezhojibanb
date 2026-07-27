ALTER TABLE "user_experiences" ADD COLUMN IF NOT EXISTS "regionId" TEXT;
ALTER TABLE "user_experiences" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "user_experiences" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "user_experiences" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_experiences_regionId_fkey'
  ) THEN
    ALTER TABLE "user_experiences"
      ADD CONSTRAINT "user_experiences_regionId_fkey"
      FOREIGN KEY ("regionId") REFERENCES "regions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_experiences_userId_regionId_createdAt_idx"
  ON "user_experiences"("userId", "regionId", "createdAt");

CREATE INDEX IF NOT EXISTS "user_experiences_regionId_createdAt_idx"
  ON "user_experiences"("regionId", "createdAt");

CREATE INDEX IF NOT EXISTS "user_experiences_source_sourceId_idx"
  ON "user_experiences"("source", "sourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "user_experiences_userId_regionId_source_sourceId_key"
  ON "user_experiences"("userId", "regionId", "source", "sourceId")
  WHERE "source" IS NOT NULL AND "sourceId" IS NOT NULL;
