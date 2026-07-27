-- Additive errand receipt authority and pricing audit fields.
ALTER TABLE "errand_orders"
  ADD COLUMN IF NOT EXISTS "receiptConfirmDeadline" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receiptConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receiptConfirmedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementEligibleAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pricingSnapshot" JSONB;

-- Link every settlement amount to its source order for idempotent finance runs.
CREATE TABLE "rider_settlement_items" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "orderType" TEXT NOT NULL DEFAULT 'errand',
  "orderId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "deliveryFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tipAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "rewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "payableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'included',
  "reversalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reversedAt" TIMESTAMP(3),
  "reverseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_settlement_items_orderType_orderId_key"
  ON "rider_settlement_items"("orderType", "orderId");
CREATE INDEX "rider_settlement_items_settlementId_status_idx"
  ON "rider_settlement_items"("settlementId", "status");
CREATE INDEX "rider_settlement_items_riderId_createdAt_idx"
  ON "rider_settlement_items"("riderId", "createdAt");
ALTER TABLE "rider_settlement_items"
  ADD CONSTRAINT "rider_settlement_items_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "rider_settlements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Track post-settlement rider amounts that must be recovered after refunds.
CREATE TABLE "rider_liabilities" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_liabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_liabilities_orderId_refundId_key"
  ON "rider_liabilities"("orderId", "refundId");
CREATE INDEX "rider_liabilities_riderId_status_idx"
  ON "rider_liabilities"("riderId", "status");

-- One user review per errand order.
CREATE TABLE "errand_reviews" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "tags" JSONB,
  "content" TEXT,
  "images" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "errand_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "errand_reviews_orderId_key" ON "errand_reviews"("orderId");
CREATE INDEX "errand_reviews_riderId_createdAt_idx"
  ON "errand_reviews"("riderId", "createdAt");
