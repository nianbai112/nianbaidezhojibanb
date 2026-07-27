ALTER TABLE "conversations"
  ADD COLUMN "serviceStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "serviceHandlerId" TEXT,
  ADD COLUMN "serviceHandledAt" TIMESTAMP(3);

CREATE INDEX "conversations_serviceStatus_lastMsgTime_idx"
  ON "conversations"("serviceStatus", "lastMsgTime");
