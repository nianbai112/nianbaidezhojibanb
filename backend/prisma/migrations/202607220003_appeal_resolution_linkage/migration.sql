ALTER TABLE "order_appeal_events"
  ADD COLUMN IF NOT EXISTS "actionKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "order_appeal_events_actionKey_key"
  ON "order_appeal_events"("actionKey");

ALTER TABLE "payment_refunds"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

CREATE INDEX IF NOT EXISTS "payment_refunds_sourceType_sourceId_idx"
  ON "payment_refunds"("sourceType", "sourceId");
