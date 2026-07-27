SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns
FROM (
  SELECT 'ADD COLUMN `levelDescription` text NULL' AS definition FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelDescription')
  UNION ALL SELECT 'ADD COLUMN `levelBenefits` text NULL' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelBenefits')
  UNION ALL SELECT 'ADD COLUMN `levelTitleId` varchar(191) NULL' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelTitleId')
  UNION ALL SELECT 'ADD COLUMN `contentBoostWeight` int NOT NULL DEFAULT 0' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'contentBoostWeight')
  UNION ALL SELECT 'ADD COLUMN `levelIcon` text NULL' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelIcon')
  UNION ALL SELECT 'ADD COLUMN `levelBadgeImage` text NULL' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelBadgeImage')
  UNION ALL SELECT 'ADD COLUMN `levelMedalImage` text NULL' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_levels' AND column_name = 'levelMedalImage')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `user_levels` ', @lm_columns));
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;
