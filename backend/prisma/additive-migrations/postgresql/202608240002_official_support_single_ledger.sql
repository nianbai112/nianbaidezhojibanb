-- 校园小助手单主账的兼容字段。全部为可空增量字段，历史数据不会被删除或重写。
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "systemRole" VARCHAR(191);

UPDATE "users"
SET "systemRole" = 'OFFICIAL_ASSISTANT'
WHERE "openid" = 'lingmeng_official_message_account'
  AND "systemRole" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_systemRole_key"
  ON "users"("systemRole");

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "scopeKey" VARCHAR(191);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_scopeKey_key"
  ON "conversations"("scopeKey");

ALTER TABLE "assistant_tickets"
  ADD COLUMN IF NOT EXISTS "conversationId" VARCHAR(191);

CREATE INDEX IF NOT EXISTS "assistant_tickets_conversationId_status_updatedAt_idx"
  ON "assistant_tickets"("conversationId", "status", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "assistant_tickets"
    ADD CONSTRAINT "assistant_tickets_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "ticketId" VARCHAR(191);

CREATE INDEX IF NOT EXISTS "messages_ticketId_createdAt_idx"
  ON "messages"("ticketId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "assistant_tickets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "assistant_ticket_replies"
  ADD COLUMN IF NOT EXISTS "messageId" VARCHAR(191);

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_ticket_replies_messageId_key"
  ON "assistant_ticket_replies"("messageId");

DO $$ BEGIN
  ALTER TABLE "assistant_ticket_replies"
    ADD CONSTRAINT "assistant_ticket_replies_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "eventKey" VARCHAR(191);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_userId_eventKey_key"
  ON "notifications"("userId", "eventKey");
