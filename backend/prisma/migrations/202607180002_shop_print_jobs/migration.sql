CREATE TABLE "print_jobs" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "printerId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "content" TEXT NOT NULL,
  "providerJobId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "printedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "print_jobs_dedupeKey_key" ON "print_jobs"("dedupeKey");
CREATE INDEX "print_jobs_status_createdAt_idx" ON "print_jobs"("status", "createdAt");
CREATE INDEX "print_jobs_orderId_createdAt_idx" ON "print_jobs"("orderId", "createdAt");
