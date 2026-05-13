-- ============================================================
-- Features Full Sync Migration
-- Covers: activity_types, activity_packages, activity_rewards,
--   activity_tickets, second_hand_region_settings, net_disk_platforms,
--   net_disk_downloads, net_disk_profit_configs, photo_contests,
--   photo_contest_entries, photo_contest_votes, photo_contest_ratings,
--   photo_contest_winners, photo_contest_region_settings, rating_replies,
--   rating_region_settings, vote_restriction_logs, system_alerts
-- Plus: missing columns on existing tables
-- ============================================================

-- ============================================================
-- PART 1: New tables
-- ============================================================

-- system_alerts
CREATE TABLE IF NOT EXISTS "system_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "regionId" TEXT,
    "businessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolveNote" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "system_alerts_type_status_idx" ON "system_alerts"("type", "status");
CREATE INDEX IF NOT EXISTS "system_alerts_level_status_idx" ON "system_alerts"("level", "status");
CREATE INDEX IF NOT EXISTS "system_alerts_regionId_idx" ON "system_alerts"("regionId");

-- activity_types
CREATE TABLE IF NOT EXISTS "activity_types" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_types_regionId_sortOrder_idx" ON "activity_types"("regionId", "sortOrder");

-- activity_packages
CREATE TABLE IF NOT EXISTS "activity_packages" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "originalPrice" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "availableTickets" INTEGER NOT NULL DEFAULT 0,
    "limitPerUser" INTEGER,
    "ticketType" TEXT NOT NULL DEFAULT 'single',
    "description" TEXT,
    "genderLimit" TEXT,
    "saleStartAt" TIMESTAMP(3),
    "saleEndAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_packages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_packages_activityId_sortOrder_idx" ON "activity_packages"("activityId", "sortOrder");

-- activity_rewards
CREATE TABLE IF NOT EXISTS "activity_rewards" (
    "id" TEXT NOT NULL,
    "activityId" TEXT,
    "regionId" TEXT,
    "name" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardValue" DECIMAL(10,2),
    "titleId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_rewards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_rewards_regionId_idx" ON "activity_rewards"("regionId");

-- activity_tickets
CREATE TABLE IF NOT EXISTS "activity_tickets" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "packageId" TEXT,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "ticketStatus" TEXT NOT NULL DEFAULT 'valid',
    "checkInTime" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "activity_tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_tickets_activityId_ticketStatus_idx" ON "activity_tickets"("activityId", "ticketStatus");
CREATE INDEX IF NOT EXISTS "activity_tickets_orderId_idx" ON "activity_tickets"("orderId");

-- second_hand_region_settings
CREATE TABLE IF NOT EXISTS "second_hand_region_settings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "enableSecondHand" BOOLEAN NOT NULL DEFAULT true,
    "maxListings" INTEGER,
    "requirePhone" BOOLEAN NOT NULL DEFAULT true,
    "requireAudit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "second_hand_region_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "second_hand_region_settings_regionId_key" ON "second_hand_region_settings"("regionId");

-- net_disk_platforms
CREATE TABLE IF NOT EXISTS "net_disk_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "baseUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "net_disk_platforms_pkey" PRIMARY KEY ("id")
);

-- net_disk_downloads
CREATE TABLE IF NOT EXISTS "net_disk_downloads" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "net_disk_downloads_pkey" PRIMARY KEY ("id")
);

-- net_disk_profit_configs
CREATE TABLE IF NOT EXISTS "net_disk_profit_configs" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "platformCommission" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "regionCommission" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "authorShare" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "net_disk_profit_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "net_disk_profit_configs_regionId_key" ON "net_disk_profit_configs"("regionId");

-- photo_contests
CREATE TABLE IF NOT EXISTS "photo_contests" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover" TEXT,
    "rules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "voteEndAt" TIMESTAMP(3),
    "circleId" TEXT,
    "createdBy" TEXT,
    "maxVotesPerUser" INTEGER NOT NULL DEFAULT 3,
    "maxVotesPerDay" INTEGER,
    "maxVotesPerPhoto" INTEGER,
    "allowSelfVote" BOOLEAN NOT NULL DEFAULT false,
    "allowAnonymousVote" BOOLEAN NOT NULL DEFAULT false,
    "requireCircleMember" BOOLEAN NOT NULL DEFAULT false,
    "rewardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rewardType" TEXT,
    "rewardDetails" JSONB,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "photo_contests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "photo_contests_regionId_status_createdAt_idx" ON "photo_contests"("regionId", "status", "createdAt");

-- photo_contest_entries
CREATE TABLE IF NOT EXISTS "photo_contest_entries" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryNumber" INTEGER,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "ratingsAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "photo_contest_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "photo_contest_entries_contestId_userId_imageUrl_key" ON "photo_contest_entries"("contestId", "userId", "imageUrl");
CREATE INDEX IF NOT EXISTS "photo_contest_entries_contestId_status_voteCount_idx" ON "photo_contest_entries"("contestId", "status", "voteCount");
CREATE INDEX IF NOT EXISTS "photo_contest_entries_userId_createdAt_idx" ON "photo_contest_entries"("userId", "createdAt");

-- photo_contest_votes
CREATE TABLE IF NOT EXISTS "photo_contest_votes" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "photo_contest_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "photo_contest_votes_entryId_userId_key" ON "photo_contest_votes"("entryId", "userId");
CREATE INDEX IF NOT EXISTS "photo_contest_votes_competitionId_userId_createdAt_idx" ON "photo_contest_votes"("competitionId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "photo_contest_votes_userId_createdAt_idx" ON "photo_contest_votes"("userId", "createdAt");

-- photo_contest_ratings
CREATE TABLE IF NOT EXISTS "photo_contest_ratings" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "photo_contest_ratings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "photo_contest_ratings_entryId_userId_key" ON "photo_contest_ratings"("entryId", "userId");
CREATE INDEX IF NOT EXISTS "photo_contest_ratings_entryId_createdAt_idx" ON "photo_contest_ratings"("entryId", "createdAt");

-- photo_contest_winners
CREATE TABLE IF NOT EXISTS "photo_contest_winners" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "winnerRank" INTEGER NOT NULL,
    "prizeName" TEXT,
    "prizeDescription" TEXT,
    "prizeValue" TEXT,
    "rewardStatus" TEXT NOT NULL DEFAULT 'pending',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "photo_contest_winners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "photo_contest_winners_competitionId_winnerRank_idx" ON "photo_contest_winners"("competitionId", "winnerRank");

-- photo_contest_region_settings
CREATE TABLE IF NOT EXISTS "photo_contest_region_settings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "enableContest" BOOLEAN NOT NULL DEFAULT true,
    "maxCompetitionsPerMonth" INTEGER,
    "maxPhotosPerUser" INTEGER NOT NULL DEFAULT 3,
    "requirePhotoApproval" BOOLEAN NOT NULL DEFAULT true,
    "photoAutoApproval" BOOLEAN NOT NULL DEFAULT false,
    "maxVotesPerUserDaily" INTEGER NOT NULL DEFAULT 10,
    "maxVotesPerCompetition" INTEGER,
    "maxVotesPerPhoto" INTEGER NOT NULL DEFAULT 1,
    "allowSelfVoting" BOOLEAN NOT NULL DEFAULT false,
    "votingIntervalHours" INTEGER,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "watermarkText" TEXT,
    "watermarkPosition" TEXT,
    "enableRating" BOOLEAN NOT NULL DEFAULT true,
    "enableCommenting" BOOLEAN NOT NULL DEFAULT true,
    "adminNotificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "photo_contest_region_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "photo_contest_region_settings_regionId_key" ON "photo_contest_region_settings"("regionId");

-- rating_replies
CREATE TABLE IF NOT EXISTS "rating_replies" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rating_replies_pkey" PRIMARY KEY ("id")
);

-- rating_region_settings
CREATE TABLE IF NOT EXISTS "rating_region_settings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "enableRating" BOOLEAN NOT NULL DEFAULT true,
    "enableDynamic" BOOLEAN NOT NULL DEFAULT true,
    "requireLoginToRate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rating_region_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rating_region_settings_regionId_key" ON "rating_region_settings"("regionId");

-- vote_restriction_logs
CREATE TABLE IF NOT EXISTS "vote_restriction_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "voteDate" TEXT NOT NULL,
    "votesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastVoteTime" TIMESTAMP(3),
    CONSTRAINT "vote_restriction_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vote_restriction_logs_userId_competitionId_voteDate_key" ON "vote_restriction_logs"("userId", "competitionId", "voteDate");

-- ============================================================
-- PART 2: Add missing columns to existing tables
-- ============================================================

-- activities: add typeId, clubId, lat, lng, signStartAt, signEndAt, fee, refundPolicy, visibility, sortOrder
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "typeId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "clubId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "lat" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "lng" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "signStartAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "signEndAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "fee" DECIMAL(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "refundPolicy" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- activity_clubs: add logo, background, location, lat, lng, phone, adminUserId, isOfficial, sortOrder
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "logo" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "background" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "location" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "lat" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "lng" DOUBLE PRECISION; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "phone" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "adminUserId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "isOfficial" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_clubs" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- activity_orders: add packageId, quantity, payStatus, orderStatus, refundStatus, refundReason, refundAmount
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "packageId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "payStatus" TEXT NOT NULL DEFAULT 'unpaid'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "orderStatus" TEXT NOT NULL DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "refundStatus" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "refundReason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD COLUMN "refundAmount" DECIMAL(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- net_disk_resources: add platformId, cover, extractCode, price, status
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD COLUMN "platformId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD COLUMN "cover" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD COLUMN "extractCode" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD COLUMN "price" DECIMAL(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- net_disk_comments: add status
DO $$ BEGIN ALTER TABLE "net_disk_comments" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- dating_configs: add dailyMatchLimit, requireAudit, matchRules, updatedAt
DO $$ BEGIN ALTER TABLE "dating_configs" ADD COLUMN "dailyMatchLimit" INTEGER NOT NULL DEFAULT 10; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_configs" ADD COLUMN "requireAudit" BOOLEAN NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_configs" ADD COLUMN "matchRules" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_configs" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- dating_profiles: add auditStatus, auditRemark
DO $$ BEGIN ALTER TABLE "dating_profiles" ADD COLUMN "auditStatus" TEXT NOT NULL DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_profiles" ADD COLUMN "auditRemark" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- dating_packages: add regionId, validDays, description, rights, updatedAt
DO $$ BEGIN ALTER TABLE "dating_packages" ADD COLUMN "regionId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_packages" ADD COLUMN "validDays" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_packages" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_packages" ADD COLUMN "rights" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_packages" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- dating_orders: add refundReason, refundTime, updatedAt
DO $$ BEGIN ALTER TABLE "dating_orders" ADD COLUMN "refundReason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_orders" ADD COLUMN "refundTime" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_orders" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- user_ratings: add regionId, status, updatedAt
DO $$ BEGIN ALTER TABLE "user_ratings" ADD COLUMN "regionId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_ratings" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_ratings" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- rating_categories: add updatedAt
DO $$ BEGIN ALTER TABLE "rating_categories" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- rating_items: add updatedAt
DO $$ BEGIN ALTER TABLE "rating_items" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- second_hands: add originPrice, condition, viewCount
DO $$ BEGIN ALTER TABLE "second_hands" ADD COLUMN "originPrice" DECIMAL(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "second_hands" ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'new'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "second_hands" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- PART 3: Foreign keys for new tables
-- ============================================================

DO $$ BEGIN ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_packages" ADD CONSTRAINT "activity_packages_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_rewards" ADD CONSTRAINT "activity_rewards_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_tickets" ADD CONSTRAINT "activity_tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "activity_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "second_hand_region_settings" ADD CONSTRAINT "second_hand_region_settings_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_downloads" ADD CONSTRAINT "net_disk_downloads_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "net_disk_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_downloads" ADD CONSTRAINT "net_disk_downloads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_entries" ADD CONSTRAINT "photo_contest_entries_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "photo_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_entries" ADD CONSTRAINT "photo_contest_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_votes" ADD CONSTRAINT "photo_contest_votes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "photo_contest_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_votes" ADD CONSTRAINT "photo_contest_votes_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "photo_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_ratings" ADD CONSTRAINT "photo_contest_ratings_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "photo_contest_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_ratings" ADD CONSTRAINT "photo_contest_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_winners" ADD CONSTRAINT "photo_contest_winners_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "photo_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "photo_contest_winners" ADD CONSTRAINT "photo_contest_winners_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "photo_contest_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "rating_replies" ADD CONSTRAINT "rating_replies_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "user_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "rating_replies" ADD CONSTRAINT "rating_replies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "vote_restriction_logs" ADD CONSTRAINT "vote_restriction_logs_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "photo_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD CONSTRAINT "activities_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "activity_types"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activities" ADD CONSTRAINT "activities_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "activity_clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_orders" ADD CONSTRAINT "activity_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "activity_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "net_disk_resources" ADD CONSTRAINT "net_disk_resources_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "net_disk_platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "dating_packages" ADD CONSTRAINT "dating_packages_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for existing tables with new columns
CREATE INDEX IF NOT EXISTS "activity_orders_activityId_orderStatus_idx" ON "activity_orders"("activityId", "orderStatus");
CREATE INDEX IF NOT EXISTS "activity_orders_userId_createdAt_idx" ON "activity_orders"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "second_hands_regionId_status_idx" ON "second_hands"("regionId", "status");
CREATE INDEX IF NOT EXISTS "second_hands_userId_createdAt_idx" ON "second_hands"("userId", "createdAt");
