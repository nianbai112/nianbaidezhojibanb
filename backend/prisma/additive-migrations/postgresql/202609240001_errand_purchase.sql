-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PURCHASE_REIMBURSEMENT';

-- CreateTable
CREATE TABLE "purchase_shops" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "opensAt" TEXT NOT NULL DEFAULT '09:00',
    "closesAt" TEXT NOT NULL DEFAULT '21:00',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_products" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "category" TEXT NOT NULL DEFAULT '全部商品',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_skus" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '标准规格',
    "priceCents" INTEGER NOT NULL,
    "weightGrams" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_combinations" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopKey" TEXT NOT NULL,
    "shopIds" JSONB NOT NULL,
    "extraFeeCents" INTEGER NOT NULL DEFAULT 0,
    "maxGoodsCents" INTEGER NOT NULL DEFAULT 20000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errand_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "quoteHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "initialGoodsCents" INTEGER NOT NULL,
    "approvedGoodsCents" INTEGER NOT NULL,
    "serviceCents" INTEGER NOT NULL,
    "feeSnapshot" JSONB NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "shortagePolicy" TEXT NOT NULL DEFAULT 'refund_missing',
    "reimbursementStatus" TEXT NOT NULL DEFAULT 'pending',
    "reimbursedCents" INTEGER NOT NULL DEFAULT 0,
    "reimbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "errand_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_stops" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "receiptUrls" JSONB,
    "actualCents" INTEGER NOT NULL DEFAULT 0,
    "auditStatus" TEXT NOT NULL DEFAULT 'unsubmitted',
    "auditNote" TEXT,
    "auditedBy" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "auditedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "approvedUnitCents" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_changes" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "itemVersion" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "skuId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrls" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_refunds" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_events" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_shops_regionId_enabled_idx" ON "purchase_shops"("regionId", "enabled");

-- CreateIndex
CREATE INDEX "purchase_products_shopId_enabled_idx" ON "purchase_products"("shopId", "enabled");

-- CreateIndex
CREATE INDEX "purchase_skus_productId_enabled_idx" ON "purchase_skus"("productId", "enabled");

-- CreateIndex
CREATE INDEX "purchase_combinations_regionId_enabled_idx" ON "purchase_combinations"("regionId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_combinations_regionId_shopKey_key" ON "purchase_combinations"("regionId", "shopKey");

-- CreateIndex
CREATE UNIQUE INDEX "errand_purchases_requestKey_key" ON "errand_purchases"("requestKey");

-- CreateIndex
CREATE INDEX "errand_purchases_regionId_createdAt_idx" ON "errand_purchases"("regionId", "createdAt");

-- CreateIndex
CREATE INDEX "errand_purchases_userId_createdAt_idx" ON "errand_purchases"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_stops_purchaseId_shopId_key" ON "purchase_stops"("purchaseId", "shopId");

-- CreateIndex
CREATE INDEX "purchase_items_stopId_idx" ON "purchase_items"("stopId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_changes_requestKey_key" ON "purchase_changes"("requestKey");

-- CreateIndex
CREATE INDEX "purchase_changes_purchaseId_status_idx" ON "purchase_changes"("purchaseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_refunds_requestKey_key" ON "purchase_refunds"("requestKey");

-- CreateIndex
CREATE INDEX "purchase_refunds_status_createdAt_idx" ON "purchase_refunds"("status", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_events_purchaseId_createdAt_idx" ON "purchase_events"("purchaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "purchase_shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_skus" ADD CONSTRAINT "purchase_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "purchase_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_purchases" ADD CONSTRAINT "errand_purchases_id_fkey" FOREIGN KEY ("id") REFERENCES "errand_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_stops" ADD CONSTRAINT "purchase_stops_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "errand_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "purchase_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_changes" ADD CONSTRAINT "purchase_changes_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "errand_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_changes" ADD CONSTRAINT "purchase_changes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_refunds" ADD CONSTRAINT "purchase_refunds_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "errand_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "errand_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

