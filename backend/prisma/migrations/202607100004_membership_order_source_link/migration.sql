ALTER TABLE "user_memberships"
  ADD COLUMN IF NOT EXISTS "sourceOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_memberships_sourceOrderId_key"
  ON "user_memberships"("sourceOrderId");

DO $$ BEGIN
  ALTER TABLE "user_memberships"
    ADD CONSTRAINT "user_memberships_sourceOrderId_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "membership_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
