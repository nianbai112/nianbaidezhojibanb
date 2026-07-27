ALTER TABLE "notifications"
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "deliveryReport" JSONB,
ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastDeliveryAt" TIMESTAMP(3);

CREATE INDEX "notifications_deliveryStatus_createdAt_idx"
ON "notifications"("deliveryStatus", "createdAt");
