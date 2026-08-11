CREATE TABLE "assistant_tickets" (
  "id" TEXT NOT NULL,
  "ticketNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "handlerId" TEXT,
  "latestReply" TEXT,
  "unreadForUser" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistant_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_tickets_ticketNo_key" ON "assistant_tickets"("ticketNo");
CREATE INDEX "assistant_tickets_userId_regionId_updatedAt_idx" ON "assistant_tickets"("userId", "regionId", "updatedAt");
CREATE INDEX "assistant_tickets_regionId_status_updatedAt_idx" ON "assistant_tickets"("regionId", "status", "updatedAt");

CREATE TABLE "assistant_ticket_replies" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "senderId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_ticket_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_ticket_replies_ticketId_createdAt_idx" ON "assistant_ticket_replies"("ticketId", "createdAt");
ALTER TABLE "assistant_ticket_replies" ADD CONSTRAINT "assistant_ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "assistant_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
