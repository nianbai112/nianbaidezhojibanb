CREATE TABLE IF NOT EXISTS `errand_assignee_mutexes` (
  `userId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `errand_settlement_holds` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `riderId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'holding',
  `reasonCode` VARCHAR(191) NOT NULL,
  `releaseAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolvedBy` VARCHAR(191) NULL,
  `resolutionNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `errand_settlement_holds_orderId_key` (`orderId`),
  KEY `errand_settlement_holds_riderId_status_idx` (`riderId`, `status`),
  KEY `errand_settlement_holds_status_releaseAt_idx` (`status`, `releaseAt`),
  CONSTRAINT `errand_settlement_holds_orderId_fkey` FOREIGN KEY (`orderId`)
    REFERENCES `errand_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `marketing_campaign_budget_counters` (
  `id` VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NOT NULL,
  `scopeKey` VARCHAR(191) NOT NULL,
  `spent` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `uses` INTEGER NOT NULL DEFAULT 0,
  `version` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_campaign_budget_counters_campaignId_scopeKey_key` (`campaignId`, `scopeKey`),
  KEY `marketing_campaign_budget_counters_campaignId_idx` (`campaignId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 迁移前已完成的营销跑腿单也必须进入同一收益状态机：
-- 已经 PAID 的只能标记为 released；尚未支付的从完成时间起冻结 48 小时。
INSERT IGNORE INTO `errand_settlement_holds` (
  `id`, `orderId`, `riderId`, `status`, `reasonCode`, `releaseAt`,
  `resolvedAt`, `resolvedBy`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('backfill_', MD5(e.`id`)),
  e.`id`,
  e.`riderId`,
  CASE WHEN EXISTS (
    SELECT 1 FROM `rider_settlement_items` rsi
    JOIN `rider_settlements` rs ON rs.`id` = rsi.`settlementId`
    WHERE rsi.`orderType` = 'errand' AND rsi.`orderId` = e.`id` AND rs.`status` = 'PAID'
  ) THEN 'released' ELSE 'holding' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM `rider_settlement_items` rsi
    JOIN `rider_settlements` rs ON rs.`id` = rsi.`settlementId`
    WHERE rsi.`orderType` = 'errand' AND rsi.`orderId` = e.`id` AND rs.`status` = 'PAID'
  ) THEN 'legacy_already_paid' ELSE 'marketing_cooling_period_backfill' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM `rider_settlement_items` rsi
    JOIN `rider_settlements` rs ON rs.`id` = rsi.`settlementId`
    WHERE rsi.`orderType` = 'errand' AND rsi.`orderId` = e.`id` AND rs.`status` = 'PAID'
  ) THEN NULL ELSE DATE_ADD(COALESCE(e.`receiptConfirmedAt`, e.`completeTime`, e.`updatedAt`, e.`createdAt`), INTERVAL 48 HOUR) END,
  CASE WHEN EXISTS (
    SELECT 1 FROM `rider_settlement_items` rsi
    JOIN `rider_settlements` rs ON rs.`id` = rsi.`settlementId`
    WHERE rsi.`orderType` = 'errand' AND rsi.`orderId` = e.`id` AND rs.`status` = 'PAID'
  ) THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
  CASE WHEN EXISTS (
    SELECT 1 FROM `rider_settlement_items` rsi
    JOIN `rider_settlements` rs ON rs.`id` = rsi.`settlementId`
    WHERE rsi.`orderType` = 'errand' AND rsi.`orderId` = e.`id` AND rs.`status` = 'PAID'
  ) THEN 'migration:legacy-paid' ELSE NULL END,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `errand_orders` e
WHERE e.`status` = 'completed'
  AND e.`riderId` IS NOT NULL
  AND (
    e.`couponDiscount` > 0
    OR EXISTS (
      SELECT 1 FROM `subsidy_ledgers` sl
      WHERE sl.`orderType` = 'errand_order' AND sl.`orderId` = e.`id` AND sl.`status` <> 'cancelled'
    )
  );

-- 回填迁移前已经存在的活动消耗，重复执行时以补贴台账为准。
INSERT INTO `marketing_campaign_budget_counters` (`id`, `campaignId`, `scopeKey`, `spent`, `uses`, `version`, `updatedAt`)
SELECT CONCAT(`campaignId`, ':total'), `campaignId`, 'total', SUM(`amount`), COUNT(*), 1, CURRENT_TIMESTAMP(3)
FROM `subsidy_ledgers`
WHERE `campaignId` IS NOT NULL AND `status` <> 'cancelled'
GROUP BY `campaignId`
ON DUPLICATE KEY UPDATE `spent` = VALUES(`spent`), `uses` = VALUES(`uses`), `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `marketing_campaign_budget_counters` (`id`, `campaignId`, `scopeKey`, `spent`, `uses`, `version`, `updatedAt`)
SELECT
  CONCAT(daily.`campaignId`, ':day:', daily.`dayKey`),
  daily.`campaignId`,
  CONCAT('day:', daily.`dayKey`),
  daily.`spent`, daily.`uses`, 1, CURRENT_TIMESTAMP(3)
FROM (
  SELECT
    `campaignId`,
    DATE_FORMAT(CONVERT_TZ(`createdAt`, '+00:00', '+08:00'), '%Y-%m-%d') AS `dayKey`,
    SUM(`amount`) AS `spent`, COUNT(*) AS `uses`
  FROM `subsidy_ledgers`
  WHERE `campaignId` IS NOT NULL AND `status` <> 'cancelled'
  GROUP BY `campaignId`, `dayKey`
) AS daily
ON DUPLICATE KEY UPDATE `spent` = VALUES(`spent`), `uses` = VALUES(`uses`), `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `marketing_campaign_budget_counters` (`id`, `campaignId`, `scopeKey`, `spent`, `uses`, `version`, `updatedAt`)
SELECT CONCAT(`campaignId`, ':user:', `userId`), `campaignId`, CONCAT('user:', `userId`), SUM(`amount`), COUNT(*), 1, CURRENT_TIMESTAMP(3)
FROM `subsidy_ledgers`
WHERE `campaignId` IS NOT NULL AND `userId` IS NOT NULL AND `status` <> 'cancelled'
GROUP BY `campaignId`, `userId`
ON DUPLICATE KEY UPDATE `spent` = VALUES(`spent`), `uses` = VALUES(`uses`), `updatedAt` = CURRENT_TIMESTAMP(3);

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_risk_events' AND column_name = 'resolution'),
  'SELECT 1',
  'ALTER TABLE `delivery_risk_events` ADD COLUMN `resolution` VARCHAR(191) NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;

SET @lingmeng_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_risk_events' AND column_name = 'resolutionNote'),
  'SELECT 1',
  'ALTER TABLE `delivery_risk_events` ADD COLUMN `resolutionNote` TEXT NULL'
);
PREPARE lingmeng_stmt FROM @lingmeng_sql;
EXECUTE lingmeng_stmt;
DEALLOCATE PREPARE lingmeng_stmt;
