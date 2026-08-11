-- MySQL version of badge/title/topic-header migration.
-- Use this file only when the deployment database is MySQL.

CREATE TABLE `circle_topic_headers` (
  `id` VARCHAR(191) NOT NULL,
  `circleId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `circle_topic_headers_circleId_title_key` (`circleId`, `title`),
  INDEX `circle_topic_headers_circleId_sortOrder_idx` (`circleId`, `sortOrder`),
  CONSTRAINT `circle_topic_headers_circleId_fkey`
    FOREIGN KEY (`circleId`) REFERENCES `circles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `circle_topic_groups`
  ADD COLUMN `headerId` VARCHAR(191) NULL;

CREATE INDEX `circle_topic_groups_headerId_sortOrder_idx`
  ON `circle_topic_groups`(`headerId`, `sortOrder`);

ALTER TABLE `circle_topic_groups`
  ADD CONSTRAINT `circle_topic_groups_headerId_fkey`
    FOREIGN KEY (`headerId`) REFERENCES `circle_topic_headers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `badges`
  ADD COLUMN `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `user_titles`
  ADD COLUMN `image` VARCHAR(191) NULL,
  ADD COLUMN `backgroundColor` VARCHAR(191) NULL,
  ADD COLUMN `textColor` VARCHAR(191) NULL,
  ADD COLUMN `borderColor` VARCHAR(191) NULL,
  ADD COLUMN `style` JSON NULL,
  ADD COLUMN `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
