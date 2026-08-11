-- Additive repair: do not edit already-deployed migrations.
ALTER TABLE "membership_benefit_usages"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "membership_benefit_usages_idempotencyKey_key"
  ON "membership_benefit_usages"("idempotencyKey");
