DO $$ BEGIN ALTER TABLE "categories" ADD COLUMN "business_type" TEXT NOT NULL DEFAULT 'takeaway'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

UPDATE "categories"
SET "business_type" = 'takeaway'
WHERE "business_type" IS NULL OR "business_type" = '';

CREATE INDEX IF NOT EXISTS "categories_business_type_type_status_idx" ON "categories"("business_type", "type", "status");
