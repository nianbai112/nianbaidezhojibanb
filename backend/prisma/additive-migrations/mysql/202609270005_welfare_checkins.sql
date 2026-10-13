-- AlterTable
ALTER TABLE `welfare_campaigns` ADD COLUMN `checkinSessionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `welfare_checkin_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NULL,
    `location` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `allowStaffScan` BOOLEAN NOT NULL DEFAULT true,
    `allowSelfScan` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `qrSecret` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `welfare_checkin_sessions_regionId_status_startAt_idx`(`regionId`, `status`, `startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_checkin_staff` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `welfare_checkin_staff_userId_idx`(`userId`),
    UNIQUE INDEX `welfare_checkin_staff_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welfare_checkin_records` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `welfare_checkin_records_sessionId_signedAt_idx`(`sessionId`, `signedAt`),
    INDEX `welfare_checkin_records_userId_idx`(`userId`),
    UNIQUE INDEX `welfare_checkin_records_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `welfare_campaigns_checkinSessionId_idx` ON `welfare_campaigns`(`checkinSessionId`);

-- AddForeignKey
ALTER TABLE `welfare_campaigns` ADD CONSTRAINT `welfare_campaigns_checkinSessionId_fkey` FOREIGN KEY (`checkinSessionId`) REFERENCES `welfare_checkin_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_checkin_staff` ADD CONSTRAINT `welfare_checkin_staff_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `welfare_checkin_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_checkin_staff` ADD CONSTRAINT `welfare_checkin_staff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_checkin_records` ADD CONSTRAINT `welfare_checkin_records_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `welfare_checkin_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welfare_checkin_records` ADD CONSTRAINT `welfare_checkin_records_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

