CREATE TABLE "errand_assignee_mutexes" (
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "errand_assignee_mutexes_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "errand_settlement_holds" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'holding',
  "reasonCode" TEXT NOT NULL,
  "releaseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "errand_settlement_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "errand_settlement_holds_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "errand_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "errand_settlement_holds_orderId_key"
  ON "errand_settlement_holds"("orderId");
CREATE INDEX "errand_settlement_holds_riderId_status_idx"
  ON "errand_settlement_holds"("riderId", "status");
CREATE INDEX "errand_settlement_holds_status_releaseAt_idx"
  ON "errand_settlement_holds"("status", "releaseAt");

CREATE TABLE "marketing_campaign_budget_counters" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_campaign_budget_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_campaign_budget_counters_campaignId_scopeKey_key"
  ON "marketing_campaign_budget_counters"("campaignId", "scopeKey");
CREATE INDEX "marketing_campaign_budget_counters_campaignId_idx"
  ON "marketing_campaign_budget_counters"("campaignId");

-- 迁移前已完成的营销跑腿单也必须进入同一收益状态机：
-- 已经 PAID 的只能标记为 released；尚未支付的从完成时间起冻结 48 小时。
INSERT INTO "errand_settlement_holds" (
  "id", "orderId", "riderId", "status", "reasonCode", "releaseAt",
  "resolvedAt", "resolvedBy", "createdAt", "updatedAt"
)
SELECT
  'backfill_' || MD5(e."id"),
  e."id",
  e."riderId",
  CASE WHEN EXISTS (
    SELECT 1 FROM "rider_settlement_items" rsi
    JOIN "rider_settlements" rs ON rs."id" = rsi."settlementId"
    WHERE rsi."orderType" = 'errand' AND rsi."orderId" = e."id" AND rs."status" = 'PAID'
  ) THEN 'released' ELSE 'holding' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM "rider_settlement_items" rsi
    JOIN "rider_settlements" rs ON rs."id" = rsi."settlementId"
    WHERE rsi."orderType" = 'errand' AND rsi."orderId" = e."id" AND rs."status" = 'PAID'
  ) THEN 'legacy_already_paid' ELSE 'marketing_cooling_period_backfill' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM "rider_settlement_items" rsi
    JOIN "rider_settlements" rs ON rs."id" = rsi."settlementId"
    WHERE rsi."orderType" = 'errand' AND rsi."orderId" = e."id" AND rs."status" = 'PAID'
  ) THEN NULL ELSE COALESCE(e."receiptConfirmedAt", e."completeTime", e."updatedAt", e."createdAt") + INTERVAL '48 hours' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM "rider_settlement_items" rsi
    JOIN "rider_settlements" rs ON rs."id" = rsi."settlementId"
    WHERE rsi."orderType" = 'errand' AND rsi."orderId" = e."id" AND rs."status" = 'PAID'
  ) THEN CURRENT_TIMESTAMP ELSE NULL END,
  CASE WHEN EXISTS (
    SELECT 1 FROM "rider_settlement_items" rsi
    JOIN "rider_settlements" rs ON rs."id" = rsi."settlementId"
    WHERE rsi."orderType" = 'errand' AND rsi."orderId" = e."id" AND rs."status" = 'PAID'
  ) THEN 'migration:legacy-paid' ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "errand_orders" e
WHERE e."status" = 'completed'
  AND e."riderId" IS NOT NULL
  AND (
    e."couponDiscount" > 0
    OR EXISTS (
      SELECT 1 FROM "subsidy_ledgers" sl
      WHERE sl."orderType" = 'errand_order' AND sl."orderId" = e."id" AND sl."status" <> 'cancelled'
    )
  )
ON CONFLICT ("orderId") DO NOTHING;

-- 兼容迁移上线前已经发生的活动补贴，避免计数器从 0 开始造成预算二次释放。
INSERT INTO "marketing_campaign_budget_counters" ("id", "campaignId", "scopeKey", "spent", "uses", "version", "updatedAt")
SELECT "campaignId" || ':total', "campaignId", 'total', SUM("amount"), COUNT(*)::INTEGER, 1, CURRENT_TIMESTAMP
FROM "subsidy_ledgers"
WHERE "campaignId" IS NOT NULL AND "status" <> 'cancelled'
GROUP BY "campaignId"
ON CONFLICT ("id") DO UPDATE SET "spent" = EXCLUDED."spent", "uses" = EXCLUDED."uses", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "marketing_campaign_budget_counters" ("id", "campaignId", "scopeKey", "spent", "uses", "version", "updatedAt")
SELECT
  "campaignId" || ':day:' || TO_CHAR("createdAt" + INTERVAL '8 hours', 'YYYY-MM-DD'),
  "campaignId",
  'day:' || TO_CHAR("createdAt" + INTERVAL '8 hours', 'YYYY-MM-DD'),
  SUM("amount"), COUNT(*)::INTEGER, 1, CURRENT_TIMESTAMP
FROM "subsidy_ledgers"
WHERE "campaignId" IS NOT NULL AND "status" <> 'cancelled'
GROUP BY "campaignId", TO_CHAR("createdAt" + INTERVAL '8 hours', 'YYYY-MM-DD')
ON CONFLICT ("id") DO UPDATE SET "spent" = EXCLUDED."spent", "uses" = EXCLUDED."uses", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "marketing_campaign_budget_counters" ("id", "campaignId", "scopeKey", "spent", "uses", "version", "updatedAt")
SELECT "campaignId" || ':user:' || "userId", "campaignId", 'user:' || "userId", SUM("amount"), COUNT(*)::INTEGER, 1, CURRENT_TIMESTAMP
FROM "subsidy_ledgers"
WHERE "campaignId" IS NOT NULL AND "userId" IS NOT NULL AND "status" <> 'cancelled'
GROUP BY "campaignId", "userId"
ON CONFLICT ("id") DO UPDATE SET "spent" = EXCLUDED."spent", "uses" = EXCLUDED."uses", "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "delivery_risk_events"
  ADD COLUMN IF NOT EXISTS "resolution" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT;
