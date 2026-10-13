-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "apple_authorizations" (
    "identityKey" VARCHAR(64) NOT NULL,
    "appId" VARCHAR(191) NOT NULL,
    "subject" VARCHAR(191) NOT NULL,
    "userId" TEXT,
    "state" VARCHAR(32) NOT NULL DEFAULT 'active',
    "authorizedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_authorizations_pkey" PRIMARY KEY ("identityKey")
);

-- CreateTable
CREATE TABLE "apple_oauth_tokens" (
    "id" VARCHAR(64) NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "tokenCiphertext" TEXT,
    "state" VARCHAR(24) NOT NULL DEFAULT 'active',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseId" VARCHAR(64),
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(80),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apple_server_events" (
    "id" VARCHAR(64) NOT NULL,
    "eventId" VARCHAR(191) NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apple_server_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "apple_authorizations_userId_idx" ON "apple_authorizations"("userId");

-- CreateIndex
CREATE INDEX "apple_oauth_tokens_state_nextAttemptAt_idx" ON "apple_oauth_tokens"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "apple_oauth_tokens_identityKey_idx" ON "apple_oauth_tokens"("identityKey");

-- CreateIndex
CREATE INDEX "apple_server_events_identityKey_idx" ON "apple_server_events"("identityKey");

-- AddForeignKey
ALTER TABLE "apple_authorizations" ADD CONSTRAINT "apple_authorizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apple_oauth_tokens" ADD CONSTRAINT "apple_oauth_tokens_identityKey_fkey" FOREIGN KEY ("identityKey") REFERENCES "apple_authorizations"("identityKey") ON DELETE RESTRICT ON UPDATE CASCADE;

