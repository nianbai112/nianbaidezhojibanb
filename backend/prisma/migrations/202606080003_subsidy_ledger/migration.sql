ALTER TABLE "orders" ADD COLUMN "originalFreightAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "subsidyAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "subsidy_ledgers" (
  "id" TEXT NOT NULL,
  "subsidyNo" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "benefitKey" TEXT,
  "campaignId" TEXT,
  "orderType" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNo" TEXT,
  "userId" TEXT,
  "payerType" TEXT NOT NULL DEFAULT 'platform',
  "payerId" TEXT,
  "receiverType" TEXT NOT NULL DEFAULT 'platform',
  "receiverId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "settlementId" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),

  CONSTRAINT "subsidy_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subsidy_ledgers_subsidyNo_key" ON "subsidy_ledgers"("subsidyNo");
CREATE INDEX "subsidy_ledgers_orderType_orderId_idx" ON "subsidy_ledgers"("orderType", "orderId");
CREATE INDEX "subsidy_ledgers_sourceType_benefitKey_idx" ON "subsidy_ledgers"("sourceType", "benefitKey");
CREATE INDEX "subsidy_ledgers_payerType_status_idx" ON "subsidy_ledgers"("payerType", "status");
CREATE INDEX "subsidy_ledgers_receiverType_receiverId_status_idx" ON "subsidy_ledgers"("receiverType", "receiverId", "status");
CREATE INDEX "subsidy_ledgers_createdAt_idx" ON "subsidy_ledgers"("createdAt");
