-- Create missing base tables from older deployments before applying enhancements.
CREATE TABLE IF NOT EXISTS "group_buy_categories" (
  "id" TEXT NOT NULL,
  "regionId" TEXT,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isShow" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_buy_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "group_buy_reviews" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "content" TEXT,
  "images" JSONB,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_buy_reviews_pkey" PRIMARY KEY ("id")
);

-- AlterTable: group_buy_categories
ALTER TABLE "group_buy_categories"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: group_buy_packages
ALTER TABLE "group_buy_packages"
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "merchantId" TEXT,
  ADD COLUMN IF NOT EXISTS "images" JSONB,
  ADD COLUMN IF NOT EXISTS "detail" TEXT,
  ADD COLUMN IF NOT EXISTS "buyNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "verifyInfo" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS "regionCommissionRate" DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: group_buy_orders
ALTER TABLE "group_buy_orders"
  ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "verifyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "verifyStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "verifyTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundReason" TEXT,
  ADD COLUMN IF NOT EXISTS "refundAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "refundTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commissionAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "regionCommissionAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "buyerName" TEXT,
  ADD COLUMN IF NOT EXISTS "buyerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "remark" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: group_buy_reviews
ALTER TABLE "group_buy_reviews"
  ADD COLUMN IF NOT EXISTS "orderId" TEXT,
  ADD COLUMN IF NOT EXISTS "reply" TEXT,
  ADD COLUMN IF NOT EXISTS "replyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Foreign keys are guarded because older databases can be partially migrated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_packages_categoryId_fkey') THEN
    ALTER TABLE "group_buy_packages" ADD CONSTRAINT "group_buy_packages_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "group_buy_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_packages_merchantId_fkey') THEN
    ALTER TABLE "group_buy_packages" ADD CONSTRAINT "group_buy_packages_merchantId_fkey"
      FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_orders_packageId_fkey') THEN
    ALTER TABLE "group_buy_orders" ADD CONSTRAINT "group_buy_orders_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "group_buy_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_reviews_userId_fkey') THEN
    ALTER TABLE "group_buy_reviews" ADD CONSTRAINT "group_buy_reviews_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_reviews_packageId_fkey') THEN
    ALTER TABLE "group_buy_reviews" ADD CONSTRAINT "group_buy_reviews_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "group_buy_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_buy_reviews_orderId_fkey') THEN
    ALTER TABLE "group_buy_reviews" ADD CONSTRAINT "group_buy_reviews_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "group_buy_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
