-- AI foundation: logs, moderation records, config versions, quota, risk, snapshots.

ALTER TABLE "bot_accounts"
  ADD COLUMN IF NOT EXISTS "failureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "riskLevel" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "lastExecutedAt" TIMESTAMP(3);

ALTER TABLE "bot_post_tasks"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxRetryTimes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "promptVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "personaVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenInput" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tokenOutput" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "costAmount" DECIMAL(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "safetyLabels" JSONB,
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewReason" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedCommentIds" JSONB;

CREATE INDEX IF NOT EXISTS "bot_post_tasks_status_publishAt_idx" ON "bot_post_tasks"("status", "publishAt");
CREATE INDEX IF NOT EXISTS "bot_post_tasks_regionId_status_idx" ON "bot_post_tasks"("regionId", "status");

CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "endpoint" TEXT,
  "purpose" TEXT NOT NULL DEFAULT 'generation',
  "source" TEXT NOT NULL DEFAULT 'system',
  "taskId" TEXT,
  "botId" TEXT,
  "userId" TEXT,
  "adminId" TEXT,
  "regionId" TEXT,
  "promptHash" TEXT,
  "promptPreview" TEXT,
  "responsePreview" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "costAmount" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_call_logs_requestId_key" ON "ai_call_logs"("requestId");
CREATE INDEX IF NOT EXISTS "ai_call_logs_purpose_createdAt_idx" ON "ai_call_logs"("purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_status_createdAt_idx" ON "ai_call_logs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_provider_model_createdAt_idx" ON "ai_call_logs"("provider", "model", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_taskId_createdAt_idx" ON "ai_call_logs"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_botId_createdAt_idx" ON "ai_call_logs"("botId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_regionId_createdAt_idx" ON "ai_call_logs"("regionId", "createdAt");

CREATE TABLE IF NOT EXISTS "ai_moderation_records" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "userId" TEXT,
  "regionId" TEXT,
  "approvalType" TEXT,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "labels" JSONB,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rawResult" JSONB,
  "callLogId" TEXT,
  "fallbackType" TEXT NOT NULL DEFAULT 'none',
  "finalStatus" TEXT,
  "handledBy" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_moderation_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_moderation_records_targetType_targetId_idx" ON "ai_moderation_records"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "ai_moderation_records_decision_createdAt_idx" ON "ai_moderation_records"("decision", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_moderation_records_regionId_createdAt_idx" ON "ai_moderation_records"("regionId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_moderation_records_callLogId_idx" ON "ai_moderation_records"("callLogId");

CREATE TABLE IF NOT EXISTS "ai_config_versions" (
  "id" TEXT NOT NULL,
  "configKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "value" JSONB NOT NULL,
  "maskedValue" JSONB,
  "changedBy" TEXT,
  "changeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_config_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_config_versions_configKey_version_key" ON "ai_config_versions"("configKey", "version");
CREATE INDEX IF NOT EXISTS "ai_config_versions_configKey_createdAt_idx" ON "ai_config_versions"("configKey", "createdAt");

CREATE TABLE IF NOT EXISTS "ai_quota_usage" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "regionId" TEXT,
  "botId" TEXT,
  "purpose" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL DEFAULT 'global',
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costAmount" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_quota_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_quota_usage_date_provider_model_purpose_scopeKey_key" ON "ai_quota_usage"("date", "provider", "model", "purpose", "scopeKey");
CREATE INDEX IF NOT EXISTS "ai_quota_usage_date_provider_model_idx" ON "ai_quota_usage"("date", "provider", "model");
CREATE INDEX IF NOT EXISTS "ai_quota_usage_regionId_date_idx" ON "ai_quota_usage"("regionId", "date");
CREATE INDEX IF NOT EXISTS "ai_quota_usage_botId_date_idx" ON "ai_quota_usage"("botId", "date");

CREATE TABLE IF NOT EXISTS "ai_risk_events" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'warning',
  "botId" TEXT,
  "taskId" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "regionId" TEXT,
  "detail" JSONB,
  "status" TEXT NOT NULL DEFAULT 'open',
  "handledBy" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_risk_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_risk_events_status_level_createdAt_idx" ON "ai_risk_events"("status", "level", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_risk_events_eventType_createdAt_idx" ON "ai_risk_events"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_risk_events_botId_createdAt_idx" ON "ai_risk_events"("botId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_risk_events_taskId_createdAt_idx" ON "ai_risk_events"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_risk_events_regionId_createdAt_idx" ON "ai_risk_events"("regionId", "createdAt");

CREATE TABLE IF NOT EXISTS "ai_generated_snapshots" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "botId" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "prompt" TEXT,
  "rawResult" TEXT,
  "finalContent" TEXT,
  "mediaUrls" JSONB,
  "safetyLabels" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_generated_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_generated_snapshots_taskId_createdAt_idx" ON "ai_generated_snapshots"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_generated_snapshots_botId_createdAt_idx" ON "ai_generated_snapshots"("botId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_generated_snapshots_targetType_targetId_idx" ON "ai_generated_snapshots"("targetType", "targetId");

CREATE TABLE IF NOT EXISTS "ai_task_timelines" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "status" TEXT,
  "detail" JSONB,
  "operatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_task_timelines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_task_timelines_taskId_createdAt_idx" ON "ai_task_timelines"("taskId", "createdAt");
