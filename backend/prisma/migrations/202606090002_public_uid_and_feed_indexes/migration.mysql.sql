-- MySQL version of public UID and feed freshness indexes.
-- Use this file only when the deployment database is MySQL.

ALTER TABLE `users`
  ADD COLUMN `publicUid` INTEGER NULL;

SET @lm_public_uid_rn := 0;
UPDATE `users` u
JOIN (
  SELECT
    ordered.`id`,
    10000000 + ((@lm_public_uid_rn := @lm_public_uid_rn + 1) * 7919 % 90000000) AS public_uid
  FROM (
    SELECT `id`
    FROM `users`
    WHERE `publicUid` IS NULL
    ORDER BY MD5(CONCAT(`id`, ':', COALESCE(`openid`, '')))
  ) ordered
) generated ON generated.`id` = u.`id`
SET u.`publicUid` = generated.public_uid
WHERE u.`publicUid` IS NULL;

CREATE UNIQUE INDEX `users_publicUid_key`
  ON `users`(`publicUid`);

CREATE INDEX `users_publicUid_idx`
  ON `users`(`publicUid`);

CREATE INDEX `posts_regionId_status_auditStatus_createdAt_idx`
  ON `posts`(`regionId`, `status`, `auditStatus`, `createdAt`);

CREATE INDEX `posts_circleId_status_auditStatus_createdAt_idx`
  ON `posts`(`circleId`, `status`, `auditStatus`, `createdAt`);

CREATE INDEX `comments_postId_status_auditStatus_parentId_createdAt_idx`
  ON `comments`(`postId`, `status`, `auditStatus`, `parentId`, `createdAt`);
