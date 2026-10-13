-- 代买店铺规格库：口味属性组与加料组，以及商品挂载关系。可重复执行。

-- AlterTable
ALTER TABLE "purchase_products" ADD COLUMN IF NOT EXISTS "modifierBindings" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_modifier_groups" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'attribute',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "maxTotalQuantity" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_modifier_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_modifier_groups_shopId_enabled_sortOrder_idx" ON "purchase_modifier_groups"("shopId", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_modifier_options_groupId_enabled_sortOrder_idx" ON "purchase_modifier_options"("groupId", "enabled", "sortOrder");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_modifier_groups_shopId_fkey') THEN
    ALTER TABLE "purchase_modifier_groups" ADD CONSTRAINT "purchase_modifier_groups_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "purchase_shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_modifier_options_groupId_fkey') THEN
    ALTER TABLE "purchase_modifier_options" ADD CONSTRAINT "purchase_modifier_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "purchase_modifier_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
