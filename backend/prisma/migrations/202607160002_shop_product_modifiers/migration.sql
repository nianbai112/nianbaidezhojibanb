CREATE TABLE "product_modifier_groups" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'attribute',
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'on_sale',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_modifier_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_modifier_options" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "stock" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'on_sale',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_modifier_options_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "carts"
  ADD COLUMN IF NOT EXISTS "selectionKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "modifierSelections" JSONB;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "modifierSelections" JSONB;

DROP INDEX IF EXISTS "carts_userId_productId_skuId_key";
CREATE UNIQUE INDEX "carts_user_product_sku_selection_key"
  ON "carts" ("userId", "productId", COALESCE("skuId", ''), "selectionKey");
CREATE INDEX "product_modifier_groups_productId_status_sortOrder_idx"
  ON "product_modifier_groups" ("productId", "status", "sortOrder");
CREATE INDEX "product_modifier_options_groupId_status_sortOrder_idx"
  ON "product_modifier_options" ("groupId", "status", "sortOrder");

ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_modifier_options" ADD CONSTRAINT "product_modifier_options_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "product_modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
