ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "businessScope" TEXT NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS "coupons_businessScope_idx" ON "coupons"("businessScope");
