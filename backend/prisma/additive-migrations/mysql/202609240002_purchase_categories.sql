-- AlterTable
ALTER TABLE `purchase_products` ADD COLUMN `categoryId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `purchase_categories` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_categories_shopId_parentId_enabled_sortOrder_idx`(`shopId`, `parentId`, `enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `purchase_products_shopId_categoryId_enabled_sortOrder_idx` ON `purchase_products`(`shopId`, `categoryId`, `enabled`, `sortOrder`);

-- AddForeignKey
ALTER TABLE `purchase_products` ADD CONSTRAINT `purchase_products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `purchase_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_categories` ADD CONSTRAINT `purchase_categories_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `purchase_shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_categories` ADD CONSTRAINT `purchase_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `purchase_categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Preserve existing flat categories as first-level shop categories.
INSERT INTO `purchase_categories` (`id`, `shopId`, `name`, `updatedAt`)
SELECT CONCAT('pc_', MD5(CONCAT(`shopId`, '|', `category`))), `shopId`, `category`, CURRENT_TIMESTAMP(3)
FROM `purchase_products` GROUP BY `shopId`, `category`;
UPDATE `purchase_products` p JOIN `purchase_categories` c ON c.`shopId` = p.`shopId` AND c.`name` = p.`category` SET p.`categoryId` = c.`id`;
