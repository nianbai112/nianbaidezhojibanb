ALTER TABLE `addresses` ADD COLUMN `provinceCode` VARCHAR(191) NULL, ADD COLUMN `cityCode` VARCHAR(191) NULL, ADD COLUMN `districtCode` VARCHAR(191) NULL;
ALTER TABLE `mall_products` ADD COLUMN `weightGrams` INTEGER NULL, ADD COLUMN `volumeCm3` INTEGER NULL;
ALTER TABLE `mall_product_skus` ADD COLUMN `weightGrams` INTEGER NULL, ADD COLUMN `volumeCm3` INTEGER NULL;
CREATE TABLE `mall_promotion_usages` (
  `id` VARCHAR(191) NOT NULL, `promotionId` VARCHAR(191) NOT NULL, `orderId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `discountAmount` DECIMAL(10,2) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'reserved',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `mall_promotion_usages_orderId_key` (`orderId`),
  INDEX `mall_promotion_usages_promotionId_status_idx` (`promotionId`, `status`),
  INDEX `mall_promotion_usages_promotionId_userId_status_idx` (`promotionId`, `userId`, `status`),
  CONSTRAINT `mall_promotion_usages_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `mall_promotions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `mall_promotion_usages_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `mall_orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `mall_promotion_usages_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
