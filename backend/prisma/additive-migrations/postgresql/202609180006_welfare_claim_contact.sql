ALTER TABLE "welfare_campaigns"
  ADD COLUMN IF NOT EXISTS "claimContactImage" TEXT,
  ADD COLUMN IF NOT EXISTS "claimInstructions" TEXT;
