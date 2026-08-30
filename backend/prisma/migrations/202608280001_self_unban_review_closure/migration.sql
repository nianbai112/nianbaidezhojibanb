ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "banVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "self_unban_requests" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "activeKey" TEXT,
  "userId" TEXT NOT NULL,
  "banVersion" INTEGER NOT NULL DEFAULT 0,
  "regionId" TEXT NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_payment',
  "paymentNo" TEXT,
  "banReason" TEXT,
  "adminNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "self_unban_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "self_unban_requests_requestNo_key"
  ON "self_unban_requests"("requestNo");
CREATE UNIQUE INDEX IF NOT EXISTS "self_unban_requests_activeKey_key"
  ON "self_unban_requests"("activeKey");
CREATE INDEX IF NOT EXISTS "self_unban_requests_userId_status_createdAt_idx"
  ON "self_unban_requests"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "self_unban_requests_regionId_status_createdAt_idx"
  ON "self_unban_requests"("regionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "self_unban_requests_paymentNo_idx"
  ON "self_unban_requests"("paymentNo");

DO $$ BEGIN
  ALTER TABLE "self_unban_requests"
    ADD CONSTRAINT "self_unban_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "self_unban_requests"
    ADD CONSTRAINT "self_unban_requests_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
