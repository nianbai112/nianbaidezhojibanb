-- AlterTable
ALTER TABLE "welfare_campaigns" ADD COLUMN     "checkinSessionId" TEXT;

-- CreateTable
CREATE TABLE "welfare_checkin_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "regionId" TEXT,
    "location" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allowStaffScan" BOOLEAN NOT NULL DEFAULT true,
    "allowSelfScan" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "qrSecret" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welfare_checkin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_checkin_staff" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "welfare_checkin_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_checkin_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welfare_checkin_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "welfare_checkin_sessions_regionId_status_startAt_idx" ON "welfare_checkin_sessions"("regionId", "status", "startAt");

-- CreateIndex
CREATE INDEX "welfare_checkin_staff_userId_idx" ON "welfare_checkin_staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_checkin_staff_sessionId_userId_key" ON "welfare_checkin_staff"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "welfare_checkin_records_sessionId_signedAt_idx" ON "welfare_checkin_records"("sessionId", "signedAt");

-- CreateIndex
CREATE INDEX "welfare_checkin_records_userId_idx" ON "welfare_checkin_records"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_checkin_records_sessionId_userId_key" ON "welfare_checkin_records"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "welfare_campaigns_checkinSessionId_idx" ON "welfare_campaigns"("checkinSessionId");

-- AddForeignKey
ALTER TABLE "welfare_campaigns" ADD CONSTRAINT "welfare_campaigns_checkinSessionId_fkey" FOREIGN KEY ("checkinSessionId") REFERENCES "welfare_checkin_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_checkin_staff" ADD CONSTRAINT "welfare_checkin_staff_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "welfare_checkin_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_checkin_staff" ADD CONSTRAINT "welfare_checkin_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_checkin_records" ADD CONSTRAINT "welfare_checkin_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "welfare_checkin_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_checkin_records" ADD CONSTRAINT "welfare_checkin_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

