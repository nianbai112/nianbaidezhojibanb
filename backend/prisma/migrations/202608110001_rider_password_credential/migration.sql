CREATE TABLE "rider_app_password_credentials" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "normalizedUsername" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "lastLoginAt" TIMESTAMP(3),
  "lastLoginIp" TEXT,
  "lastLoginDevice" JSONB,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_app_password_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_app_password_credentials_normalizedUsername_key"
  ON "rider_app_password_credentials"("normalizedUsername");
CREATE UNIQUE INDEX "rider_app_password_credentials_userId_key"
  ON "rider_app_password_credentials"("userId");

ALTER TABLE "rider_app_password_credentials"
  ADD CONSTRAINT "rider_app_password_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
