-- Add post/comment mention storage and notification type.

ALTER TABLE `notifications`
  MODIFY `type` ENUM(
    'SYSTEM','LIKE','COMMENT','REPLY','MENTION','FOLLOW','SQUAT','MESSAGE',
    'ORDER','DELIVERY','REFUND','WALLET','CIRCLE','CERTIFICATION','MERCHANT',
    'ANNOUNCEMENT','ADMIN_BROADCAST','EXPIRED'
  ) NOT NULL DEFAULT 'SYSTEM';

CREATE TABLE IF NOT EXISTS `post_mentions` (
  `id` VARCHAR(191) NOT NULL,
  `post_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `post_mentions_post_id_user_id_key` (`post_id`, `user_id`),
  KEY `post_mentions_user_id_created_at_idx` (`user_id`, `created_at`),
  CONSTRAINT `post_mentions_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_mentions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comment_mentions` (
  `id` VARCHAR(191) NOT NULL,
  `comment_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `comment_mentions_comment_id_user_id_key` (`comment_id`, `user_id`),
  KEY `comment_mentions_user_id_created_at_idx` (`user_id`, `created_at`),
  CONSTRAINT `comment_mentions_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_mentions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
