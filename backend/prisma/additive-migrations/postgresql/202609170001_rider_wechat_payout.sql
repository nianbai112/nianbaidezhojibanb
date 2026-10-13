-- CreateTable
CREATE TABLE "rider_wechat_authorizations" (
    "userId" TEXT NOT NULL,
    "outAuthorizationNo" TEXT NOT NULL,
    "authorizationId" TEXT,
    "appid" TEXT NOT NULL,
    "mchid" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'WAIT_USER_CONFIRM',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "packageInfo" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_wechat_authorizations_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "rider_wechat_payouts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "withdrawId" TEXT,
    "amountFen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "appid" TEXT NOT NULL,
    "mchid" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "outAuthorizationNo" TEXT NOT NULL,
    "requestBody" JSONB,
    "transferNo" TEXT,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstSentAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_wechat_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_wechat_authorizations_outAuthorizationNo_key" ON "rider_wechat_authorizations"("outAuthorizationNo");

-- CreateIndex
CREATE UNIQUE INDEX "rider_wx_auth_recipient_key" ON "rider_wechat_authorizations"("mchid", "appid", "openid", "sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_wechat_payouts_orderId_key" ON "rider_wechat_payouts"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_wechat_payouts_withdrawId_key" ON "rider_wechat_payouts"("withdrawId");

-- CreateIndex
CREATE INDEX "rider_wechat_payouts_status_nextAttemptAt_idx" ON "rider_wechat_payouts"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "rider_wechat_payouts_userId_createdAt_idx" ON "rider_wechat_payouts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "rider_wechat_payouts_mchid_lastSentAt_idx" ON "rider_wechat_payouts"("mchid", "lastSentAt");

