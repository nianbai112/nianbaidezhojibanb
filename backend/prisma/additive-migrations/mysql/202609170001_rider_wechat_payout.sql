-- CreateTable
CREATE TABLE `rider_wechat_authorizations` (
    `userId` VARCHAR(191) NOT NULL,
    `outAuthorizationNo` VARCHAR(191) NOT NULL,
    `authorizationId` VARCHAR(191) NULL,
    `appid` VARCHAR(191) NOT NULL,
    `mchid` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `sceneId` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'WAIT_USER_CONFIRM',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `packageInfo` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rider_wechat_authorizations_outAuthorizationNo_key`(`outAuthorizationNo`),
    UNIQUE INDEX `rider_wx_auth_recipient_key`(`mchid`, `appid`, `openid`, `sceneId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_wechat_payouts` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `withdrawId` VARCHAR(191) NULL,
    `amountFen` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `appid` VARCHAR(191) NOT NULL,
    `mchid` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `sceneId` VARCHAR(191) NOT NULL,
    `authorizationId` VARCHAR(191) NOT NULL,
    `outAuthorizationNo` VARCHAR(191) NOT NULL,
    `requestBody` JSON NULL,
    `transferNo` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `firstSentAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rider_wechat_payouts_orderId_key`(`orderId`),
    UNIQUE INDEX `rider_wechat_payouts_withdrawId_key`(`withdrawId`),
    INDEX `rider_wechat_payouts_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `rider_wechat_payouts_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `rider_wechat_payouts_mchid_lastSentAt_idx`(`mchid`, `lastSentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

