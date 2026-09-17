-- CreateTable
CREATE TABLE `welfare_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `cover` TEXT NULL,
    `mode` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `regionId` VARCHAR(191) NULL,
    `requireStudent` BOOLEAN NOT NULL DEFAULT false,
    `memberOnly` BOOLEAN NOT NULL DEFAULT false,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `drawAt` DATETIME(3) NULL,
    `claimUntil` DATETIME(3) NOT NULL,
    `dailyLimit` INTEGER NOT NULL DEFAULT 1,
    `totalLimit` INTEGER NOT NULL DEFAULT 1,
    `maxEntries` INTEGER NOT NULL DEFAULT 10000,
    `entryCount` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `pickupLocation` TEXT NULL,
    `contact` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `drawnAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `welfare_campaigns_status_mode_drawAt_idx`(`status`, `mode`, `drawAt`),
    INDEX `welfare_campaigns_regionId_status_createdAt_idx`(`regionId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_prizes` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` TEXT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `couponId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `probabilityBps` INTEGER NOT NULL DEFAULT 0,
    `issuedCount` INTEGER NOT NULL DEFAULT 0,
    `couponReserved` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `welfare_prizes_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_entries` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NOT NULL DEFAULT '同学',
    `requestKey` VARCHAR(191) NOT NULL,
    `ordinal` INTEGER NOT NULL,
    `dayKey` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'random',
    `outcome` VARCHAR(191) NOT NULL DEFAULT 'waiting',
    `prizeId` VARCHAR(191) NULL,
    `claimStatus` VARCHAR(191) NOT NULL DEFAULT 'none',
    `claimCode` VARCHAR(191) NULL,
    `couponReceiveId` VARCHAR(191) NULL,
    `deliveryError` TEXT NULL,
    `redeemedBy` VARCHAR(191) NULL,
    `redeemedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `welfare_entries_claimCode_key`(`claimCode`),
    UNIQUE INDEX `welfare_entries_couponReceiveId_key`(`couponReceiveId`),
    INDEX `welfare_entries_userId_outcome_createdAt_idx`(`userId`, `outcome`, `createdAt`),
    INDEX `welfare_entries_campaignId_userId_dayKey_idx`(`campaignId`, `userId`, `dayKey`),
    INDEX `welfare_entries_outcome_claimStatus_idx`(`outcome`, `claimStatus`),
    UNIQUE INDEX `welfare_entries_campaignId_userId_requestKey_key`(`campaignId`, `userId`, `requestKey`),
    UNIQUE INDEX `welfare_entries_campaignId_userId_ordinal_key`(`campaignId`, `userId`, `ordinal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_gifts` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `prizeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',

    UNIQUE INDEX `welfare_gifts_campaignId_userId_key`(`campaignId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_draws` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `candidateCount` INTEGER NOT NULL,
    `randomWinners` INTEGER NOT NULL,
    `giftedCount` INTEGER NOT NULL,
    `algorithm` VARCHAR(191) NOT NULL DEFAULT 'crypto_random_int_v1',
    `rules` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `welfare_draws_campaignId_key`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `welfare_prizes` ADD CONSTRAINT `welfare_prizes_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `welfare_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_entries` ADD CONSTRAINT `welfare_entries_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `welfare_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_entries` ADD CONSTRAINT `welfare_entries_prizeId_fkey` FOREIGN KEY (`prizeId`) REFERENCES `welfare_prizes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_gifts` ADD CONSTRAINT `welfare_gifts_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `welfare_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_gifts` ADD CONSTRAINT `welfare_gifts_prizeId_fkey` FOREIGN KEY (`prizeId`) REFERENCES `welfare_prizes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_draws` ADD CONSTRAINT `welfare_draws_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `welfare_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

