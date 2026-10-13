ALTER TABLE "welfare_campaigns"
  ADD COLUMN "requireProfile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minRegistrationDays" INTEGER NOT NULL DEFAULT 0;
