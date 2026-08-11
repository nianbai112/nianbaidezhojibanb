-- Add audit and display fields for comment lotteries.
ALTER TABLE "comment_lotteries"
  ADD COLUMN "drawn_at" TIMESTAMP(3),
  ADD COLUMN "participant_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "candidate_comment_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "winner_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draw_seed" TEXT;

ALTER TABLE "comment_lottery_prizes"
  ADD COLUMN "reward_text" TEXT,
  ADD COLUMN "probability_weight" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "comment_lottery_winners"
  ADD COLUMN "comment_id" TEXT;

CREATE INDEX "comment_lotteries_status_drawAt_idx" ON "comment_lotteries"("status", "drawAt");
CREATE INDEX "comment_lottery_prizes_lotteryId_sort_order_idx" ON "comment_lottery_prizes"("lotteryId", "sort_order");
CREATE INDEX "comment_lottery_winners_comment_id_idx" ON "comment_lottery_winners"("comment_id");
CREATE INDEX "comment_lottery_winners_lotteryId_prizeId_idx" ON "comment_lottery_winners"("lotteryId", "prizeId");
