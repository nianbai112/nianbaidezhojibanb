CREATE TABLE IF NOT EXISTS "payment_reservation_releases" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reservation_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_reservation_releases_paymentId_key"
  ON "payment_reservation_releases"("paymentId");
CREATE INDEX IF NOT EXISTS "payment_reservation_releases_status_updatedAt_idx"
  ON "payment_reservation_releases"("status", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "payment_reservation_releases"
    ADD CONSTRAINT "payment_reservation_releases_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "payment_reservation_releases" ("id", "paymentId", "status", "attempts", "createdAt", "updatedAt")
SELECT 'prr_' || "id", "id", 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "payment_orders"
WHERE "status" IN ('closed', 'failed')
  AND "bizType" IN ('mall_order', 'order', 'errand_order', 'activity_order')
ON CONFLICT ("paymentId") DO NOTHING;
