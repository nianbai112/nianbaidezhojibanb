-- CreateTable
CREATE TABLE `wechat_moment_batches` (
    `id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'uploading',
    `source` VARCHAR(191) NOT NULL DEFAULT 'cron',
    `imageCount` INTEGER NOT NULL DEFAULT 0,
    `snsId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `response` JSON NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wechat_moment_batches_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `wechat_moment_batches_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_moment_items` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `posterUrl` TEXT NULL,
    `posterWidth` INTEGER NULL,
    `posterHeight` INTEGER NULL,
    `posterSize` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wechat_moment_items_postId_key`(`postId`),
    INDEX `wechat_moment_items_batchId_idx`(`batchId`),
    INDEX `wechat_moment_items_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wechat_moment_items` ADD CONSTRAINT `wechat_moment_items_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechat_moment_items` ADD CONSTRAINT `wechat_moment_items_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `wechat_moment_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
