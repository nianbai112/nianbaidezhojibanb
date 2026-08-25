-- 校园小助手单主账的兼容字段。全部为可空增量字段，历史数据不会被删除或重写。
-- MySQL DDL 会隐式提交；以下每一步先查 information_schema，保证部分执行后可安全续跑。

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'systemRole'
  ),
  'SELECT 1',
  'ALTER TABLE `users` ADD COLUMN `systemRole` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

UPDATE `users`
SET `systemRole` = 'OFFICIAL_ASSISTANT'
WHERE `openid` = 'lingmeng_official_message_account'
  AND `systemRole` IS NULL;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_systemRole_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `users_systemRole_key` ON `users`(`systemRole`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'conversations' AND column_name = 'scopeKey'
  ),
  'SELECT 1',
  'ALTER TABLE `conversations` ADD COLUMN `scopeKey` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'conversations' AND index_name = 'conversations_scopeKey_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `conversations_scopeKey_key` ON `conversations`(`scopeKey`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'assistant_tickets' AND column_name = 'conversationId'
  ),
  'SELECT 1',
  'ALTER TABLE `assistant_tickets` ADD COLUMN `conversationId` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'assistant_tickets'
      AND index_name = 'assistant_tickets_conversationId_status_updatedAt_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `assistant_tickets_conversationId_status_updatedAt_idx` ON `assistant_tickets`(`conversationId`, `status`, `updatedAt`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'assistant_tickets'
      AND constraint_name = 'assistant_tickets_conversationId_fkey' AND constraint_type = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE `assistant_tickets` ADD CONSTRAINT `assistant_tickets_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'ticketId'
  ),
  'SELECT 1',
  'ALTER TABLE `messages` ADD COLUMN `ticketId` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'messages' AND index_name = 'messages_ticketId_createdAt_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `messages_ticketId_createdAt_idx` ON `messages`(`ticketId`, `createdAt`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'messages'
      AND constraint_name = 'messages_ticketId_fkey' AND constraint_type = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE `messages` ADD CONSTRAINT `messages_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `assistant_tickets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'assistant_ticket_replies' AND column_name = 'messageId'
  ),
  'SELECT 1',
  'ALTER TABLE `assistant_ticket_replies` ADD COLUMN `messageId` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'assistant_ticket_replies'
      AND index_name = 'assistant_ticket_replies_messageId_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `assistant_ticket_replies_messageId_key` ON `assistant_ticket_replies`(`messageId`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'assistant_ticket_replies'
      AND constraint_name = 'assistant_ticket_replies_messageId_fkey' AND constraint_type = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE `assistant_ticket_replies` ADD CONSTRAINT `assistant_ticket_replies_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'eventKey'
  ),
  'SELECT 1',
  'ALTER TABLE `notifications` ADD COLUMN `eventKey` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'notifications'
      AND index_name = 'notifications_userId_eventKey_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `notifications_userId_eventKey_key` ON `notifications`(`userId`, `eventKey`)'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;
