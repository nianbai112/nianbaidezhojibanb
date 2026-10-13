-- AlterTable
ALTER TABLE `users` ADD COLUMN `authVersion` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `apple_authorizations` (
    `identityKey` VARCHAR(64) NOT NULL,
    `appId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `state` VARCHAR(32) NOT NULL DEFAULT 'active',
    `authorizedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `lastEventAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `apple_authorizations_userId_idx`(`userId`),
    PRIMARY KEY (`identityKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `apple_oauth_tokens` (
    `id` VARCHAR(64) NOT NULL,
    `identityKey` VARCHAR(64) NOT NULL,
    `tokenCiphertext` TEXT NULL,
    `state` VARCHAR(24) NOT NULL DEFAULT 'active',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,
    `leaseId` VARCHAR(64) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(80) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `apple_oauth_tokens_state_nextAttemptAt_idx`(`state`, `nextAttemptAt`),
    INDEX `apple_oauth_tokens_identityKey_idx`(`identityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `apple_server_events` (
    `id` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `identityKey` VARCHAR(64) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `eventAt` DATETIME(3) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `apple_server_events_identityKey_idx`(`identityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `apple_authorizations` ADD CONSTRAINT `apple_authorizations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `apple_oauth_tokens` ADD CONSTRAINT `apple_oauth_tokens_identityKey_fkey` FOREIGN KEY (`identityKey`) REFERENCES `apple_authorizations`(`identityKey`) ON DELETE RESTRICT ON UPDATE CASCADE;

