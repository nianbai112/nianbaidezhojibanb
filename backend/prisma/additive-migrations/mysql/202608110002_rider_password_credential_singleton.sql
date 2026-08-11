CREATE TEMPORARY TABLE `_rider_password_credential_keeper` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY
);

INSERT INTO `_rider_password_credential_keeper` (`id`)
SELECT `id`
FROM `rider_app_password_credentials`
ORDER BY `updatedAt` DESC, `createdAt` DESC, `id` ASC
LIMIT 1;

DELETE credential
FROM `rider_app_password_credentials` credential
LEFT JOIN `_rider_password_credential_keeper` keeper ON keeper.`id` = credential.`id`
WHERE keeper.`id` IS NULL;

UPDATE `rider_app_password_credentials` credential
INNER JOIN `_rider_password_credential_keeper` keeper ON keeper.`id` = credential.`id`
SET credential.`id` = 'rider-password-login'
WHERE credential.`id` <> 'rider-password-login';

DROP TEMPORARY TABLE `_rider_password_credential_keeper`;

ALTER TABLE `rider_app_password_credentials`
  MODIFY COLUMN `id` VARCHAR(191) NOT NULL DEFAULT 'rider-password-login';
