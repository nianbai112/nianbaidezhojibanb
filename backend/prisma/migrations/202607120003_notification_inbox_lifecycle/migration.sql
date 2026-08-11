ALTER TABLE "notifications"
ADD COLUMN "hiddenAt" TIMESTAMP(3);

ALTER TABLE "user_settings"
ADD COLUMN "notifySquat" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "notifications_userId_hiddenAt_createdAt_idx"
ON "notifications"("userId", "hiddenAt", "createdAt");
