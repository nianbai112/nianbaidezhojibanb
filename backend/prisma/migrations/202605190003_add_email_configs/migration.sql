-- The system settings page reads /admin/email-config on load.
-- The Prisma model existed, but the historical migrations did not create the
-- backing table in a fresh local database.
CREATE TABLE IF NOT EXISTS "email_configs" (
  "id" TEXT NOT NULL,
  "host" TEXT NOT NULL DEFAULT 'smtp.qq.com',
  "port" INTEGER NOT NULL DEFAULT 465,
  "secure" BOOLEAN NOT NULL DEFAULT true,
  "user" TEXT NOT NULL,
  "pass" TEXT NOT NULL,
  "fromEmail" TEXT,
  "fromName" TEXT,
  "subjectPrefix" TEXT,
  "emailSignature" TEXT,
  "timeout" INTEGER NOT NULL DEFAULT 10000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_configs_pkey" PRIMARY KEY ("id")
);
