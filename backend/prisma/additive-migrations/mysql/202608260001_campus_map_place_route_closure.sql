SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='regionId'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `regionId` VARCHAR(191) NOT NULL DEFAULT ''global'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='mapId'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `mapId` VARCHAR(191) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='displayName'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `displayName` VARCHAR(191) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='serviceStatus'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `serviceStatus` VARCHAR(191) NOT NULL DEFAULT ''unknown'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='unavailableMessage'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `unavailableMessage` TEXT NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='publishStatus'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `publishStatus` VARCHAR(191) NOT NULL DEFAULT ''draft'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='artworkFeatureKey'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `artworkFeatureKey` VARCHAR(191) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='artworkAnchorX'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `artworkAnchorX` DOUBLE NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='artworkAnchorY'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `artworkAnchorY` DOUBLE NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='artworkGeometry'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `artworkGeometry` JSON NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='longitude'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `longitude` DOUBLE NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='latitude'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `latitude` DOUBLE NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coordinateType'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coordinateType` VARCHAR(191) NOT NULL DEFAULT ''gcj02'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coordinateStatus'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coordinateStatus` VARCHAR(191) NOT NULL DEFAULT ''uncollected'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coordinateSource'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coordinateSource` VARCHAR(191) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coordinateAccuracy'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coordinateAccuracy` DOUBLE NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coordinateCollectedAt'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coordinateCollectedAt` DATETIME(3) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='addressDescription'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `addressDescription` TEXT NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='addressCandidate'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `addressCandidate` TEXT NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='description'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `description` TEXT NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND column_name='coverUrl'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD COLUMN `coverUrl` TEXT NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

UPDATE `campus_map_projects`
SET `regionId` = (SELECT scoped.`regionId` FROM (SELECT MIN(`regionId`) AS `regionId` FROM `campus_maps` WHERE `regionId` <> 'global') scoped)
WHERE `regionId` = 'global' AND (SELECT scoped_count.`total` FROM (SELECT COUNT(*) AS `total` FROM `campus_maps` WHERE `regionId` <> 'global') scoped_count) = 1;
UPDATE `campus_map_projects` SET `artworkFeatureKey` = NULL WHERE TRIM(COALESCE(`artworkFeatureKey`, '')) = '';
UPDATE `campus_map_projects` project
JOIN `campus_maps` map ON map.`regionId` = project.`regionId`
LEFT JOIN (
  SELECT feature_counts.`regionId`, feature_counts.`artworkFeatureKey`
  FROM (
    SELECT `regionId`, `artworkFeatureKey`
    FROM `campus_map_projects`
    WHERE `artworkFeatureKey` IS NOT NULL
    GROUP BY `regionId`, `artworkFeatureKey`
    HAVING COUNT(*) = 1
  ) feature_counts
) unique_feature ON unique_feature.`regionId` = project.`regionId`
  AND unique_feature.`artworkFeatureKey` = project.`artworkFeatureKey`
SET project.`mapId` = map.`id`
WHERE project.`mapId` IS NULL
  AND (project.`artworkFeatureKey` IS NULL OR unique_feature.`artworkFeatureKey` IS NOT NULL);
UPDATE `campus_map_projects` SET `publishStatus` = 'published' WHERE `visibilityScope` = 'phase1_active';

SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND index_name='campus_map_projects_officialNumber_key'), 'DROP INDEX `campus_map_projects_officialNumber_key` ON `campus_map_projects`', 'SELECT 1'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND index_name='campus_map_projects_regionId_officialNumber_key'), 'SELECT 1', 'CREATE UNIQUE INDEX `campus_map_projects_regionId_officialNumber_key` ON `campus_map_projects`(`regionId`,`officialNumber`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND index_name='campus_map_projects_mapId_artworkFeatureKey_key'), 'SELECT 1', 'CREATE UNIQUE INDEX `campus_map_projects_mapId_artworkFeatureKey_key` ON `campus_map_projects`(`mapId`,`artworkFeatureKey`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND index_name='campus_map_projects_regionId_sortOrder_idx'), 'SELECT 1', 'CREATE INDEX `campus_map_projects_regionId_sortOrder_idx` ON `campus_map_projects`(`regionId`,`sortOrder`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='campus_map_projects' AND index_name='campus_map_projects_mapId_publishStatus_idx'), 'SELECT 1', 'CREATE INDEX `campus_map_projects_mapId_publishStatus_idx` ON `campus_map_projects`(`mapId`,`publishStatus`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='campus_map_projects' AND constraint_name='campus_map_projects_mapId_fkey'), 'SELECT 1', 'ALTER TABLE `campus_map_projects` ADD CONSTRAINT `campus_map_projects_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `campus_maps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

CREATE TABLE IF NOT EXISTS `campus_map_place_media` (
  `id` VARCHAR(191) NOT NULL, `placeId` VARCHAR(191) NOT NULL, `collectionAttachmentId` VARCHAR(191) NULL,
  `mediaType` VARCHAR(191) NOT NULL DEFAULT 'gallery', `sourceType` VARCHAR(191) NOT NULL DEFAULT 'admin',
  `url` TEXT NOT NULL, `storageKey` TEXT NULL, `mimeType` VARCHAR(191) NULL, `byteSize` INTEGER NOT NULL DEFAULT 0,
  `checksum` VARCHAR(64) NULL, `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'approved', `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0, `capturedAt` DATETIME(3) NULL, `captureLongitude` DOUBLE NULL,
  `captureLatitude` DOUBLE NULL, `captureAccuracy` DOUBLE NULL, `metadata` JSON NULL, `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `campus_map_place_media_collectionAttachmentId_key` (`collectionAttachmentId`),
  INDEX `campus_map_place_media_placeId_isPublic_sortOrder_idx` (`placeId`,`isPublic`,`sortOrder`),
  INDEX `campus_map_place_media_reviewStatus_createdAt_idx` (`reviewStatus`,`createdAt`),
  CONSTRAINT `campus_map_place_media_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `campus_map_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `campus_map_place_media`
  (`id`,`placeId`,`mediaType`,`sourceType`,`url`,`reviewStatus`,`isPublic`,`sortOrder`,`createdAt`,`updatedAt`)
SELECT CONCAT('legacy-photo-', LEFT(SHA2(CONCAT(project.`id`, ':', photo.`url`), 256), 32)),
  project.`id`, IF(photo.`position` = 1, 'cover', 'gallery'), 'legacy_admin', photo.`url`, 'approved', true,
  photo.`position` - 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `campus_map_projects` project
JOIN JSON_TABLE(project.`photos`, '$[*]' COLUMNS (`position` FOR ORDINALITY, `url` VARCHAR(2048) PATH '$')) photo;

CREATE TABLE IF NOT EXISTS `campus_map_place_entrances` (
  `id` VARCHAR(191) NOT NULL, `placeId` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL,
  `longitude` DOUBLE NOT NULL, `latitude` DOUBLE NOT NULL, `coordinateType` VARCHAR(191) NOT NULL DEFAULT 'gcj02',
  `accuracy` DOUBLE NULL, `addressDescription` TEXT NULL, `serviceStatus` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `isPrimary` BOOLEAN NOT NULL DEFAULT false, `sourceType` VARCHAR(191) NOT NULL DEFAULT 'admin',
  `createdBy` VARCHAR(191) NULL, `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), INDEX `campus_map_place_entrances_placeId_isPrimary_idx` (`placeId`,`isPrimary`),
  CONSTRAINT `campus_map_place_entrances_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `campus_map_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_tasks' AND column_name='taskType'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_tasks` ADD COLUMN `taskType` VARCHAR(191) NOT NULL DEFAULT ''mixed'''); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
UPDATE `campus_map_collection_tasks` SET `taskType` = CASE WHEN JSON_LENGTH(`objectTypes`)=1 AND JSON_UNQUOTE(JSON_EXTRACT(`objectTypes`,'$[0]'))='road' THEN 'route_collection' WHEN JSON_LENGTH(`objectTypes`)=1 AND JSON_UNQUOTE(JSON_EXTRACT(`objectTypes`,'$[0]'))='place_verification' THEN 'place_verification' WHEN JSON_LENGTH(`objectTypes`)=1 AND JSON_UNQUOTE(JSON_EXTRACT(`objectTypes`,'$[0]'))='building' AND JSON_LENGTH(COALESCE(`targetPlaceIds`, JSON_ARRAY())) > 0 THEN 'place_verification' ELSE 'mixed' END;
UPDATE `campus_map_collection_tasks` SET `objectTypes` = JSON_ARRAY('place_verification') WHERE JSON_LENGTH(`objectTypes`)=1 AND JSON_UNQUOTE(JSON_EXTRACT(`objectTypes`,'$[0]'))='building' AND JSON_LENGTH(COALESCE(`targetPlaceIds`, JSON_ARRAY())) > 0;

CREATE TABLE IF NOT EXISTS `campus_map_collection_task_places` (
  `id` VARCHAR(191) NOT NULL, `taskId` VARCHAR(191) NOT NULL, `placeId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE INDEX `campus_map_collection_task_places_taskId_placeId_key` (`taskId`,`placeId`),
  INDEX `campus_map_collection_task_places_placeId_createdAt_idx` (`placeId`,`createdAt`),
  CONSTRAINT `campus_map_collection_task_places_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `campus_map_collection_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `campus_map_collection_task_places_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `campus_map_projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `campus_map_collection_task_places` (`id`,`taskId`,`placeId`,`sortOrder`,`createdAt`)
SELECT CONCAT('task-place-', LEFT(SHA2(CONCAT(task.`id`, ':', place.`id`), 256), 32)),
  task.`id`, place.`id`, target.`position` - 1, CURRENT_TIMESTAMP(3)
FROM `campus_map_collection_tasks` task
JOIN JSON_TABLE(COALESCE(task.`targetPlaceIds`, JSON_ARRAY()), '$[*]' COLUMNS (`position` FOR ORDINALITY, `value` VARCHAR(191) PATH '$')) target
JOIN `campus_map_projects` place ON place.`regionId` = task.`regionId`
  AND place.`id` = target.`value` COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `campus_map_collection_task_places` (`id`,`taskId`,`placeId`,`sortOrder`,`createdAt`)
SELECT CONCAT('task-place-', LEFT(SHA2(CONCAT(task.`id`, ':', place.`placeId`), 256), 32)),
  task.`id`, place.`placeId`, target.`position` - 1, CURRENT_TIMESTAMP(3)
FROM `campus_map_collection_tasks` task
JOIN JSON_TABLE(COALESCE(task.`targetPlaceIds`, JSON_ARRAY()), '$[*]' COLUMNS (`position` FOR ORDINALITY, `value` VARCHAR(191) PATH '$')) target
JOIN (
  SELECT `regionId`, `artworkFeatureKey`, MIN(`id`) AS `placeId`
  FROM `campus_map_projects`
  WHERE `artworkFeatureKey` IS NOT NULL
  GROUP BY `regionId`, `artworkFeatureKey`
  HAVING COUNT(*) = 1
) place ON place.`regionId` = task.`regionId`
  AND place.`artworkFeatureKey` = target.`value` COLLATE utf8mb4_unicode_ci
WHERE NOT EXISTS (
  SELECT 1 FROM `campus_map_projects` exact_place
  WHERE exact_place.`regionId` = task.`regionId`
    AND exact_place.`id` = target.`value` COLLATE utf8mb4_unicode_ci
);

SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_objects' AND column_name='appliedToDraftAt'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_objects` ADD COLUMN `appliedToDraftAt` DATETIME(3) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_objects' AND column_name='appliedDraftId'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_objects` ADD COLUMN `appliedDraftId` VARCHAR(191) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_objects' AND column_name='appliedDraftRevision'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_objects` ADD COLUMN `appliedDraftRevision` INTEGER NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_objects' AND column_name='applyFingerprint'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_objects` ADD COLUMN `applyFingerprint` VARCHAR(64) NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='campus_map_collection_objects' AND column_name='applyResult'), 'SELECT 1', 'ALTER TABLE `campus_map_collection_objects` ADD COLUMN `applyResult` JSON NULL'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
