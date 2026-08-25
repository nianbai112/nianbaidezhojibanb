SET @lm_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus_map_collection_sessions' AND column_name = 'objectCount'),
  'SELECT 1',
  'ALTER TABLE `campus_map_collection_sessions` ADD COLUMN `objectCount` INTEGER NOT NULL DEFAULT 0'
);
PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

CREATE TABLE IF NOT EXISTS `campus_map_collection_objects` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `clientObjectId` VARCHAR(191) NOT NULL,
  `objectType` VARCHAR(191) NOT NULL,
  `geometry` JSON NOT NULL,
  `properties` JSON NOT NULL,
  `longitude` DOUBLE NULL,
  `latitude` DOUBLE NULL,
  `accuracy` DOUBLE NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `bindings` JSON NOT NULL,
  `quality` JSON NULL,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `reviewNote` TEXT NULL,
  `reviewedBy` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `campus_map_collection_objects_sessionId_clientObjectId_key` (`sessionId`, `clientObjectId`),
  INDEX `campus_map_collection_objects_sessionId_objectType_recordedAt_idx` (`sessionId`, `objectType`, `recordedAt`),
  INDEX `campus_map_collection_objects_reviewStatus_updatedAt_idx` (`reviewStatus`, `updatedAt`),
  CONSTRAINT `campus_map_collection_objects_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @lm_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campus_map_collection_attachments' AND column_name = 'objectId'),
  'SELECT 1',
  'ALTER TABLE `campus_map_collection_attachments` ADD COLUMN `objectId` VARCHAR(191) NULL'
);
PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SET @lm_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'campus_map_collection_attachments' AND index_name = 'campus_map_collection_attachments_objectId_uploadedAt_idx'),
  'SELECT 1',
  'CREATE INDEX `campus_map_collection_attachments_objectId_uploadedAt_idx` ON `campus_map_collection_attachments` (`objectId`, `uploadedAt`)'
);
PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SET @lm_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'campus_map_collection_attachments' AND constraint_name = 'campus_map_collection_attachments_objectId_fkey'),
  'SELECT 1',
  'ALTER TABLE `campus_map_collection_attachments` ADD CONSTRAINT `campus_map_collection_attachments_objectId_fkey` FOREIGN KEY (`objectId`) REFERENCES `campus_map_collection_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
