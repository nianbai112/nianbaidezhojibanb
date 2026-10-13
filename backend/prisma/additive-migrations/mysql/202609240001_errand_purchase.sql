-- AlterTable
ALTER TABLE `wallet_transactions` MODIFY `type` ENUM('RECHARGE', 'WITHDRAW', 'PAY', 'REFUND', 'REWARD', 'TRANSFER_IN', 'TRANSFER_OUT', 'COMMISSION', 'PENALTY', 'PURCHASE_REIMBURSEMENT') NOT NULL;

-- CreateTable
CREATE TABLE `purchase_shops` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `logo` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `phone` VARCHAR(191) NULL,
    `opensAt` VARCHAR(191) NOT NULL DEFAULT '09:00',
    `closesAt` VARCHAR(191) NOT NULL DEFAULT '21:00',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_shops_regionId_enabled_idx`(`regionId`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_products` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT '全部商品',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_products_shopId_enabled_idx`(`shopId`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_skus` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT '标准规格',
    `priceCents` INTEGER NOT NULL,
    `weightGrams` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `purchase_skus_productId_enabled_idx`(`productId`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_combinations` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shopKey` VARCHAR(191) NOT NULL,
    `shopIds` JSON NOT NULL,
    `extraFeeCents` INTEGER NOT NULL DEFAULT 0,
    `maxGoodsCents` INTEGER NOT NULL DEFAULT 20000,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_combinations_regionId_enabled_idx`(`regionId`, `enabled`),
    UNIQUE INDEX `purchase_combinations_regionId_shopKey_key`(`regionId`, `shopKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `errand_purchases` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `quoteHash` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `initialGoodsCents` INTEGER NOT NULL,
    `approvedGoodsCents` INTEGER NOT NULL,
    `serviceCents` INTEGER NOT NULL,
    `feeSnapshot` JSON NOT NULL,
    `policySnapshot` JSON NOT NULL,
    `shortagePolicy` VARCHAR(191) NOT NULL DEFAULT 'refund_missing',
    `reimbursementStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `reimbursedCents` INTEGER NOT NULL DEFAULT 0,
    `reimbursedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `errand_purchases_requestKey_key`(`requestKey`),
    INDEX `errand_purchases_regionId_createdAt_idx`(`regionId`, `createdAt`),
    INDEX `errand_purchases_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_stops` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `receiptUrls` JSON NULL,
    `actualCents` INTEGER NOT NULL DEFAULT 0,
    `auditStatus` VARCHAR(191) NOT NULL DEFAULT 'unsubmitted',
    `auditNote` VARCHAR(191) NULL,
    `auditedBy` VARCHAR(191) NULL,
    `purchasedAt` DATETIME(3) NULL,
    `auditedAt` DATETIME(3) NULL,

    UNIQUE INDEX `purchase_stops_purchaseId_shopId_key`(`purchaseId`, `shopId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` VARCHAR(191) NOT NULL,
    `stopId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `quantity` INTEGER NOT NULL,
    `approvedUnitCents` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `purchase_items_stopId_idx`(`stopId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_changes` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `itemVersion` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitCents` INTEGER NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `deltaCents` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `evidenceUrls` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `purchase_changes_requestKey_key`(`requestKey`),
    INDEX `purchase_changes_purchaseId_status_idx`(`purchaseId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_refunds` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `allocations` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `lastError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_refunds_requestKey_key`(`requestKey`),
    INDEX `purchase_refunds_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_events` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `purchase_events_purchaseId_createdAt_idx`(`purchaseId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchase_products` ADD CONSTRAINT `purchase_products_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `purchase_shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_skus` ADD CONSTRAINT `purchase_skus_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `purchase_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `errand_purchases` ADD CONSTRAINT `errand_purchases_id_fkey` FOREIGN KEY (`id`) REFERENCES `errand_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_stops` ADD CONSTRAINT `purchase_stops_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `errand_purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_stopId_fkey` FOREIGN KEY (`stopId`) REFERENCES `purchase_stops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_changes` ADD CONSTRAINT `purchase_changes_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `errand_purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_changes` ADD CONSTRAINT `purchase_changes_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `purchase_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_refunds` ADD CONSTRAINT `purchase_refunds_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `errand_purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_events` ADD CONSTRAINT `purchase_events_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `errand_purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

