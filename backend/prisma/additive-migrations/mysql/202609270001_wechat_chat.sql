-- CreateTable
CREATE TABLE `wechat_chat_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'global',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `accountKey` VARCHAR(191) NOT NULL,
    `wxid` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `takeover` BOOLEAN NOT NULL DEFAULT false,
    `style` VARCHAR(191) NOT NULL DEFAULT 'inherit',
    `groupTrigger` VARCHAR(191) NOT NULL DEFAULT 'inherit',
    `allowedSkills` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `contextAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReplyAt` DATETIME(3) NULL,
    `leaseToken` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wechat_chat_conversations_accountKey_updatedAt_idx`(`accountKey`, `updatedAt`),
    UNIQUE INDEX `wechat_chat_conversations_accountKey_wxid_key`(`accountKey`, `wxid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `eventKey` VARCHAR(191) NOT NULL,
    `remoteId` VARCHAR(191) NOT NULL,
    `sender` VARCHAR(191) NULL,
    `text` TEXT NOT NULL,
    `msgType` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wechat_chat_messages_eventKey_key`(`eventKey`),
    INDEX `wechat_chat_messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_replies` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `text` TEXT NULL,
    `reason` VARCHAR(191) NULL,
    `settingsRevision` INTEGER NOT NULL,
    `conversationRevision` INTEGER NOT NULL,
    `sourceVersions` JSON NULL,
    `remoteId` VARCHAR(191) NULL,
    `leaseToken` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `notBefore` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wechat_chat_replies_messageId_key`(`messageId`),
    INDEX `wechat_chat_replies_status_notBefore_idx`(`status`, `notBefore`),
    INDEX `wechat_chat_replies_conversationId_status_createdAt_idx`(`conversationId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_skills` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `publishedVersionId` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'all',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_skill_versions` (
    `id` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `sourceUrl` VARCHAR(191) NOT NULL,
    `commit` VARCHAR(191) NOT NULL,
    `license` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wechat_chat_skill_versions_skillId_createdAt_idx`(`skillId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_knowledge` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'private',
    `conversationId` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wechat_chat_knowledge_scope_enabled_idx`(`scope`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_quotas` (
    `id` VARCHAR(191) NOT NULL,
    `calls` INTEGER NOT NULL DEFAULT 0,
    `tokens` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechat_chat_members` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `sender` VARCHAR(191) NOT NULL,
    `banterMuted` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wechat_chat_members_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wechat_chat_messages` ADD CONSTRAINT `wechat_chat_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `wechat_chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechat_chat_replies` ADD CONSTRAINT `wechat_chat_replies_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `wechat_chat_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechat_chat_replies` ADD CONSTRAINT `wechat_chat_replies_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `wechat_chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechat_chat_skill_versions` ADD CONSTRAINT `wechat_chat_skill_versions_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `wechat_chat_skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechat_chat_members` ADD CONSTRAINT `wechat_chat_members_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `wechat_chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Register permission codes without granting other roles access to private conversations.
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_67295e4ae15a04674581e566','wechat:conversation:view','查看微信会话','wechat','view') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_ba326b05d8b38b2109203ebe','wechat:content:view','查看微信聊天正文','wechat','content') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_c4ea812fba2880e1ccb8fd90','wechat:reply:edit','管理微信自动回复','wechat','edit') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_a59ff2277d2fe07c7563c1c8','wechat:log:view','查看微信回复任务','wechat','log') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_f988efac527e944ccad73174','wechat:knowledge:edit','管理微信问答资料','wechat','knowledge') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_34bb47ac3533be25610b09af','skill:view','查看微信 Skill','skill','view') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_dcb09400fe3332eccde49022','skill:edit','编辑微信 Skill 草稿','skill','edit') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);
INSERT INTO `admin_permissions` (`id`,`code`,`name`,`module`,`action`) VALUES ('wc_baecb02699d0bb41d947b45e','skill:publish','发布及停用微信 Skill','skill','publish') ON DUPLICATE KEY UPDATE `code`=VALUES(`code`);

-- History keeps settings only; rollback always preserves the live credential.
UPDATE `ai_config_versions` SET `value`=JSON_SET(`value`,'$.apiKey','********'), `maskedValue`=JSON_SET(COALESCE(`maskedValue`,JSON_OBJECT()),'$.apiKey','********') WHERE `configKey`='ai_ops_config';
