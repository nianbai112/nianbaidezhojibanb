-- Reconciles a legacy PostgreSQL database whose tables predate Prisma migration tracking.
-- This script is additive except for the cart uniqueness index replacement required for modifier selections.
-- It intentionally preserves historical drift-bottle tables and their data.

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "lastLoginCountry" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginProvince" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginCity" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginLocationSource" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginLocatedAt" TIMESTAMP(3);

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "interactionIntent" TEXT NOT NULL DEFAULT 'share';

ALTER TABLE "merchants"
  ADD COLUMN IF NOT EXISTS "min_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "packaging_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delivery_time_minutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "business_license_url" TEXT,
  ADD COLUMN IF NOT EXISTS "food_safety_license_url" TEXT;

ALTER TABLE "carts"
  ADD COLUMN IF NOT EXISTS "selectionKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "modifierSelections" JSONB;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "modifierSelections" JSONB;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_distance_meters" INTEGER,
  ADD COLUMN IF NOT EXISTS "packaging_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "scheduled_delivery_time" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fulfillment_start_time" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stock_reserved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "merchant_accept_time" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ready_time" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickup_time" TIMESTAMP(3);

ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "tags" JSONB,
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

ALTER TABLE "printer_configs"
  ADD COLUMN IF NOT EXISTS "connectionMode" TEXT NOT NULL DEFAULT 'merchant_owned',
  ADD COLUMN IF NOT EXISTS "credentialCiphertext" TEXT;

ALTER TABLE "merchant_settlements"
  ADD COLUMN IF NOT EXISTS "periodKey" TEXT;

ALTER TABLE "rider_settlements"
  ADD COLUMN IF NOT EXISTS "periodKey" TEXT;

ALTER TABLE "user_levels"
  ADD COLUMN IF NOT EXISTS "levelTitleId" TEXT,
  ADD COLUMN IF NOT EXISTS "contentBoostWeight" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "post_echo_interactions" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_echo_interactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_modifier_groups" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'attribute',
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'on_sale',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_modifier_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_modifier_options" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "stock" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'on_sale',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_modifier_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "order_appeals" (
  "id" TEXT NOT NULL,
  "appealNo" TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "regionId" TEXT,
  "orderSnapshot" JSONB,
  "appealType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceImages" JSONB,
  "contactPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "handlerId" TEXT,
  "latestReply" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_appeals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "order_appeal_events" (
  "id" TEXT NOT NULL,
  "appealId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "status" TEXT,
  "content" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_appeal_events_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "printerId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'feie',
  "event" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "content" TEXT NOT NULL,
  "providerJobId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "printedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

DROP INDEX IF EXISTS "carts_userId_productId_skuId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "carts_user_product_sku_selection_key"
  ON "carts" ("userId", "productId", COALESCE("skuId", ''), "selectionKey");
CREATE INDEX IF NOT EXISTS "carts_userId_productId_skuId_selectionKey_idx"
  ON "carts" ("userId", "productId", "skuId", "selectionKey");

CREATE INDEX IF NOT EXISTS "posts_regionId_interactionIntent_createdAt_idx"
  ON "posts" ("regionId", "interactionIntent", "createdAt");
CREATE INDEX IF NOT EXISTS "orders_fulfillment_start_time_status_idx"
  ON "orders" ("fulfillment_start_time", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_dedupeKey_key" ON "reviews" ("dedupeKey");
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_settlements_periodKey_key" ON "merchant_settlements" ("periodKey");
CREATE UNIQUE INDEX IF NOT EXISTS "rider_settlements_periodKey_key" ON "rider_settlements" ("periodKey");
CREATE INDEX IF NOT EXISTS "post_echo_interactions_postId_action_createdAt_idx" ON "post_echo_interactions" ("postId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "post_echo_interactions_userId_createdAt_idx" ON "post_echo_interactions" ("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "post_echo_interactions_postId_userId_action_key" ON "post_echo_interactions" ("postId", "userId", "action");
CREATE INDEX IF NOT EXISTS "product_modifier_groups_productId_status_sortOrder_idx" ON "product_modifier_groups" ("productId", "status", "sortOrder");
CREATE INDEX IF NOT EXISTS "product_modifier_options_groupId_status_sortOrder_idx" ON "product_modifier_options" ("groupId", "status", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "order_appeals_appealNo_key" ON "order_appeals" ("appealNo");
CREATE UNIQUE INDEX IF NOT EXISTS "order_appeals_orderType_orderId_key" ON "order_appeals" ("orderType", "orderId");
CREATE INDEX IF NOT EXISTS "order_appeals_userId_createdAt_idx" ON "order_appeals" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "order_appeals_regionId_status_createdAt_idx" ON "order_appeals" ("regionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "order_appeal_events_appealId_createdAt_idx" ON "order_appeal_events" ("appealId", "createdAt");
CREATE INDEX IF NOT EXISTS "online_signin_sessions_regionId_date_idx" ON "online_signin_sessions" ("regionId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "online_signin_sessions_userId_regionId_date_key" ON "online_signin_sessions" ("userId", "regionId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_dedupeKey_key" ON "print_jobs" ("dedupeKey");
CREATE INDEX IF NOT EXISTS "print_jobs_status_createdAt_idx" ON "print_jobs" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "print_jobs_orderId_createdAt_idx" ON "print_jobs" ("orderId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "post_echo_interactions" ADD CONSTRAINT "post_echo_interactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "post_echo_interactions" ADD CONSTRAINT "post_echo_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_modifier_options" ADD CONSTRAINT "product_modifier_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_appeal_events" ADD CONSTRAINT "order_appeal_events_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "order_appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
