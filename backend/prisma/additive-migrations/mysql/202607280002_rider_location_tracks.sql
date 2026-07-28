CREATE TABLE IF NOT EXISTS `rider_location_tracks` (
  `id` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `riderId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `orderType` VARCHAR(191) NULL,
  `lat` DOUBLE NOT NULL,
  `lng` DOUBLE NOT NULL,
  `accuracy` DOUBLE NULL,
  `speed` DOUBLE NULL,
  `heading` DOUBLE NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `rider_location_tracks_riderId_clientId_key` (`riderId`, `clientId`),
  INDEX `rider_location_tracks_riderId_recordedAt_idx` (`riderId`, `recordedAt`),
  INDEX `rider_location_tracks_orderId_orderType_recordedAt_idx` (`orderId`, `orderType`, `recordedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
