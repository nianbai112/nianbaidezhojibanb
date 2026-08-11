CREATE TABLE IF NOT EXISTS "online_signin_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "accruedSeconds" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "online_signin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "online_signin_sessions_userId_regionId_date_key"
  ON "online_signin_sessions"("userId", "regionId", "date");

CREATE INDEX IF NOT EXISTS "online_signin_sessions_regionId_date_idx"
  ON "online_signin_sessions"("regionId", "date");
