-- Add pairKey to conversations so a private conversation between two users is unique.
-- Guarded for local databases that may have been partially updated during development.

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "pairKey" TEXT;

-- Backfill pairKey for existing two-member private conversations.
-- For duplicated pairs, only the earliest conversation gets the key; later
-- duplicates keep NULL and are ignored by the new lookup path.
WITH pairs AS (
  SELECT c."id",
         c."createdAt",
         (
           SELECT string_agg(cm."userId", ':' ORDER BY cm."userId")
           FROM "conversation_members" cm
           WHERE cm."conversationId" = c."id"
         ) AS member_key,
         (
           SELECT count(*)
           FROM "conversation_members" cm
           WHERE cm."conversationId" = c."id"
         ) AS member_count
  FROM "conversations" c
  WHERE c."type" = 'private' AND c."pairKey" IS NULL
), ranked AS (
  SELECT "id",
         'private:' || member_key AS pair_key,
         row_number() OVER (PARTITION BY member_key ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM pairs
  WHERE member_key IS NOT NULL AND member_count = 2
)
UPDATE "conversations" c
SET "pairKey" = ranked.pair_key
FROM ranked
WHERE c."id" = ranked."id"
  AND ranked.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM "conversations" c2 WHERE c2."pairKey" = ranked.pair_key
  );

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_pairKey_key" ON "conversations"("pairKey");
