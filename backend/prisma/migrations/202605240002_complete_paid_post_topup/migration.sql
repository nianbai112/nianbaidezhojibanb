-- Complete paid post pinning on the existing topnotes/topup compatibility tables.
ALTER TABLE "topup_packages"
  ADD COLUMN IF NOT EXISTS "originalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "duration" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "durationUnit" TEXT NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "topup_orders"
  ADD COLUMN IF NOT EXISTS "postId" TEXT,
  ADD COLUMN IF NOT EXISTS "regionId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentNo" TEXT,
  ADD COLUMN IF NOT EXISTS "packageName" TEXT,
  ADD COLUMN IF NOT EXISTS "packageSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "duration" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "durationUnit" TEXT NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS "topExpireAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "topup_orders_postId_status_idx" ON "topup_orders"("postId", "status");
CREATE INDEX IF NOT EXISTS "topup_orders_regionId_createdAt_idx" ON "topup_orders"("regionId", "createdAt");
CREATE INDEX IF NOT EXISTS "topup_orders_paymentNo_idx" ON "topup_orders"("paymentNo");
