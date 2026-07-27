-- Separate formal takeaway merchants from student-run dorm shops without
-- duplicating payment, refund, and rider infrastructure.

DO $$ BEGIN ALTER TABLE "merchants" ADD COLUMN "business_type" TEXT NOT NULL DEFAULT 'takeaway'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "merchants" ADD COLUMN "dorm_building" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "merchants" ADD COLUMN "dorm_room" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "merchants" ADD COLUMN "student_verified" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "orders" ADD COLUMN "business_type" TEXT NOT NULL DEFAULT 'takeaway'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "orders" ADD COLUMN "rider_id" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "orders" ADD COLUMN "accept_time" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "merchants_business_type_status_idx" ON "merchants"("business_type", "status");
CREATE INDEX IF NOT EXISTS "orders_business_type_status_idx" ON "orders"("business_type", "status");
CREATE INDEX IF NOT EXISTS "orders_rider_id_status_idx" ON "orders"("rider_id", "status");
