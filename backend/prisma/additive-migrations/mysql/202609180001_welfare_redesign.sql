-- Additive upgrade for the scheduled welfare draw. Keep legacy columns for
-- rollback compatibility; the current Prisma model simply stops reading them.
ALTER TABLE `welfare_campaigns`
  ADD COLUMN `requireGroup` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `groupIds` JSON NULL,
  ADD COLUMN `joinImage` TEXT NULL,
  ADD COLUMN `joinGuide` TEXT NULL,
  ADD COLUMN `claimMethod` VARCHAR(32) NOT NULL DEFAULT 'pickup',
  ADD COLUMN `requireOfficial` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `welfare_campaigns`
  MODIFY COLUMN `requireStudent` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `welfare_entries`
  ADD COLUMN `recipientName` VARCHAR(191) NULL,
  ADD COLUMN `recipientPhone` VARCHAR(191) NULL,
  ADD COLUMN `recipientAddress` TEXT NULL,
  ADD COLUMN `addressSubmittedAt` DATETIME(3) NULL,
  ADD COLUMN `shippingCarrier` VARCHAR(191) NULL,
  ADD COLUMN `trackingNumber` VARCHAR(191) NULL,
  ADD COLUMN `shippedAt` DATETIME(3) NULL,
  ADD COLUMN `groupVerifiedAt` DATETIME(3) NULL;
