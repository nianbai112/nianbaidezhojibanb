-- Mark post polls and poll records as anonymous without losing auditable userId.

ALTER TABLE "post_votes"
  ADD COLUMN IF NOT EXISTS "isAnonymousVote" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "post_vote_records"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "post_vote_records_voteId_isAnonymous_idx"
  ON "post_vote_records"("voteId", "isAnonymous");
