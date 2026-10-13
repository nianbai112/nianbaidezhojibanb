ALTER TABLE "welfare_entries"
  ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralToken" TEXT;

CREATE INDEX IF NOT EXISTS "welfare_entries_campaignId_referredByUserId_idx"
  ON "welfare_entries"("campaignId", "referredByUserId");
