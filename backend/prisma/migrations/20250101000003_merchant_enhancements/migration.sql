-- CreateEnum
CREATE TYPE "PriceAdjustmentType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "PriceAdjustmentScope" AS ENUM ('REGION', 'CATEGORY', 'MERCHANT');

-- AlterTable: add new columns to merchants
ALTER TABLE "merchants" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "merchants" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: product_price_adjustments
CREATE TABLE "product_price_adjustments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PriceAdjustmentType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "scope" "PriceAdjustmentScope" NOT NULL,
    "regionId" TEXT,
    "categoryId" TEXT,
    "merchantId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_price_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_price_adjustments_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "product_price_adjustments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "product_price_adjustments_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: region_merchant_settings
CREATE TABLE "region_merchant_settings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "autoAuditEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxMerchants" INTEGER,
    "commissionRate" DECIMAL(5,2),
    "minWithdrawAmount" DECIMAL(10,2),
    "withdrawFeeRate" DECIMAL(5,2),
    "defaultDeliveryRange" INTEGER,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "maxProductCount" INTEGER,
    "requireProductAudit" BOOLEAN NOT NULL DEFAULT true,
    "settlementCycle" TEXT DEFAULT 'weekly',
    "settlementDay" INTEGER DEFAULT 1,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_merchant_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "region_merchant_settings_regionId_key" UNIQUE ("regionId"),
    CONSTRAINT "region_merchant_settings_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
