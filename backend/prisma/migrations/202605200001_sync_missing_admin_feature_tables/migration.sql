-- Safe additive sync for admin feature pages that already exist in Prisma/client code.
-- Keep this migration additive only: no enum rewrites, no column drops.

DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "levelId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "parentId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "pendingEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "remark" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "totalEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "totalOrders" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD COLUMN "withdrawnEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "rating_categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "rating_items" ADD COLUMN "regionId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "circle_payments" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payChannel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "circle_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "distributor_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "conditionOrderCount" INTEGER NOT NULL DEFAULT 0,
    "conditionTotalAmount" DECIMAL(12,2),
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "distributor_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "distributor_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "distributor_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "distributor_commissions" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(12,2) NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sourceUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "distributor_commissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "distributor_withdrawals" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "withdrawNo" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "remark" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "distributor_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_levels" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "levelNumber" INTEGER NOT NULL,
    "levelName" TEXT NOT NULL,
    "levelPrefix" TEXT,
    "requiredExp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "backgroundColor" TEXT,
    "textColor" TEXT,
    "borderColor" TEXT,
    "borderWidth" INTEGER,
    "borderRadius" INTEGER,
    "fontSize" INTEGER,
    "fontWeight" TEXT,
    "paddingTop" INTEGER,
    "paddingBottom" INTEGER,
    "paddingLeft" INTEGER,
    "paddingRight" INTEGER,
    "prefixFontSize" INTEGER,
    "prefixTextColor" TEXT,
    "levelDescription" TEXT,
    "levelBenefits" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_experiences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changeAmount" INTEGER NOT NULL,
    "reason" TEXT,
    "beforeLevel" TEXT,
    "afterLevel" TEXT,
    "beforeExp" INTEGER NOT NULL DEFAULT 0,
    "afterExp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_experiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_tag_definitions" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "tagName" TEXT NOT NULL,
    "tagLevel" INTEGER NOT NULL DEFAULT 1,
    "tagColor" TEXT,
    "tagDesc" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "backgroundColor" TEXT,
    "textColor" TEXT,
    "borderColor" TEXT,
    "borderWidth" INTEGER,
    "borderRadius" INTEGER,
    "fontSize" INTEGER,
    "fontWeight" TEXT,
    "paddingTop" INTEGER,
    "paddingBottom" INTEGER,
    "paddingLeft" INTEGER,
    "paddingRight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_tag_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_balance_logs" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userIds" JSONB NOT NULL,
    "amount" DECIMAL(12,2),
    "reason" TEXT,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_balance_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "miniapp_pages" (
    "id" TEXT NOT NULL,
    "packageName" TEXT NOT NULL DEFAULT 'main',
    "path" TEXT NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "miniapp_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tracking_events" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "regionId" TEXT,
    "pagePath" TEXT,
    "targetId" TEXT,
    "targetType" TEXT,
    "params" JSONB,
    "ip" TEXT,
    "ua" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ab_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "regionId" TEXT,
    "variants" JSONB NOT NULL,
    "targetMetric" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ab_test_assignments" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ab_test_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ab_test_results" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ab_test_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recommend_strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "regionId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weights" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "rankRules" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommend_strategies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recommend_pools" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "regionId" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "factors" JSONB,
    "expireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommend_pools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recommend_controls" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expireAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommend_controls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cron" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "scheduled_job_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "scheduled_job_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "data_scopes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "data_scope_roles" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_scope_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "distributor_levels_level_key" ON "distributor_levels"("level");
CREATE UNIQUE INDEX IF NOT EXISTS "distributor_configs_key_key" ON "distributor_configs"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "distributor_withdrawals_withdrawNo_key" ON "distributor_withdrawals"("withdrawNo");
CREATE UNIQUE INDEX IF NOT EXISTS "user_levels_regionId_levelNumber_key" ON "user_levels"("regionId", "levelNumber");
CREATE INDEX IF NOT EXISTS "user_experiences_userId_createdAt_idx" ON "user_experiences"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "user_tag_definitions_regionId_tagName_key" ON "user_tag_definitions"("regionId", "tagName");
CREATE INDEX IF NOT EXISTS "user_balance_logs_operatorId_createdAt_idx" ON "user_balance_logs"("operatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "user_balance_logs_action_createdAt_idx" ON "user_balance_logs"("action", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "miniapp_pages_path_key" ON "miniapp_pages"("path");
CREATE INDEX IF NOT EXISTS "tracking_events_eventName_createdAt_idx" ON "tracking_events"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "tracking_events_userId_createdAt_idx" ON "tracking_events"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "tracking_events_regionId_createdAt_idx" ON "tracking_events"("regionId", "createdAt");
CREATE INDEX IF NOT EXISTS "tracking_events_pagePath_createdAt_idx" ON "tracking_events"("pagePath", "createdAt");
CREATE INDEX IF NOT EXISTS "tracking_events_createdAt_idx" ON "tracking_events"("createdAt");
CREATE INDEX IF NOT EXISTS "ab_tests_status_regionId_idx" ON "ab_tests"("status", "regionId");
CREATE INDEX IF NOT EXISTS "ab_test_assignments_userId_idx" ON "ab_test_assignments"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ab_test_assignments_testId_userId_key" ON "ab_test_assignments"("testId", "userId");
CREATE INDEX IF NOT EXISTS "ab_test_results_testId_date_idx" ON "ab_test_results"("testId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "ab_test_results_testId_variantId_metric_date_key" ON "ab_test_results"("testId", "variantId", "metric", "date");
CREATE INDEX IF NOT EXISTS "recommend_strategies_targetType_regionId_idx" ON "recommend_strategies"("targetType", "regionId");
CREATE INDEX IF NOT EXISTS "recommend_pools_targetType_regionId_score_idx" ON "recommend_pools"("targetType", "regionId", "score");
CREATE INDEX IF NOT EXISTS "recommend_pools_expireAt_idx" ON "recommend_pools"("expireAt");
CREATE UNIQUE INDEX IF NOT EXISTS "recommend_pools_targetType_targetId_regionId_key" ON "recommend_pools"("targetType", "targetId", "regionId");
CREATE INDEX IF NOT EXISTS "recommend_controls_targetType_action_idx" ON "recommend_controls"("targetType", "action");
CREATE UNIQUE INDEX IF NOT EXISTS "recommend_controls_targetType_targetId_action_key" ON "recommend_controls"("targetType", "targetId", "action");
CREATE INDEX IF NOT EXISTS "scheduled_jobs_type_isEnabled_idx" ON "scheduled_jobs"("type", "isEnabled");
CREATE INDEX IF NOT EXISTS "scheduled_job_logs_jobId_startedAt_idx" ON "scheduled_job_logs"("jobId", "startedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "data_scope_roles_scopeId_roleId_key" ON "data_scope_roles"("scopeId", "roleId");

DO $$ BEGIN ALTER TABLE "circle_payments" ADD CONSTRAINT "circle_payments_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "circle_payments" ADD CONSTRAINT "circle_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD CONSTRAINT "mall_distributors_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "distributor_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mall_distributors" ADD CONSTRAINT "mall_distributors_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "mall_distributors"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "distributor_commissions" ADD CONSTRAINT "distributor_commissions_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "mall_distributors"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "distributor_withdrawals" ADD CONSTRAINT "distributor_withdrawals_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "mall_distributors"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ab_test_assignments" ADD CONSTRAINT "ab_test_assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "scheduled_job_logs" ADD CONSTRAINT "scheduled_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "data_scope_roles" ADD CONSTRAINT "data_scope_roles_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "data_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
