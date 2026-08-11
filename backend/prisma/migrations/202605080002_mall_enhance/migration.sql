-- MallProduct: add new columns
DO $$ BEGIN ALTER TABLE "mall_products" ADD COLUMN "subtitle" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_products" ADD COLUMN "mainImage" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_products" ADD COLUMN "isNew" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- MallMerchant: add new columns
DO $$ BEGIN ALTER TABLE "mall_merchants" ADD COLUMN "rejectReason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_merchants" ADD COLUMN "totalOrders" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_merchants" ADD COLUMN "isShow" BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- MallOrder: add new columns
DO $$ BEGIN ALTER TABLE "mall_orders" ADD COLUMN "productAmount" DECIMAL(10,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_orders" ADD COLUMN "buyerMessage" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_orders" ADD COLUMN "deliveryType" TEXT NOT NULL DEFAULT 'express'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- MallRefund: add new columns
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "orderItemId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "refundType" TEXT NOT NULL DEFAULT 'refund_only'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "images" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "merchantReply" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "rejectReason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "merchantReplyTime" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_refunds" ADD COLUMN "refundTime" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create MallProductSku table
CREATE TABLE IF NOT EXISTS "mall_product_skus" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuName" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mall_product_skus_pkey" PRIMARY KEY ("id")
);

-- Create MallOrderItem table
CREATE TABLE IF NOT EXISTS "mall_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productImage" TEXT,
    "skuId" TEXT,
    "skuName" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mall_order_items_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "mall_product_skus" ADD CONSTRAINT "mall_product_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "mall_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mall_order_items" ADD CONSTRAINT "mall_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
