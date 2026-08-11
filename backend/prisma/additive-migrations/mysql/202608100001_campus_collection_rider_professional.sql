SET @lm_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campus_map_collection_tasks'
     AND COLUMN_NAME = 'allowedClients') = 0,
  'ALTER TABLE `campus_map_collection_tasks`
     ADD COLUMN `allowedClients` JSON NULL,
     ADD COLUMN `objectTypes` JSON NULL,
     ADD COLUMN `boundary` JSON NULL,
     ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 3,
     ADD COLUMN `dueAt` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;

UPDATE `campus_map_collection_tasks`
SET `allowedClients` = JSON_ARRAY('miniapp'),
    `objectTypes` = JSON_ARRAY('road', 'building', 'entrance', 'facility', 'issue')
WHERE `allowedClients` IS NULL OR `objectTypes` IS NULL;

ALTER TABLE `campus_map_collection_tasks`
  MODIFY COLUMN `allowedClients` JSON NOT NULL,
  MODIFY COLUMN `objectTypes` JSON NOT NULL;

SET @lm_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campus_map_collection_sessions'
     AND COLUMN_NAME = 'sourceClient') = 0,
  'ALTER TABLE `campus_map_collection_sessions`
     ADD COLUMN `sourceClient` VARCHAR(191) NOT NULL DEFAULT ''miniapp'',
     ADD COLUMN `objectCount` INTEGER NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;

CREATE TABLE IF NOT EXISTS `campus_map_collection_objects` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `clientObjectId` VARCHAR(191) NOT NULL,
  `objectType` VARCHAR(191) NOT NULL,
  `geometry` JSON NOT NULL,
  `properties` JSON NOT NULL,
  `bindings` JSON NOT NULL,
  `longitude` DOUBLE NULL,
  `latitude` DOUBLE NULL,
  `accuracy` DOUBLE NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `reviewNote` TEXT NULL,
  `reviewedBy` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `quality` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `campus_map_collection_objects_sessionId_clientObjectId_key` (`sessionId`, `clientObjectId`),
  INDEX `cmco_session_type_recorded_idx` (`sessionId`, `objectType`, `recordedAt`),
  INDEX `campus_map_collection_objects_reviewStatus_updatedAt_idx` (`reviewStatus`, `updatedAt`),
  CONSTRAINT `campus_map_collection_objects_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @lm_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campus_map_collection_attachments'
     AND COLUMN_NAME = 'objectId') = 0,
  'ALTER TABLE `campus_map_collection_attachments`
     ADD COLUMN `objectId` VARCHAR(191) NULL,
     ADD INDEX `campus_map_collection_attachments_objectId_uploadedAt_idx` (`objectId`, `uploadedAt`),
     ADD CONSTRAINT `campus_map_collection_attachments_objectId_fkey` FOREIGN KEY (`objectId`) REFERENCES `campus_map_collection_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;
