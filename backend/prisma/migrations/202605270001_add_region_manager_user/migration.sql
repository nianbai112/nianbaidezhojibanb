ALTER TABLE "regions" ADD COLUMN IF NOT EXISTS "manager_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "regions_manager_user_id_idx" ON "regions"("manager_user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'regions_manager_user_id_fkey'
  ) THEN
    ALTER TABLE "regions"
      ADD CONSTRAINT "regions_manager_user_id_fkey"
      FOREIGN KEY ("manager_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
