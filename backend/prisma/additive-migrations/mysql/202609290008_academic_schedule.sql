-- CreateTable
CREATE TABLE `academic_terms` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `monday` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191) NOT NULL,
    `endDate` VARCHAR(191) NOT NULL,
    `slots` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_terms_regionId_startDate_idx`(`regionId`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_classes` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `major` VARCHAR(80) NOT NULL,
    `grade` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `academic_class_identity`(`regionId`, `major`, `grade`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_teachers` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,

    UNIQUE INDEX `academic_teacher_identity`(`regionId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_rules` (
    `id` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NOT NULL,
    `draft` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_rules_termId_idx`(`termId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NULL,
    `sourceWeek` INTEGER NOT NULL,
    `originalDate` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `courseName` VARCHAR(191) NOT NULL,
    `teacherId` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `classIds` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `exception` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(191) NOT NULL DEFAULT '',
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_sessions_termId_date_idx`(`termId`, `date`),
    INDEX `academic_sessions_status_startAt_idx`(`status`, `startAt`),
    UNIQUE INDEX `academic_source_occurrence`(`ruleId`, `sourceWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `consentAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_subscriptions_classId_enabled_idx`(`classId`, `enabled`),
    UNIQUE INDEX `academic_user_region`(`userId`, `regionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_settings` (
    `regionId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `leadMinutes` INTEGER NOT NULL DEFAULT 20,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`regionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionVersion` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_reminders_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `academic_reminder_once`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `academic_rules` ADD CONSTRAINT `academic_rules_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `academic_terms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_sessions` ADD CONSTRAINT `academic_sessions_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `academic_terms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_sessions` ADD CONSTRAINT `academic_sessions_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `academic_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_subscriptions` ADD CONSTRAINT `academic_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_subscriptions` ADD CONSTRAINT `academic_subscriptions_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `academic_classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_reminders` ADD CONSTRAINT `academic_reminders_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `academic_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_reminders` ADD CONSTRAINT `academic_reminders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


INSERT IGNORE INTO `admin_permissions` (`id`, `code`, `name`, `module`, `action`, `createdAt`) VALUES ('academic_view', 'academic:view', '查看课表', 'academic', 'view', CURRENT_TIMESTAMP);

INSERT IGNORE INTO `admin_permissions` (`id`, `code`, `name`, `module`, `action`, `createdAt`) VALUES ('academic_edit', 'academic:edit', '管理课表', 'academic', 'edit', CURRENT_TIMESTAMP);

INSERT IGNORE INTO `admin_permissions` (`id`, `code`, `name`, `module`, `action`, `createdAt`) VALUES ('academic_config', 'academic:config', '配置课程提醒', 'academic', 'config', CURRENT_TIMESTAMP);

INSERT IGNORE INTO `admin_menus` (`id`, `name`, `icon`, `path`, `permission`, `sortOrder`, `updatedAt`) VALUES ('menu__academic_schedule', '课表管理', 'CalendarOutlined', '/academic/schedule', 'academic:view', 30, CURRENT_TIMESTAMP);
