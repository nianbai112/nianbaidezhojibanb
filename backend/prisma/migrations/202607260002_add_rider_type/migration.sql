-- Rider app: distinguish official (App-enabled) riders from part-time riders.
-- Guarded for local databases that may have been partially updated during development.

ALTER TABLE "region_riders" ADD COLUMN IF NOT EXISTS "riderType" TEXT NOT NULL DEFAULT 'part_time';
ALTER TABLE "region_riders" ADD COLUMN IF NOT EXISTS "riderBio" TEXT;
