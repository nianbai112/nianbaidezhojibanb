CREATE TABLE "order_appeals" (
  "id" TEXT NOT NULL,
  "appealNo" TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "regionId" TEXT,
  "orderSnapshot" JSONB,
  "appealType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceImages" JSONB,
  "contactPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "handlerId" TEXT,
  "latestReply" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_appeals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_appeals_appealNo_key" ON "order_appeals"("appealNo");
CREATE UNIQUE INDEX "order_appeals_orderType_orderId_key" ON "order_appeals"("orderType", "orderId");
CREATE INDEX "order_appeals_userId_createdAt_idx" ON "order_appeals"("userId", "createdAt");
CREATE INDEX "order_appeals_regionId_status_createdAt_idx" ON "order_appeals"("regionId", "status", "createdAt");

CREATE TABLE "order_appeal_events" (
  "id" TEXT NOT NULL,
  "appealId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "status" TEXT,
  "content" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_appeal_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_appeal_events_appealId_createdAt_idx" ON "order_appeal_events"("appealId", "createdAt");
ALTER TABLE "order_appeal_events" ADD CONSTRAINT "order_appeal_events_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "order_appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
