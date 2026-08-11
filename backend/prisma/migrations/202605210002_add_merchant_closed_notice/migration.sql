DO $$ BEGIN
  ALTER TABLE "merchants" ADD COLUMN "closedNotice" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
