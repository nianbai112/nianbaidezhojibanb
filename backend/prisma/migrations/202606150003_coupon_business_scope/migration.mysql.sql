ALTER TABLE `coupons` ADD COLUMN IF NOT EXISTS `businessScope` VARCHAR(191) NOT NULL DEFAULT 'all';
CREATE INDEX `coupons_businessScope_idx` ON `coupons`(`businessScope`);
