ALTER TABLE "welfare_entries"
  ADD COLUMN "referredByUserId" TEXT,
  ADD COLUMN "referralToken" TEXT;

CREATE INDEX "welfare_entries_campaignId_referredByUserId_idx"
  ON "welfare_entries"("campaignId", "referredByUserId");
