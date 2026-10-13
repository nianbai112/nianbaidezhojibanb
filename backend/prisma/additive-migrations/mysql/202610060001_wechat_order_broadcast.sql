-- 订单群播报：校区绑定的微信群与每条群消息记录。
CREATE TABLE IF NOT EXISTS `wechat_order_broadcast_groups` (
    `regionId` VARCHAR(191) NOT NULL,
    `groupWxid` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`regionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wechat_order_broadcasts` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `groupWxid` VARCHAR(191) NOT NULL,
    `round` INTEGER NOT NULL DEFAULT 1,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `reason` VARCHAR(191) NULL,
    `text` TEXT NULL,
    `remoteId` VARCHAR(191) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `notBefore` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseUntil` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wechat_order_broadcasts_orderId_round_kind_key`(`orderId`, `round`, `kind`),
    INDEX `wechat_order_broadcasts_status_notBefore_idx`(`status`, `notBefore`),
    INDEX `wechat_order_broadcasts_kind_closedAt_createdAt_idx`(`kind`, `closedAt`, `createdAt`),
    INDEX `wechat_order_broadcasts_groupWxid_updatedAt_idx`(`groupWxid`, `updatedAt`),
    INDEX `wechat_order_broadcasts_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wb_ddf4c287682cac1709a4f9f6','wechat:broadcast:view','查看订单群播报','wechat','broadcast_view') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wb_09ca37cf56e298f95d4d7826','wechat:broadcast:edit','管理订单群播报','wechat','broadcast_edit') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
