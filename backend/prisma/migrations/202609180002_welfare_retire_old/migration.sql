-- Pre-launch refactor: the user confirmed all old lottery records are test data.
-- Only lottery test data is reset; existing accounts, other activities and issued coupons stay intact.
UPDATE coupons c SET "receivedCount" = GREATEST(0, c."receivedCount" - r.n)
FROM (SELECT "couponId", SUM("couponReserved")::integer n FROM welfare_prizes WHERE "couponId" IS NOT NULL GROUP BY "couponId") r WHERE c.id = r."couponId";
DELETE FROM notifications WHERE scene = 'welfare_draw';
DELETE FROM welfare_entries;
DELETE FROM welfare_draws;
DROP TABLE welfare_gifts;
DELETE FROM welfare_prizes;
DELETE FROM welfare_campaigns;
DROP INDEX "welfare_entries_campaignId_userId_requestKey_key";
DROP INDEX "welfare_entries_campaignId_userId_ordinal_key";
DROP INDEX "welfare_entries_campaignId_userId_dayKey_idx";
ALTER TABLE welfare_campaigns DROP COLUMN "dailyLimit", DROP COLUMN "totalLimit", ALTER COLUMN "drawAt" SET NOT NULL;
ALTER TABLE welfare_prizes DROP COLUMN "probabilityBps";
ALTER TABLE welfare_entries DROP COLUMN ordinal, DROP COLUMN "dayKey", DROP COLUMN source;
ALTER TABLE welfare_draws DROP COLUMN "giftedCount";
CREATE UNIQUE INDEX "welfare_entries_campaignId_userId_key" ON welfare_entries("campaignId", "userId");
