ALTER TABLE "second_hands" ADD COLUMN "clientRequestId" TEXT, ADD COLUMN "clientPayloadHash" TEXT;
CREATE UNIQUE INDEX "second_hands_userId_clientRequestId_key" ON "second_hands"("userId", "clientRequestId");
