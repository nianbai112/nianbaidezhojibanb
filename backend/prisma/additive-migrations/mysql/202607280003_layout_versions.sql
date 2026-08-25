CREATE TABLE IF NOT EXISTS `layout_versions` (
  `id` VARCHAR(191) NOT NULL,
  `pageType` VARCHAR(191) NOT NULL,
  `regionId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `config` JSON NOT NULL,
  `note` TEXT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `layout_versions_pageType_regionId_version_key` (`pageType`, `regionId`, `version`),
  INDEX `layout_versions_pageType_regionId_idx` (`pageType`, `regionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
