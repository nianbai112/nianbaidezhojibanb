-- CreateEnum
CREATE TYPE "RiderSettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "rider_settlements" (
    "id" TEXT NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "regionId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "RiderSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_settlements_settlementNo_key" ON "rider_settlements"("settlementNo");
CREATE INDEX "rider_settlements_riderId_periodStart_idx" ON "rider_settlements"("riderId", "periodStart");
CREATE INDEX "rider_settlements_status_createdAt_idx" ON "rider_settlements"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
