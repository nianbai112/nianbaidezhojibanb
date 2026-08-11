ALTER TABLE "coupon_receives"
  ADD COLUMN IF NOT EXISTS "sourceMembershipId" TEXT;

CREATE INDEX IF NOT EXISTS "coupon_receives_sourceMembershipId_status_idx"
  ON "coupon_receives"("sourceMembershipId", "status");
