CREATE TEMPORARY TABLE `_rider_password_credential_003_keeper` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY
);

INSERT INTO `_rider_password_credential_003_keeper` (`id`)
SELECT `id`
FROM `rider_app_password_credentials`
ORDER BY
  (BINARY `id` = BINARY 'rider-password-login') DESC,
  `updatedAt` DESC,
  `createdAt` DESC,
  `id` ASC
LIMIT 1;

DELETE credential
FROM `rider_app_password_credentials` credential
LEFT JOIN `_rider_password_credential_003_keeper` keeper ON keeper.`id` = credential.`id`
WHERE keeper.`id` IS NULL;

UPDATE `rider_app_password_credentials`
SET `id` = 'rider-password-login'
WHERE BINARY `id` <> BINARY 'rider-password-login';

DROP TEMPORARY TABLE `_rider_password_credential_003_keeper`;

SET @rider_password_fixed_id_check_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rider_app_password_credentials'
    AND CONSTRAINT_NAME = 'rider_app_password_credentials_fixed_id_check'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @rider_password_fixed_id_check_sql = IF(
  @rider_password_fixed_id_check_exists = 0,
  'ALTER TABLE `rider_app_password_credentials` ADD CONSTRAINT `rider_app_password_credentials_fixed_id_check` CHECK (BINARY `id` = BINARY ''rider-password-login'')',
  'SELECT 1'
);

PREPARE rider_password_fixed_id_check_statement FROM @rider_password_fixed_id_check_sql;
EXECUTE rider_password_fixed_id_check_statement;
DEALLOCATE PREPARE rider_password_fixed_id_check_statement;
