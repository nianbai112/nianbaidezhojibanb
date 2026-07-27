CREATE TABLE "membership_plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "price" DECIMAL(10,2) NOT NULL,
  "originalPrice" DECIMAL(10,2),
  "durationDays" INTEGER NOT NULL DEFAULT 30,
  "benefits" JSONB,
  "entitlements" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_memberships" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT,
  "planName" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiredAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'order',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payChannel" TEXT,
  "paymentNo" TEXT,
  "payTime" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "membership_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_benefit_grants" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT,
  "benefitKey" TEXT NOT NULL,
  "benefitName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "cycle" TEXT NOT NULL DEFAULT 'membership',
  "totalQuota" INTEGER NOT NULL DEFAULT 0,
  "usedQuota" INTEGER NOT NULL DEFAULT 0,
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "discountRate" DECIMAL(5,2),
  "amount" DECIMAL(10,2),
  "config" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "membership_benefit_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_benefit_usages" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantId" TEXT,
  "benefitKey" TEXT NOT NULL,
  "benefitName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "amount" DECIMAL(10,2),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "membership_benefit_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_plans_code_key" ON "membership_plans"("code");
CREATE INDEX "membership_plans_isActive_sortOrder_idx" ON "membership_plans"("isActive", "sortOrder");
CREATE INDEX "user_memberships_userId_status_expiredAt_idx" ON "user_memberships"("userId", "status", "expiredAt");
CREATE INDEX "user_memberships_expiredAt_idx" ON "user_memberships"("expiredAt");
CREATE UNIQUE INDEX "membership_orders_orderNo_key" ON "membership_orders"("orderNo");
CREATE INDEX "membership_orders_userId_status_idx" ON "membership_orders"("userId", "status");
CREATE INDEX "membership_orders_planId_idx" ON "membership_orders"("planId");
CREATE INDEX "membership_orders_createdAt_idx" ON "membership_orders"("createdAt");
CREATE INDEX "membership_benefit_grants_userId_benefitKey_status_expiredAt_idx" ON "membership_benefit_grants"("userId", "benefitKey", "status", "expiredAt");
CREATE INDEX "membership_benefit_grants_membershipId_idx" ON "membership_benefit_grants"("membershipId");
CREATE INDEX "membership_benefit_grants_benefitKey_status_idx" ON "membership_benefit_grants"("benefitKey", "status");
CREATE INDEX "membership_benefit_usages_userId_benefitKey_createdAt_idx" ON "membership_benefit_usages"("userId", "benefitKey", "createdAt");
CREATE INDEX "membership_benefit_usages_targetType_targetId_idx" ON "membership_benefit_usages"("targetType", "targetId");
CREATE INDEX "membership_benefit_usages_grantId_idx" ON "membership_benefit_usages"("grantId");

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_orders" ADD CONSTRAINT "membership_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_orders" ADD CONSTRAINT "membership_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_benefit_grants" ADD CONSTRAINT "membership_benefit_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_benefit_grants" ADD CONSTRAINT "membership_benefit_grants_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "user_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_benefit_usages" ADD CONSTRAINT "membership_benefit_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_benefit_usages" ADD CONSTRAINT "membership_benefit_usages_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "membership_benefit_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
