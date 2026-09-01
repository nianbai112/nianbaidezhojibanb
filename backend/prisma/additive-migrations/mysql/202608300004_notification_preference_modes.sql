-- MySQL DDL 会隐式提交；每列先独立守卫新增，中断后可按 NULL 续跑回填。
SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyLikeMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyLikeMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyCommentMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyCommentMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyReplyMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyReplyMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyMentionMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyMentionMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyFollowMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyFollowMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifySquatMode'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifySquatMode` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyOfficialAccount'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyOfficialAccount` BOOLEAN NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_settings' AND column_name = 'notifyInteractionBadge'),
  'SELECT 1',
  'ALTER TABLE `user_settings` ADD COLUMN `notifyInteractionBadge` BOOLEAN NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

-- 每列只回填 NULL，保留已写入的新模式值和原有系统/订单通知偏好。
UPDATE `user_settings`
SET `notifyLikeMode` = IF(`notifyLike` = false, 'off', 'reduced')
WHERE `notifyLikeMode` IS NULL;

UPDATE `user_settings`
SET `notifyCommentMode` = IF(`notifyComment` = false, 'off', 'instant')
WHERE `notifyCommentMode` IS NULL;

UPDATE `user_settings`
SET `notifyReplyMode` = IF(`notifyComment` = false, 'off', 'instant')
WHERE `notifyReplyMode` IS NULL;

UPDATE `user_settings`
SET `notifyMentionMode` = IF(`notifyComment` = false, 'off', 'instant')
WHERE `notifyMentionMode` IS NULL;

UPDATE `user_settings`
SET `notifyFollowMode` = IF(`notifyFollow` = false, 'off', 'inbox')
WHERE `notifyFollowMode` IS NULL;

UPDATE `user_settings`
SET `notifySquatMode` = IF(`notifySquat` = false, 'off', 'inbox')
WHERE `notifySquatMode` IS NULL;

UPDATE `user_settings`
SET `notifyOfficialAccount` = true
WHERE `notifyOfficialAccount` IS NULL;

UPDATE `user_settings`
SET `notifyInteractionBadge` = true
WHERE `notifyInteractionBadge` IS NULL;

-- 回填后统一恢复 Prisma schema 要求的 NOT NULL 与默认值。
ALTER TABLE `user_settings`
  MODIFY COLUMN `notifyLikeMode` VARCHAR(191) NOT NULL DEFAULT 'reduced',
  MODIFY COLUMN `notifyCommentMode` VARCHAR(191) NOT NULL DEFAULT 'instant',
  MODIFY COLUMN `notifyReplyMode` VARCHAR(191) NOT NULL DEFAULT 'instant',
  MODIFY COLUMN `notifyMentionMode` VARCHAR(191) NOT NULL DEFAULT 'instant',
  MODIFY COLUMN `notifyFollowMode` VARCHAR(191) NOT NULL DEFAULT 'inbox',
  MODIFY COLUMN `notifySquatMode` VARCHAR(191) NOT NULL DEFAULT 'inbox',
  MODIFY COLUMN `notifyOfficialAccount` BOOLEAN NOT NULL DEFAULT true,
  MODIFY COLUMN `notifyInteractionBadge` BOOLEAN NOT NULL DEFAULT true;
