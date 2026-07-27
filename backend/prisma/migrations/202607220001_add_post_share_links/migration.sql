DO $$ BEGIN
  CREATE TYPE "PostShareLinkStatus" AS ENUM ('ACTIVE', 'CLAIMED', 'INVALID', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "post_share_links" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "sharerId" TEXT NOT NULL,
  "claimUserId" TEXT,
  "regionId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'wx_friend',
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "qrcodeUrl" TEXT,
  "status" "PostShareLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "openedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_share_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "post_share_visits" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_share_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_share_links_code_key" ON "post_share_links"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "post_share_links_claimUserId_key" ON "post_share_links"("claimUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "post_share_visits_linkId_visitorId_key" ON "post_share_visits"("linkId", "visitorId");
CREATE INDEX IF NOT EXISTS "post_share_links_postId_sharerId_templateVersion_createdAt_idx" ON "post_share_links"("postId", "sharerId", "templateVersion", "createdAt");
CREATE INDEX IF NOT EXISTS "post_share_links_regionId_createdAt_idx" ON "post_share_links"("regionId", "createdAt");
CREATE INDEX IF NOT EXISTS "post_share_visits_linkId_openedAt_idx" ON "post_share_visits"("linkId", "openedAt");

DO $$ BEGIN
  ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_sharerId_fkey" FOREIGN KEY ("sharerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_claimUserId_fkey" FOREIGN KEY ("claimUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "post_share_visits" ADD CONSTRAINT "post_share_visits_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "post_share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
