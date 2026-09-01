-- MySQL DDL 会隐式提交；字段或索引单独成功后，迁移仍可安全续跑。
SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wechat_message_logs'
      AND column_name = 'wechatMsgId'
  ),
  'SELECT 1',
  'ALTER TABLE `wechat_message_logs` ADD COLUMN `wechatMsgId` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wechat_message_logs'
      AND index_name = 'wechat_message_logs_wechatMsgId_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `wechat_message_logs_wechatMsgId_key` ON `wechat_message_logs`(`wechatMsgId`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;
