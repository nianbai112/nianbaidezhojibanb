-- Current releases only need additive structures. Historical drift-bottle tables are deliberately retained.

CREATE TABLE IF NOT EXISTS `post_echo_interactions` (
  `id` varchar(191) NOT NULL,
  `postId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `action` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `post_echo_interactions_postId_userId_action_key` (`postId`, `userId`, `action`),
  KEY `post_echo_interactions_postId_action_createdAt_idx` (`postId`, `action`, `createdAt`),
  KEY `post_echo_interactions_userId_createdAt_idx` (`userId`, `createdAt`),
  CONSTRAINT `post_echo_interactions_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_echo_interactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_modifier_groups` (
  `id` varchar(191) NOT NULL,
  `productId` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'attribute',
  `isRequired` boolean NOT NULL DEFAULT false,
  `maxSelect` int NOT NULL DEFAULT 1,
  `sortOrder` int NOT NULL DEFAULT 0,
  `status` varchar(191) NOT NULL DEFAULT 'on_sale',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  KEY `product_modifier_groups_productId_status_sortOrder_idx` (`productId`, `status`, `sortOrder`),
  CONSTRAINT `product_modifier_groups_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_modifier_options` (
  `id` varchar(191) NOT NULL,
  `groupId` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0,
  `stock` int NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `status` varchar(191) NOT NULL DEFAULT 'on_sale',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  KEY `product_modifier_options_groupId_status_sortOrder_idx` (`groupId`, `status`, `sortOrder`),
  CONSTRAINT `product_modifier_options_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `product_modifier_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `online_signin_sessions` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `regionId` varchar(191) NOT NULL,
  `date` varchar(191) NOT NULL,
  `accruedSeconds` int NOT NULL DEFAULT 0,
  `lastHeartbeatAt` datetime(3) NULL,
  `completedAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  UNIQUE KEY `online_signin_sessions_userId_regionId_date_key` (`userId`, `regionId`, `date`),
  KEY `online_signin_sessions_regionId_date_idx` (`regionId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `print_jobs` (
  `id` varchar(191) NOT NULL,
  `orderId` varchar(191) NULL,
  `printerId` varchar(191) NOT NULL,
  `provider` varchar(191) NOT NULL DEFAULT 'feie',
  `event` varchar(191) NOT NULL,
  `dedupeKey` varchar(191) NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'queued',
  `content` varchar(191) NOT NULL,
  `providerJobId` varchar(191) NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `errorMessage` varchar(191) NULL,
  `sentAt` datetime(3) NULL,
  `printedAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  UNIQUE KEY `print_jobs_dedupeKey_key` (`dedupeKey`),
  KEY `print_jobs_status_createdAt_idx` (`status`, `createdAt`),
  KEY `print_jobs_orderId_createdAt_idx` (`orderId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `modifierSelections` json NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'carts' AND column_name = 'modifierSelections')
  UNION ALL SELECT 'ADD COLUMN `selectionKey` varchar(191) NOT NULL DEFAULT ''''' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'carts' AND column_name = 'selectionKey')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `carts` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `periodKey` varchar(191) NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchant_settlements' AND column_name = 'periodKey')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `merchant_settlements` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `business_license_url` varchar(191) NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'business_license_url')
  UNION ALL SELECT 'ADD COLUMN `delivery_time_minutes` int NOT NULL DEFAULT 30' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'delivery_time_minutes')
  UNION ALL SELECT 'ADD COLUMN `food_safety_license_url` varchar(191) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'food_safety_license_url')
  UNION ALL SELECT 'ADD COLUMN `min_order_amount` decimal(10,2) NOT NULL DEFAULT 1' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'min_order_amount')
  UNION ALL SELECT 'ADD COLUMN `packaging_fee` decimal(10,2) NOT NULL DEFAULT 0' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'merchants' AND column_name = 'packaging_fee')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `merchants` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
UPDATE `merchants` SET `min_order_amount` = 0 WHERE `business_type` = 'dorm_shop' AND `min_order_amount` = 1;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `modifierSelections` json NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_items' AND column_name = 'modifierSelections')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `order_items` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `delivery_distance_meters` int NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'delivery_distance_meters')
  UNION ALL SELECT 'ADD COLUMN `fulfillment_start_time` datetime(3) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'fulfillment_start_time')
  UNION ALL SELECT 'ADD COLUMN `merchant_accept_time` datetime(3) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'merchant_accept_time')
  UNION ALL SELECT 'ADD COLUMN `packaging_amount` decimal(10,2) NOT NULL DEFAULT 0' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'packaging_amount')
  UNION ALL SELECT 'ADD COLUMN `pickup_time` datetime(3) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'pickup_time')
  UNION ALL SELECT 'ADD COLUMN `ready_time` datetime(3) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'ready_time')
  UNION ALL SELECT 'ADD COLUMN `scheduled_delivery_time` datetime(3) NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'scheduled_delivery_time')
  UNION ALL SELECT 'ADD COLUMN `stock_reserved` boolean NOT NULL DEFAULT false' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'stock_reserved')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `orders` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `interactionIntent` varchar(191) NOT NULL DEFAULT ''share''' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'interactionIntent')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `posts` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `connectionMode` varchar(191) NOT NULL DEFAULT ''merchant_owned''' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'printer_configs' AND column_name = 'connectionMode')
  UNION ALL SELECT 'ADD COLUMN `credentialCiphertext` text NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'printer_configs' AND column_name = 'credentialCiphertext')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `printer_configs` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `dedupeKey` varchar(191) NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reviews' AND column_name = 'dedupeKey')
  UNION ALL SELECT 'ADD COLUMN `tags` json NULL' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reviews' AND column_name = 'tags')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `reviews` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SELECT GROUP_CONCAT(definition SEPARATOR ', ') INTO @lm_columns FROM (
  SELECT 'ADD COLUMN `periodKey` varchar(191) NULL' AS definition FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rider_settlements' AND column_name = 'periodKey')
) AS missing_columns;
SET @lm_sql = IF(@lm_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `rider_settlements` ', @lm_columns)); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'carts' AND index_name = 'carts_userId_productId_skuId_selectionKey_idx'), 'SELECT 1', 'CREATE INDEX `carts_userId_productId_skuId_selectionKey_idx` ON `carts` (`userId`, `productId`, `skuId`, `selectionKey`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'merchant_settlements' AND index_name = 'merchant_settlements_periodKey_key'), 'SELECT 1', 'CREATE UNIQUE INDEX `merchant_settlements_periodKey_key` ON `merchant_settlements` (`periodKey`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_fulfillment_start_time_status_idx'), 'SELECT 1', 'CREATE INDEX `orders_fulfillment_start_time_status_idx` ON `orders` (`fulfillment_start_time`, `status`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'posts' AND index_name = 'posts_regionId_interactionIntent_createdAt_idx'), 'SELECT 1', 'CREATE INDEX `posts_regionId_interactionIntent_createdAt_idx` ON `posts` (`regionId`, `interactionIntent`, `createdAt`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'reviews' AND index_name = 'reviews_dedupeKey_key'), 'SELECT 1', 'CREATE UNIQUE INDEX `reviews_dedupeKey_key` ON `reviews` (`dedupeKey`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;
SET @lm_sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'rider_settlements' AND index_name = 'rider_settlements_periodKey_key'), 'SELECT 1', 'CREATE UNIQUE INDEX `rider_settlements_periodKey_key` ON `rider_settlements` (`periodKey`)'); PREPARE lm_stmt FROM @lm_sql; EXECUTE lm_stmt; DEALLOCATE PREPARE lm_stmt;

-- ponytail: keep the legacy carts unique index for this patch; drop it only with a dedicated FK-safe cart migration.
