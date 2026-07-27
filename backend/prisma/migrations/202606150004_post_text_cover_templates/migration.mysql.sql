CREATE TABLE IF NOT EXISTS `post_text_cover_templates` (
  `id` VARCHAR(191) NOT NULL,
  `regionId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `backgroundType` VARCHAR(32) NOT NULL DEFAULT 'color',
  `backgroundColor` VARCHAR(32) NOT NULL DEFAULT '#F7F3EA',
  `gradientStart` VARCHAR(32) NULL,
  `gradientEnd` VARCHAR(32) NULL,
  `backgroundImage` TEXT NULL,
  `textColor` VARCHAR(32) NOT NULL DEFAULT '#222222',
  `accentColor` VARCHAR(32) NOT NULL DEFAULT '#FF4D5A',
  `titleFontSize` INT NOT NULL DEFAULT 30,
  `bodyFontSize` INT NOT NULL DEFAULT 24,
  `maxTitleChars` INT NOT NULL DEFAULT 24,
  `maxSummaryChars` INT NOT NULL DEFAULT 72,
  `maxLines` INT NOT NULL DEFAULT 6,
  `coverHeight` INT NOT NULL DEFAULT 350,
  `showTopic` BOOLEAN NOT NULL DEFAULT true,
  `showCircle` BOOLEAN NOT NULL DEFAULT true,
  `priority` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

CREATE INDEX `post_text_cover_templates_region_enabled_priority_idx`
  ON `post_text_cover_templates`(`regionId`, `enabled`, `priority`);
