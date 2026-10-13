-- 客户群成员运营名册。仅保存成员身份摘要及本地账号关联，不保存原始微信成员ID或UnionID。可重复执行。
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'welfare_wecom_groups' AND column_name = 'rosterSyncedAt'), 'SELECT 1', 'ALTER TABLE `welfare_wecom_groups` ADD COLUMN `rosterSyncedAt` DATETIME(3) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
CREATE TABLE IF NOT EXISTS `welfare_wecom_members` (
  `id` VARCHAR(191) NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  `memberKey` VARCHAR(191) NOT NULL,
  `identityHash` VARCHAR(191) NULL,
  `identityScope` VARCHAR(256) NULL,
  `linkedUserId` VARCHAR(191) NULL,
  `identityState` VARCHAR(191) NOT NULL DEFAULT 'unlinked',
  `nickname` VARCHAR(191) NOT NULL,
  `memberType` INTEGER NOT NULL,
  `joinedAt` DATETIME(3) NULL,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL,
  `leftAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `welfare_wecom_members_groupId_memberKey_key` (`groupId`, `memberKey`),
  INDEX `welfare_wecom_members_groupId_leftAt_idx` (`groupId`, `leftAt`),
  INDEX `welfare_wecom_members_linkedUserId_idx` (`linkedUserId`),
  CONSTRAINT `welfare_wecom_members_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `welfare_wecom_groups` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
