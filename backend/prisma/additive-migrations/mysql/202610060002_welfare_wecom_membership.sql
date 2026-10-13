-- 福利抽奖企业微信群成员核验：活动的群核验方式与开奖前复核、报名记录的群核验结果、企业微信官方群名册。可重复执行。
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_campaigns' AND column_name = 'groupVerificationMode'), 'SELECT 1', 'ALTER TABLE `welfare_campaigns` ADD COLUMN `groupVerificationMode` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''wechat_card'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_campaigns' AND column_name = 'groupRecheckAtDraw'), 'SELECT 1', 'ALTER TABLE `welfare_campaigns` ADD COLUMN `groupRecheckAtDraw` BOOLEAN NOT NULL DEFAULT false'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_entries' AND column_name = 'groupVerifiedId'), 'SELECT 1', 'ALTER TABLE `welfare_entries` ADD COLUMN `groupVerifiedId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_entries' AND column_name = 'groupCheckedAtDraw'), 'SELECT 1', 'ALTER TABLE `welfare_entries` ADD COLUMN `groupCheckedAtDraw` DATETIME(3) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_entries' AND column_name = 'exclusionReason'), 'SELECT 1', 'ALTER TABLE `welfare_entries` ADD COLUMN `exclusionReason` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

CREATE TABLE IF NOT EXISTS `welfare_wecom_groups` (
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
