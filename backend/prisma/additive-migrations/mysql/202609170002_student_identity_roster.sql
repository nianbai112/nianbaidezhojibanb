-- AlterTable
ALTER TABLE `student_verifies` ADD COLUMN `materialId` VARCHAR(191) NULL,
    ADD COLUMN `proofMethod` VARCHAR(191) NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN `roster_student_id` VARCHAR(191) NULL,
    ADD COLUMN `submissionVersion` INTEGER NOT NULL DEFAULT 1,
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `schools` ADD COLUMN `rosterRevision` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `studentVerificationMode` VARCHAR(191) NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE `school_students` (
    `id` VARCHAR(191) NOT NULL,
    `school_id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `identityKey` VARCHAR(64) NOT NULL,
    `realName` VARCHAR(191) NOT NULL,
    `enrollmentStatus` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `bound_user_id` VARCHAR(191) NULL,
    `boundAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `lastBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `school_students_bound_user_id_key`(`bound_user_id`),
    INDEX `school_students_school_id_enrollmentStatus_idx`(`school_id`, `enrollmentStatus`),
    UNIQUE INDEX `school_students_school_id_identityKey_key`(`school_id`, `identityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_roster_batches` (
    `id` VARCHAR(191) NOT NULL,
    `school_id` VARCHAR(191) NOT NULL,
    `digest` VARCHAR(64) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PREVIEW',
    `baseRevision` INTEGER NOT NULL,
    `rows` JSON NOT NULL,
    `summary` JSON NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `committedAt` DATETIME(3) NULL,

    INDEX `school_roster_batches_school_id_digest_status_idx`(`school_id`, `digest`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_verification_events` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `rosterStudentId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `submissionVersion` INTEGER NULL,
    `materialId` VARCHAR(191) NULL,
    `detail` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_verification_events_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    INDEX `student_verification_events_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `student_verification_events_materialId_idx`(`materialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_verification_materials` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `content` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_verification_materials_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student_verifies` ADD CONSTRAINT `student_verifies_roster_student_id_fkey` FOREIGN KEY (`roster_student_id`) REFERENCES `school_students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_verifies` ADD CONSTRAINT `student_verifies_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `student_verification_materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_students` ADD CONSTRAINT `school_students_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_students` ADD CONSTRAINT `school_students_bound_user_id_fkey` FOREIGN KEY (`bound_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_roster_batches` ADD CONSTRAINT `school_roster_batches_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_verification_events` ADD CONSTRAINT `student_verification_events_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `student_verification_materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

