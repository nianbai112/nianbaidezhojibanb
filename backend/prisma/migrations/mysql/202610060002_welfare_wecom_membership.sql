-- AlterTable
ALTER TABLE `welfare_campaigns` ADD COLUMN `groupRecheckAtDraw` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `groupVerificationMode` VARCHAR(191) NOT NULL DEFAULT 'wechat_card';

-- AlterTable
ALTER TABLE `welfare_entries` ADD COLUMN `exclusionReason` VARCHAR(191) NULL,
    ADD COLUMN `groupCheckedAtDraw` DATETIME(3) NULL,
    ADD COLUMN `groupVerifiedId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `welfare_wecom_groups` (
    `id` VARCHAR(191) NOT NULL,
    `corpId` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NULL,
    `memberCount` INTEGER NOT NULL DEFAULT 0,
    `identifiableCount` INTEGER NOT NULL DEFAULT 0,
    `isDismissed` BOOLEAN NOT NULL DEFAULT false,
    `memberHashes` JSON NULL,
    `memberVersion` VARCHAR(191) NULL,
    `configFingerprint` VARCHAR(191) NULL,
    `dirtyVersion` INTEGER NOT NULL DEFAULT 0,
    `snapshotVersion` INTEGER NOT NULL DEFAULT -1,
    `syncedAt` DATETIME(3) NULL,
    `syncError` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `welfare_wecom_groups_regionId_updatedAt_idx`(`regionId`, `updatedAt`),
    INDEX `welfare_wecom_groups_syncedAt_idx`(`syncedAt`),
    UNIQUE INDEX `welfare_wecom_groups_corpId_chatId_key`(`corpId`, `chatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

