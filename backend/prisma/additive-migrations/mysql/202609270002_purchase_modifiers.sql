-- 代买店铺规格库：口味属性组与加料组，以及商品挂载关系。可重复执行。

-- AlterTable
SET @lm_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'purchase_products'
     AND COLUMN_NAME = 'modifierBindings') = 0,
  'ALTER TABLE `purchase_products` ADD COLUMN `modifierBindings` JSON NULL',
  'SELECT 1'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;

-- CreateTable
CREATE TABLE IF NOT EXISTS `purchase_modifier_groups` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'attribute',
    `required` BOOLEAN NOT NULL DEFAULT false,
    `maxSelect` INTEGER NOT NULL DEFAULT 1,
    `maxTotalQuantity` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_modifier_groups_shopId_enabled_sortOrder_idx`(`shopId`, `enabled`, `sortOrder`),
    PRIMARY KEY (`id`),
    CONSTRAINT `purchase_modifier_groups_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `purchase_shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `purchase_modifier_options` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `priceCents` INTEGER NOT NULL DEFAULT 0,
    `maxQuantity` INTEGER NOT NULL DEFAULT 1,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `soldOut` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_modifier_options_groupId_enabled_sortOrder_idx`(`groupId`, `enabled`, `sortOrder`),
    PRIMARY KEY (`id`),
    CONSTRAINT `purchase_modifier_options_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `purchase_modifier_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
