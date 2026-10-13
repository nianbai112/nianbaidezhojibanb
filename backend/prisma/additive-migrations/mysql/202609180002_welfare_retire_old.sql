-- The production welfare tables are empty at this release. Keep legacy
-- columns/tables for rollback compatibility and add the new one-entry rule.
ALTER TABLE `welfare_entries`
  ADD UNIQUE INDEX `welfare_entries_campaignId_userId_key` (`campaignId`, `userId`);
