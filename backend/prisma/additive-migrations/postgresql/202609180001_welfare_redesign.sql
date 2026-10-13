-- New scheduled lottery fields; legacy test data is retired by the following migration.
ALTER TABLE "welfare_campaigns"
 ADD COLUMN IF NOT EXISTS "requireGroup" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "groupIds" JSONB,
 ADD COLUMN IF NOT EXISTS "joinImage" TEXT,
 ADD COLUMN IF NOT EXISTS "joinGuide" TEXT,
 ADD COLUMN IF NOT EXISTS "claimMethod" TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE "welfare_entries"
 ADD COLUMN IF NOT EXISTS "recipientName" TEXT,
 ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT,
 ADD COLUMN IF NOT EXISTS "recipientAddress" TEXT,
 ADD COLUMN IF NOT EXISTS "addressSubmittedAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "shippingCarrier" TEXT,
 ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
 ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3),
 ADD COLUMN IF NOT EXISTS "groupVerifiedAt" TIMESTAMP(3);

ALTER TABLE "welfare_campaigns" ADD COLUMN IF NOT EXISTS "requireOfficial" BOOLEAN NOT NULL DEFAULT true, ALTER COLUMN "requireStudent" SET DEFAULT true;
