-- Add region page decoration fields that exist in Prisma schema but were
-- missing from the historical region-admin migration.
ALTER TABLE "regions"
  ADD COLUMN IF NOT EXISTS "showCarousel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showAnnouncement" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showKingkong" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeFeatureStyle" TEXT DEFAULT 'default';
