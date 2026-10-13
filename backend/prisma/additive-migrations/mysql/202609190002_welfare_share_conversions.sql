ALTER TABLE `welfare_entries`
  ADD COLUMN `referredByUserId` VARCHAR(191) NULL,
  ADD COLUMN `referralToken` VARCHAR(191) NULL;

CREATE INDEX `welfare_entries_campaignId_referredByUserId_idx`
  ON `welfare_entries`(`campaignId`, `referredByUserId`);
