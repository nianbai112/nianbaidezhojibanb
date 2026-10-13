CREATE TABLE IF NOT EXISTS `welfare_prize_verifiers` (
  `id` VARCHAR(191) NOT NULL,
  `prizeId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `assignedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `welfare_prize_verifiers_prizeId_userId_key` (`prizeId`, `userId`),
  KEY `welfare_prize_verifiers_userId_idx` (`userId`),
  CONSTRAINT `welfare_prize_verifiers_prizeId_fkey`
    FOREIGN KEY (`prizeId`) REFERENCES `welfare_prizes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `welfare_prize_verifiers_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
