ALTER TABLE "campus_map_collection_sessions"
  ADD COLUMN IF NOT EXISTS "activeKey" TEXT;

-- activeKey 是每个任务+采集人的数据库级单活租约。
-- 历史数据如果已有重复活动会话，保留最新的一条，其余安全收口为 abandoned。
UPDATE "campus_map_collection_sessions"
SET "activeKey" = NULL
WHERE "activeKey" IS NOT NULL;

WITH ranked_active_sessions AS (
  SELECT
    "id",
    "taskId" || ':' || "collectorUserId" AS active_key,
    ROW_NUMBER() OVER (
      PARTITION BY "taskId", "collectorUserId"
      ORDER BY "startedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "campus_map_collection_sessions"
  WHERE "status" IN ('recording', 'paused', 'uploading', 'finishing')
)
UPDATE "campus_map_collection_sessions" AS session_row
SET
  "activeKey" = CASE WHEN ranked.row_number = 1 THEN ranked.active_key ELSE NULL END,
  "status" = CASE WHEN ranked.row_number = 1 THEN session_row."status" ELSE 'abandoned' END,
  "endedAt" = CASE
    WHEN ranked.row_number = 1 THEN session_row."endedAt"
    ELSE COALESCE(session_row."endedAt", CURRENT_TIMESTAMP)
  END,
  "uploadComplete" = CASE WHEN ranked.row_number = 1 THEN session_row."uploadComplete" ELSE false END
FROM ranked_active_sessions AS ranked
WHERE session_row."id" = ranked."id";

CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_sessions_activeKey_key"
  ON "campus_map_collection_sessions"("activeKey");
