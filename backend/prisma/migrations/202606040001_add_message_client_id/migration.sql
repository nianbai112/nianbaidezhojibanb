ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "messages_senderId_clientMessageId_key"
  ON "messages"("senderId", "clientMessageId");
