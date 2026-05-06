-- CreateTable: alipay_transfers
CREATE TABLE "alipay_transfers" (
  "id" TEXT NOT NULL,
  "transferNo" TEXT NOT NULL,
  "payeeAccount" TEXT NOT NULL,
  "payeeName" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "failReason" TEXT,
  "alipayOrderNo" TEXT,
  "operatorId" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alipay_transfers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alipay_transfers_transferNo_key" ON "alipay_transfers"("transferNo");
ALTER TABLE "alipay_transfers" ADD CONSTRAINT "alipay_transfers_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: region_balance_logs
CREATE TABLE "region_balance_logs" (
  "id" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "balance" DECIMAL(12,2) NOT NULL,
  "orderNo" TEXT,
  "description" TEXT,
  "operatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "region_balance_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "region_balance_logs_regionId_createdAt_idx" ON "region_balance_logs"("regionId", "createdAt");
ALTER TABLE "region_balance_logs" ADD CONSTRAINT "region_balance_logs_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "region_balance_logs" ADD CONSTRAINT "region_balance_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: regions add totalCommission
ALTER TABLE "regions" ADD COLUMN "totalCommission" DECIMAL(12,2) DEFAULT 0;
