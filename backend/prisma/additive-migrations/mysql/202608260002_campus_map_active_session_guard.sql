SET @lm_sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'campus_map_collection_sessions'
      AND column_name = 'activeKey'
  ),
  'SELECT 1',
  'ALTER TABLE `campus_map_collection_sessions` ADD COLUMN `activeKey` VARCHAR(191) NULL'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;

-- 先释放旧租约，使脚本可重入；然后按任务+采集人只保留最新的活动会话。
UPDATE `campus_map_collection_sessions`
SET `activeKey` = NULL
WHERE `activeKey` IS NOT NULL;

UPDATE `campus_map_collection_sessions` AS session_row
JOIN (
  SELECT ranked_source.`id`, ranked_source.active_key, ranked_source.row_rank
  FROM (
    SELECT
      `id`,
      CONCAT(`taskId`, ':', `collectorUserId`) AS active_key,
      ROW_NUMBER() OVER (
        PARTITION BY `taskId`, `collectorUserId`
        ORDER BY `startedAt` DESC, `createdAt` DESC, `id` DESC
      ) AS row_rank
    FROM `campus_map_collection_sessions`
    WHERE `status` IN ('recording', 'paused', 'uploading', 'finishing')
  ) AS ranked_source
) AS ranked ON ranked.`id` = session_row.`id`
SET
  session_row.`activeKey` = CASE WHEN ranked.row_rank = 1 THEN ranked.active_key ELSE NULL END,
  session_row.`status` = CASE WHEN ranked.row_rank = 1 THEN session_row.`status` ELSE 'abandoned' END,
  session_row.`endedAt` = CASE
    WHEN ranked.row_rank = 1 THEN session_row.`endedAt`
    ELSE COALESCE(session_row.`endedAt`, NOW(3))
  END,
  session_row.`uploadComplete` = CASE WHEN ranked.row_rank = 1 THEN session_row.`uploadComplete` ELSE FALSE END;

SET @lm_sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'campus_map_collection_sessions'
      AND index_name = 'campus_map_collection_sessions_activeKey_key'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX `campus_map_collection_sessions_activeKey_key` ON `campus_map_collection_sessions`(`activeKey`)'
);
PREPARE lm_stmt FROM @lm_sql;
EXECUTE lm_stmt;
DEALLOCATE PREPARE lm_stmt;
