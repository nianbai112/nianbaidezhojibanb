-- MySQL kept the retired lottery columns for rollback compatibility.
-- The current one-entry schema no longer writes them, so they must have
-- defaults or every new participation insert fails on a NOT NULL column.
SET @has_ordinal := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'welfare_entries'
    AND column_name = 'ordinal'
);
SET @sql := IF(
  @has_ordinal = 1,
  'ALTER TABLE `welfare_entries` MODIFY COLUMN `ordinal` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Random-only draws no longer write the retired designated-winner count.
SET @has_gifted_count := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'welfare_draws'
    AND column_name = 'giftedCount'
);
SET @sql := IF(
  @has_gifted_count = 1,
  'ALTER TABLE `welfare_draws` MODIFY COLUMN `giftedCount` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_day_key := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'welfare_entries'
    AND column_name = 'dayKey'
);
SET @sql := IF(
  @has_day_key = 1,
  'ALTER TABLE `welfare_entries` MODIFY COLUMN `dayKey` VARCHAR(191) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
