-- AlterEnum: add EXCHANGE to CouponType
ALTER TYPE "CouponType" ADD VALUE 'EXCHANGE';

-- AlterTable: coupons
ALTER TABLE "coupons"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "regionId" TEXT,
  ADD COLUMN "merchantId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: unique code
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex: status + endAt
CREATE INDEX "coupons_status_endAt_idx" ON "coupons"("status", "endAt");

-- CreateIndex: regionId
CREATE INDEX "coupons_regionId_idx" ON "coupons"("regionId");

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
