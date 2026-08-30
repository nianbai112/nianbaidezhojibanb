-- 对齐 schema.mysql.prisma 的 Json @default("[]")；MySQL 8 的 JSON 默认值需要表达式。
ALTER TABLE `campus_map_projects`
  MODIFY COLUMN `photos` JSON NOT NULL DEFAULT (JSON_ARRAY());

-- 只有 ready/collecting 任务可以持有活动采集租约。
UPDATE `campus_map_collection_sessions` AS session_row
JOIN `campus_map_collection_tasks` AS task_row
  ON task_row.`id` = session_row.`taskId`
SET
  session_row.`status` = 'abandoned',
  session_row.`endedAt` = COALESCE(session_row.`endedAt`, NOW(3)),
  session_row.`uploadComplete` = FALSE,
  session_row.`activeKey` = NULL
WHERE task_row.`status` NOT IN ('ready', 'collecting')
  AND session_row.`status` IN ('recording', 'paused', 'uploading', 'finishing');

-- 历史自动导入的目录与照片必须经运营人员明确审核。
UPDATE `campus_map_projects`
SET `publishStatus` = 'review'
WHERE `publishStatus` = 'published'
  AND `coordinateStatus` = 'uncollected'
  AND `coordinateSource` IS NULL;

UPDATE `campus_map_place_media`
SET `reviewStatus` = 'pending', `isPublic` = FALSE
WHERE `sourceType` = 'legacy_admin';
