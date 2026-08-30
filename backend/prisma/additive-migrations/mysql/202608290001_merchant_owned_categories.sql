SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'categories'
      AND column_name = 'merchant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `categories` ADD COLUMN `merchant_id` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'categories'
      AND index_name = 'categories_merchant_id_status_sort_order_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `categories_merchant_id_status_sort_order_idx` ON `categories` (`merchant_id`, `status`, `sortOrder`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'categories'
      AND constraint_name = 'categories_merchant_id_fkey'
  ),
  'SELECT 1',
  'ALTER TABLE `categories` ADD CONSTRAINT `categories_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;
