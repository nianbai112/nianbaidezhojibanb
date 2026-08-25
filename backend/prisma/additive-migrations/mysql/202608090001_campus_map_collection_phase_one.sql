CREATE TABLE IF NOT EXISTS `campus_map_collection_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `regionId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `instructions` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `accessCodeHash` VARCHAR(64) NULL,
  `accessCodeExpiresAt` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_tasks_regionId_status_updatedAt_idx` (`regionId`, `status`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `assignedBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_assignments_userId_createdAt_idx` (`userId`, `createdAt`),
  UNIQUE INDEX `campus_map_collection_assignments_taskId_userId_key` (`taskId`, `userId`),
  CONSTRAINT `campus_map_collection_assignments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `campus_map_collection_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_marker_templates` (
  `id` VARCHAR(191) NOT NULL,
  `regionId` VARCHAR(191) NULL,
  `label` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `icon` VARCHAR(191) NULL,
  `color` VARCHAR(191) NULL,
  `behavior` VARCHAR(191) NOT NULL DEFAULT 'info',
  `fieldSchema` JSON NOT NULL,
  `allowedBindings` JSON NOT NULL,
  `pinned` BOOLEAN NOT NULL DEFAULT false,
  `requirePhoto` BOOLEAN NOT NULL DEFAULT false,
  `requireNote` BOOLEAN NOT NULL DEFAULT false,
  `requireStationarySample` BOOLEAN NOT NULL DEFAULT false,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdBy` VARCHAR(191) NOT NULL,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `campus_map_marker_templates_regionId_enabled_sortOrder_idx` (`regionId`, `enabled`, `sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `collectorUserId` VARCHAR(191) NOT NULL,
  `clientSessionId` VARCHAR(191) NOT NULL,
  `coordinateType` VARCHAR(191) NOT NULL DEFAULT 'gcj02',
  `device` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'recording',
  `startedAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NULL,
  `pointCount` INTEGER NOT NULL DEFAULT 0,
  `markerCount` INTEGER NOT NULL DEFAULT 0,
  `lastBatchNo` INTEGER NOT NULL DEFAULT -1,
  `uploadComplete` BOOLEAN NOT NULL DEFAULT false,
  `quality` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `campus_map_collection_sessions_clientSessionId_key` (`clientSessionId`),
  INDEX `campus_map_collection_sessions_taskId_status_startedAt_idx` (`taskId`, `status`, `startedAt`),
  INDEX `campus_map_collection_sessions_collectorUserId_startedAt_idx` (`collectorUserId`, `startedAt`),
  CONSTRAINT `campus_map_collection_sessions_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `campus_map_collection_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_points` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `clientPointId` VARCHAR(191) NOT NULL,
  `batchNo` INTEGER NOT NULL,
  `pointSeq` INTEGER NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `accuracy` DOUBLE NOT NULL,
  `speed` DOUBLE NULL,
  `heading` DOUBLE NULL,
  `altitude` DOUBLE NULL,
  `raw` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_points_sessionId_recordedAt_idx` (`sessionId`, `recordedAt`),
  UNIQUE INDEX `campus_map_collection_points_sessionId_clientPointId_key` (`sessionId`, `clientPointId`),
  UNIQUE INDEX `campus_map_collection_points_sessionId_batchNo_pointSeq_key` (`sessionId`, `batchNo`, `pointSeq`),
  CONSTRAINT `campus_map_collection_points_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_markers` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NOT NULL,
  `clientMarkerId` VARCHAR(191) NOT NULL,
  `templateLabelSnapshot` VARCHAR(191) NOT NULL,
  `templateIconSnapshot` VARCHAR(191) NULL,
  `templateColorSnapshot` VARCHAR(191) NULL,
  `behaviorSnapshot` VARCHAR(191) NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `accuracy` DOUBLE NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `fieldValues` JSON NOT NULL,
  `note` TEXT NULL,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_markers_templateId_reviewStatus_idx` (`templateId`, `reviewStatus`),
  INDEX `campus_map_collection_markers_sessionId_recordedAt_idx` (`sessionId`, `recordedAt`),
  UNIQUE INDEX `campus_map_collection_markers_sessionId_clientMarkerId_key` (`sessionId`, `clientMarkerId`),
  CONSTRAINT `campus_map_collection_markers_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `campus_map_collection_markers_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `campus_map_marker_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_marker_bindings` (
  `id` VARCHAR(191) NOT NULL,
  `markerId` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `relationType` VARCHAR(191) NOT NULL,
  `state` VARCHAR(191) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_marker_bindings_targetType_targetId_s_idx` (`targetType`, `targetId`, `state`),
  UNIQUE INDEX `campus_map_collection_marker_bindings_markerId_targetType_t_key` (`markerId`, `targetType`, `targetId`, `relationType`),
  CONSTRAINT `campus_map_collection_marker_bindings_markerId_fkey` FOREIGN KEY (`markerId`) REFERENCES `campus_map_collection_markers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campus_map_collection_attachments` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `markerId` VARCHAR(191) NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'photo',
  `url` TEXT NOT NULL,
  `storageKey` TEXT NULL,
  `mimeType` VARCHAR(191) NULL,
  `byteSize` INTEGER NOT NULL DEFAULT 0,
  `checksum` VARCHAR(64) NULL,
  `metadata` JSON NULL,
  `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `campus_map_collection_attachments_sessionId_uploadedAt_idx` (`sessionId`, `uploadedAt`),
  INDEX `campus_map_collection_attachments_markerId_uploadedAt_idx` (`markerId`, `uploadedAt`),
  INDEX `campus_map_collection_attachments_checksum_idx` (`checksum`),
  CONSTRAINT `campus_map_collection_attachments_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `campus_map_collection_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `campus_map_collection_attachments_markerId_fkey` FOREIGN KEY (`markerId`) REFERENCES `campus_map_collection_markers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
