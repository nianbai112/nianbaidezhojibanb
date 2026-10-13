-- Existing addresses and products keep NULL measurements/codes until explicitly completed.
ALTER TABLE "addresses" ADD COLUMN "provinceCode" TEXT, ADD COLUMN "cityCode" TEXT, ADD COLUMN "districtCode" TEXT;
ALTER TABLE "mall_products" ADD COLUMN "weightGrams" INTEGER, ADD COLUMN "volumeCm3" INTEGER;
ALTER TABLE "mall_product_skus" ADD COLUMN "weightGrams" INTEGER, ADD COLUMN "volumeCm3" INTEGER;
CREATE TABLE "mall_promotion_usages" (
  "id" TEXT NOT NULL, "promotionId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL, "status" TEXT NOT NULL DEFAULT 'reserved',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mall_promotion_usages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mall_promotion_usages_orderId_key" ON "mall_promotion_usages"("orderId");
CREATE INDEX "mall_promotion_usages_promotionId_status_idx" ON "mall_promotion_usages"("promotionId", "status");
CREATE INDEX "mall_promotion_usages_promotionId_userId_status_idx" ON "mall_promotion_usages"("promotionId", "userId", "status");
ALTER TABLE "mall_promotion_usages" ADD CONSTRAINT "mall_promotion_usages_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "mall_promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mall_promotion_usages" ADD CONSTRAINT "mall_promotion_usages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mall_promotion_usages" ADD CONSTRAINT "mall_promotion_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
