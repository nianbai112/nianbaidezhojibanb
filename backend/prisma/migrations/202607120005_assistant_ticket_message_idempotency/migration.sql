ALTER TABLE "assistant_ticket_replies"
ADD COLUMN "clientMessageId" TEXT;

CREATE UNIQUE INDEX "assistant_ticket_replies_senderId_clientMessageId_key"
ON "assistant_ticket_replies"("senderId", "clientMessageId");
