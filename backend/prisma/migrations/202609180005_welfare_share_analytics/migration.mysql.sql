CREATE TABLE IF NOT EXISTS `welfare_share_links` (
  `token` VARCHAR(191) NOT NULL,
  `campaign_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`token`),
  UNIQUE KEY `welfare_share_links_campaign_id_user_id_key` (`campaign_id`, `user_id`),
  CONSTRAINT `welfare_share_links_campaign_id_fkey`
    FOREIGN KEY (`campaign_id`) REFERENCES `welfare_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `welfare_share_visits` (
  `id` VARCHAR(191) NOT NULL,
  `link_token` VARCHAR(191) NOT NULL,
  `visitor_key` VARCHAR(191) NOT NULL,
  `group_key` VARCHAR(191) NOT NULL,
  `source` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `welfare_share_visits_link_token_visitor_key_group_key_key` (`link_token`, `visitor_key`, `group_key`),
  KEY `welfare_share_visits_link_token_source_idx` (`link_token`, `source`),
  CONSTRAINT `welfare_share_visits_link_token_fkey`
    FOREIGN KEY (`link_token`) REFERENCES `welfare_share_links` (`token`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
