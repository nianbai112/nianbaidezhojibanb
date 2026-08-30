-- 对齐 Prisma schema：旧表建表脚本遗漏了 photos 的 JSON 默认值。
ALTER TABLE "campus_map_projects"
  ALTER COLUMN "photos" SET DEFAULT '[]'::jsonb;

-- 只有 ready/collecting 任务可以持有活动采集租约。旧数据中已结束/已取消任务的会话安全收口。
UPDATE "campus_map_collection_sessions" AS session_row
SET
  "status" = 'abandoned',
  "endedAt" = COALESCE(session_row."endedAt", CURRENT_TIMESTAMP),
  "uploadComplete" = false,
  "activeKey" = NULL
FROM "campus_map_collection_tasks" AS task_row
WHERE task_row."id" = session_row."taskId"
  AND task_row."status" NOT IN ('ready', 'collecting')
  AND session_row."status" IN ('recording', 'paused', 'uploading', 'finishing');

-- 历史自动导入的目录与照片只能回到待审核，由运营人员明确发布后才进入小程序快照。
UPDATE "campus_map_projects"
SET "publishStatus" = 'review'
WHERE "publishStatus" = 'published'
  AND "coordinateStatus" = 'uncollected'
  AND "coordinateSource" IS NULL;

UPDATE "campus_map_place_media"
SET "reviewStatus" = 'pending', "isPublic" = false
WHERE "sourceType" = 'legacy_admin';
