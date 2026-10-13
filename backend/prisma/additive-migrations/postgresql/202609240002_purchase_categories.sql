-- AlterTable
ALTER TABLE "purchase_products" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "purchase_categories" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_categories_shopId_parentId_enabled_sortOrder_idx" ON "purchase_categories"("shopId", "parentId", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "purchase_products_shopId_categoryId_enabled_sortOrder_idx" ON "purchase_products"("shopId", "categoryId", "enabled", "sortOrder");

-- AddForeignKey
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "purchase_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_categories" ADD CONSTRAINT "purchase_categories_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "purchase_shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_categories" ADD CONSTRAINT "purchase_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "purchase_categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Preserve existing flat categories as first-level shop categories.
INSERT INTO "purchase_categories" ("id", "shopId", "name", "updatedAt")
SELECT 'pc_' || md5("shopId" || '|' || "category"), "shopId", "category", CURRENT_TIMESTAMP
FROM "purchase_products" GROUP BY "shopId", "category";
UPDATE "purchase_products" SET "categoryId" = 'pc_' || md5("shopId" || '|' || "category");
