ALTER TABLE `second_hands` ADD COLUMN `clientRequestId` VARCHAR(191) NULL, ADD COLUMN `clientPayloadHash` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `second_hands_userId_clientRequestId_key` ON `second_hands`(`userId`, `clientRequestId`);
