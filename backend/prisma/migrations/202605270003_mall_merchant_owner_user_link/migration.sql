ALTER TABLE "mall_merchants" ALTER COLUMN "userId" DROP NOT NULL;

UPDATE "mall_merchants" m
SET "userId" = NULL
WHERE m."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" u WHERE u."id" = m."userId"
  );

CREATE INDEX IF NOT EXISTS "mall_merchants_userId_idx" ON "mall_merchants"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mall_merchants_userId_fkey'
  ) THEN
    ALTER TABLE "mall_merchants"
      ADD CONSTRAINT "mall_merchants_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
