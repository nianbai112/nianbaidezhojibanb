-- 可重复执行：补齐日志来源和未匹配账号的登录尝试。
SET @log_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='admin_login_logs' AND column_name='username'), 'SELECT 1', 'ALTER TABLE `admin_login_logs` ADD COLUMN `username` VARCHAR(191) NULL');
PREPARE log_stmt FROM @log_ddl; EXECUTE log_stmt; DEALLOCATE PREPARE log_stmt;

SET @log_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wechat_message_logs' AND column_name='requestIp'), 'SELECT 1', 'ALTER TABLE `wechat_message_logs` ADD COLUMN `requestIp` VARCHAR(191) NULL');
PREPARE log_stmt FROM @log_ddl; EXECUTE log_stmt; DEALLOCATE PREPARE log_stmt;

SET @log_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wechat_message_logs' AND column_name='requestIpSource'), 'SELECT 1', 'ALTER TABLE `wechat_message_logs` ADD COLUMN `requestIpSource` VARCHAR(191) NULL');
PREPARE log_stmt FROM @log_ddl; EXECUTE log_stmt; DEALLOCATE PREPARE log_stmt;

SET @log_fk = (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='admin_login_logs' AND column_name='accountId' AND referenced_table_name='admin_accounts' LIMIT 1);
SET @log_ddl = IF(@log_fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `admin_login_logs` DROP FOREIGN KEY `', REPLACE(@log_fk, '`', '``'), '`'));
PREPARE log_stmt FROM @log_ddl; EXECUTE log_stmt; DEALLOCATE PREPARE log_stmt;
ALTER TABLE `admin_login_logs` MODIFY COLUMN `accountId` VARCHAR(191) NULL;
ALTER TABLE `admin_login_logs` ADD CONSTRAINT `admin_login_logs_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `admin_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
