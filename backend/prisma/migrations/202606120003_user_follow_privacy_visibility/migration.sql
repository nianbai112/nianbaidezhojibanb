ALTER TABLE "user_settings"
  ADD COLUMN "likeListVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowSearch" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showJoinedCircles" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "followingListVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "followersListVisible" BOOLEAN NOT NULL DEFAULT true;
