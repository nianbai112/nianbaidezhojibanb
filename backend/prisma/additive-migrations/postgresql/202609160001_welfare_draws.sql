-- CreateTable
CREATE TABLE "welfare_campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "regionId" TEXT,
    "requireStudent" BOOLEAN NOT NULL DEFAULT false,
    "memberOnly" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "drawAt" TIMESTAMP(3),
    "claimUntil" TIMESTAMP(3) NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 1,
    "totalLimit" INTEGER NOT NULL DEFAULT 1,
    "maxEntries" INTEGER NOT NULL DEFAULT 10000,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "pickupLocation" TEXT,
    "contact" TEXT,
    "publishedAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welfare_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_prizes" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "kind" TEXT NOT NULL,
    "couponId" TEXT,
    "quantity" INTEGER NOT NULL,
    "probabilityBps" INTEGER NOT NULL DEFAULT 0,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "couponReserved" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "welfare_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_entries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '同学',
    "requestKey" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "dayKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'random',
    "outcome" TEXT NOT NULL DEFAULT 'waiting',
    "prizeId" TEXT,
    "claimStatus" TEXT NOT NULL DEFAULT 'none',
    "claimCode" TEXT,
    "couponReceiveId" TEXT,
    "deliveryError" TEXT,
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welfare_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_gifts" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "welfare_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welfare_draws" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "randomWinners" INTEGER NOT NULL,
    "giftedCount" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'crypto_random_int_v1',
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welfare_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "welfare_campaigns_status_mode_drawAt_idx" ON "welfare_campaigns"("status", "mode", "drawAt");

-- CreateIndex
CREATE INDEX "welfare_campaigns_regionId_status_createdAt_idx" ON "welfare_campaigns"("regionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "welfare_prizes_campaignId_idx" ON "welfare_prizes"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_entries_claimCode_key" ON "welfare_entries"("claimCode");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_entries_couponReceiveId_key" ON "welfare_entries"("couponReceiveId");

-- CreateIndex
CREATE INDEX "welfare_entries_userId_outcome_createdAt_idx" ON "welfare_entries"("userId", "outcome", "createdAt");

-- CreateIndex
CREATE INDEX "welfare_entries_campaignId_userId_dayKey_idx" ON "welfare_entries"("campaignId", "userId", "dayKey");

-- CreateIndex
CREATE INDEX "welfare_entries_outcome_claimStatus_idx" ON "welfare_entries"("outcome", "claimStatus");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_entries_campaignId_userId_requestKey_key" ON "welfare_entries"("campaignId", "userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_entries_campaignId_userId_ordinal_key" ON "welfare_entries"("campaignId", "userId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_gifts_campaignId_userId_key" ON "welfare_gifts"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_draws_campaignId_key" ON "welfare_draws"("campaignId");

-- AddForeignKey
ALTER TABLE "welfare_prizes" ADD CONSTRAINT "welfare_prizes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "welfare_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_entries" ADD CONSTRAINT "welfare_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "welfare_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_entries" ADD CONSTRAINT "welfare_entries_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "welfare_prizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_gifts" ADD CONSTRAINT "welfare_gifts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "welfare_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_gifts" ADD CONSTRAINT "welfare_gifts_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "welfare_prizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_draws" ADD CONSTRAINT "welfare_draws_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "welfare_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

