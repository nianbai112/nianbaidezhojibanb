CREATE TABLE "user_auth_identities" (
    "id" TEXT NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "appId" VARCHAR(191) NOT NULL,
    "subject" VARCHAR(191) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_auth_identities_identityKey_key" ON "user_auth_identities"("identityKey");
CREATE INDEX "user_auth_identities_userId_idx" ON "user_auth_identities"("userId");
ALTER TABLE "user_auth_identities" ADD CONSTRAINT "user_auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
