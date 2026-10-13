-- Optional visible-post eligibility; existing campaigns remain unrestricted. Idempotent.
ALTER TABLE "welfare_campaigns" ADD COLUMN IF NOT EXISTS "requirePost" BOOLEAN NOT NULL DEFAULT false;
