ALTER TABLE "posts" ADD COLUMN "clientRequestId" TEXT, ADD COLUMN "clientPayloadHash" TEXT;
CREATE UNIQUE INDEX "posts_userId_clientRequestId_key" ON "posts"("userId", "clientRequestId");
