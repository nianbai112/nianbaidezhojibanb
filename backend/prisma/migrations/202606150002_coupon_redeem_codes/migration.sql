CREATE TABLE IF NOT EXISTS "coupon_redeem_codes" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "batchName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "totalLimit" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "perUserLimit" INTEGER NOT NULL DEFAULT 1,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "regionId" TEXT,
  "remark" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_redeem_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupon_redeem_codes_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redeem_codes_code_key" ON "coupon_redeem_codes"("code");
CREATE INDEX IF NOT EXISTS "coupon_redeem_codes_couponId_status_idx" ON "coupon_redeem_codes"("couponId", "status");
CREATE INDEX IF NOT EXISTS "coupon_redeem_codes_regionId_idx" ON "coupon_redeem_codes"("regionId");
CREATE INDEX IF NOT EXISTS "coupon_redeem_codes_status_endAt_idx" ON "coupon_redeem_codes"("status", "endAt");

CREATE TABLE IF NOT EXISTS "coupon_redeem_records" (
  "id" TEXT NOT NULL,
  "redeemCodeId" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "receiveId" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_redeem_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupon_redeem_records_redeemCodeId_fkey" FOREIGN KEY ("redeemCodeId") REFERENCES "coupon_redeem_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "coupon_redeem_records_redeemCodeId_idx" ON "coupon_redeem_records"("redeemCodeId");
CREATE INDEX IF NOT EXISTS "coupon_redeem_records_couponId_idx" ON "coupon_redeem_records"("couponId");
CREATE INDEX IF NOT EXISTS "coupon_redeem_records_userId_idx" ON "coupon_redeem_records"("userId");
