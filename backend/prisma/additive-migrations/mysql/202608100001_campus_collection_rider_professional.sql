ALTER TABLE `campus_map_collection_tasks`
  ADD COLUMN `allowedClients` JSON NULL,
  ADD COLUMN `objectTypes` JSON NULL,
  ADD COLUMN `boundary` JSON NULL,
  ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN `dueAt` DATETIME(3) NULL;

UPDATE `campus_map_collection_tasks`
SET `allowedClients` = JSON_ARRAY('miniapp'),
    `objectTypes` = JSON_ARRAY('road', 'building', 'entrance', 'facility', 'issue')
WHERE `allowedClients` IS NULL OR `objectTypes` IS NULL;

ALTER TABLE `campus_map_collection_tasks`
  MODIFY COLUMN `allowedClients` JSON NOT NULL,
  MODIFY COLUMN `objectTypes` JSON NOT NULL;

ALTER TABLE `campus_map_collection_sessions`
  ADD COLUMN `sourceClient` VARCHAR(191) NOT NULL DEFAULT 'miniapp',
  ADD COLUMN `objectCount` INTEGER NOT NULL DEFAULT 0;

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
  INDEX `campus_map_collection_objects_sessionId_objectType_recordedAt_idx` (`sessionId`, `objectType`, `recordedAt`),
  INDEX `campus_map_collection_objects_reviewStatus_updatedAt_idx` (`reviewStatus`, `updatedAt`),
  CONSTRAINT `campus_map_collection_objects_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `campus_map_collection_attachments`
  ADD COLUMN `objectId` VARCHAR(191) NULL,
  ADD INDEX `campus_map_collection_attachments_objectId_uploadedAt_idx` (`objectId`, `uploadedAt`),
  ADD CONSTRAINT `campus_map_collection_attachments_objectId_fkey` FOREIGN KEY (`objectId`) REFERENCES `campus_map_collection_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
