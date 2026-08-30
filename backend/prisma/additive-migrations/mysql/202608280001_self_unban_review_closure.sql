SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'banVersion'
  ),
  'SELECT 1',
  'ALTER TABLE `users` ADD COLUMN `banVersion` INT NOT NULL DEFAULT 0'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

CREATE TABLE IF NOT EXISTS `self_unban_requests` (
  `id` VARCHAR(191) NOT NULL,
  `requestNo` VARCHAR(191) NOT NULL,
  `activeKey` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NOT NULL,
  `banVersion` INT NOT NULL DEFAULT 0,
  `regionId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending_payment',
  `paymentNo` VARCHAR(191) NULL,
  `banReason` TEXT NULL,
  `adminNote` TEXT NULL,
  `reviewedBy` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `self_unban_requests_requestNo_key` (`requestNo`),
  UNIQUE KEY `self_unban_requests_activeKey_key` (`activeKey`),
  KEY `self_unban_requests_userId_status_createdAt_idx` (`userId`, `status`, `createdAt`),
  KEY `self_unban_requests_regionId_status_createdAt_idx` (`regionId`, `status`, `createdAt`),
  KEY `self_unban_requests_paymentNo_idx` (`paymentNo`),
  CONSTRAINT `self_unban_requests_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `self_unban_requests_regionId_fkey`
    FOREIGN KEY (`regionId`) REFERENCES `regions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
