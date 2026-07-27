ALTER TABLE `errand_orders`
  MODIFY COLUMN `remark` TEXT NULL;

CREATE TABLE IF NOT EXISTS `errand_order_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `taskType` VARCHAR(191) NOT NULL DEFAULT 'custom_task',
  `itemSizeId` VARCHAR(191) NULL,
  `pickupPointId` VARCHAR(191) NULL,
  `expressCompany` VARCHAR(191) NULL,
  `platform` VARCHAR(191) NULL,
  `code` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `itemDescription` TEXT NULL,
  `pickupAddress` TEXT NULL,
  `recipientAddress` TEXT NULL,
  `budgetAmount` DECIMAL(10,2) NULL,
  `computedFee` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `imageUrls` JSON NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `errand_order_tasks_orderId_sortOrder_idx` (`orderId`, `sortOrder`),
  INDEX `errand_order_tasks_taskType_idx` (`taskType`),
  CONSTRAINT `errand_order_tasks_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `errand_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
