-- Add stable mini-program user uid and first-class region manager ownership.

CREATE SEQUENCE IF NOT EXISTS "users_uid_seq";

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "uid" INTEGER;

ALTER TABLE "users"
  ALTER COLUMN "uid" SET DEFAULT nextval('"users_uid_seq"'::regclass);

UPDATE "users"
SET "uid" = nextval('"users_uid_seq"'::regclass)
WHERE "uid" IS NULL;

SELECT setval(
  '"users_uid_seq"'::regclass,
  COALESCE((SELECT MAX("uid") FROM "users"), 0) + 1,
  false
);

ALTER TABLE "users" ALTER COLUMN "uid" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_uid_key" ON "users"("uid");

ALTER SEQUENCE "users_uid_seq" OWNED BY "users"."uid";

ALTER TABLE "regions" ADD COLUMN IF NOT EXISTS "manager_name" TEXT;
ALTER TABLE "regions" ADD COLUMN IF NOT EXISTS "manager_phone" TEXT;
ALTER TABLE "regions" ADD COLUMN IF NOT EXISTS "manager_wechat" TEXT;
ALTER TABLE "regions" ADD COLUMN IF NOT EXISTS "manager_account_id" TEXT;

CREATE INDEX IF NOT EXISTS "regions_manager_account_id_idx" ON "regions"("manager_account_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'regions_manager_account_id_fkey'
  ) THEN
    ALTER TABLE "regions"
      ADD CONSTRAINT "regions_manager_account_id_fkey"
      FOREIGN KEY ("manager_account_id")
      REFERENCES "admin_accounts"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
