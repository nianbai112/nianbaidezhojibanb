CREATE TABLE `official_assistant_messages` (
  `id` VARCHAR(191) NOT NULL,
  `regionId` VARCHAR(191) NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'campus',
  `renderType` VARCHAR(191) NOT NULL DEFAULT 'card',
  `title` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `summary` VARCHAR(191) NULL,
  `imageUrl` VARCHAR(191) NULL,
  `iconUrl` VARCHAR(191) NULL,
  `tagText` VARCHAR(191) NULL,
  `tagType` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'published',
  `priority` INTEGER NOT NULL DEFAULT 0,
  `actions` JSON NULL,
  `extra` JSON NULL,
  `createdBy` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `official_assistant_messages_regionId_status_publishedAt_idx`
  ON `official_assistant_messages`(`regionId`, `status`, `publishedAt`);

CREATE INDEX `official_assistant_messages_category_status_publishedAt_idx`
  ON `official_assistant_messages`(`category`, `status`, `publishedAt`);
