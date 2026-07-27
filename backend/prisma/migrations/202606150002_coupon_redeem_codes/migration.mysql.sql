CREATE TABLE IF NOT EXISTS `coupon_redeem_codes` (
  `id` VARCHAR(191) NOT NULL,
  `couponId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `batchName` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `totalLimit` INTEGER NOT NULL DEFAULT 1,
  `usedCount` INTEGER NOT NULL DEFAULT 0,
  `perUserLimit` INTEGER NOT NULL DEFAULT 1,
  `startAt` DATETIME(3) NULL,
  `endAt` DATETIME(3) NULL,
  `regionId` VARCHAR(191) NULL,
  `remark` TEXT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `coupon_redeem_codes_code_key` (`code`),
  INDEX `coupon_redeem_codes_couponId_status_idx` (`couponId`, `status`),
  INDEX `coupon_redeem_codes_regionId_idx` (`regionId`),
  INDEX `coupon_redeem_codes_status_endAt_idx` (`status`, `endAt`),
  CONSTRAINT `coupon_redeem_codes_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `coupon_redeem_records` (
  `id` VARCHAR(191) NOT NULL,
  `redeemCodeId` VARCHAR(191) NOT NULL,
  `couponId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `receiveId` VARCHAR(191) NULL,
  `ip` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `coupon_redeem_records_redeemCodeId_idx` (`redeemCodeId`),
  INDEX `coupon_redeem_records_couponId_idx` (`couponId`),
  INDEX `coupon_redeem_records_userId_idx` (`userId`),
  CONSTRAINT `coupon_redeem_records_redeemCodeId_fkey` FOREIGN KEY (`redeemCodeId`) REFERENCES `coupon_redeem_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
