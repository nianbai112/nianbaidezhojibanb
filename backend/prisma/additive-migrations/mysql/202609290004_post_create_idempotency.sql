ALTER TABLE `posts` ADD COLUMN `clientRequestId` VARCHAR(191), ADD COLUMN `clientPayloadHash` VARCHAR(191);
CREATE UNIQUE INDEX `posts_userId_clientRequestId_key` ON `posts`(`userId`, `clientRequestId`);
