-- New scheduled lottery fields; legacy test data is retired by the following migration.
ALTER TABLE "welfare_campaigns"
 ADD COLUMN "requireGroup" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "groupIds" JSONB,
 ADD COLUMN "joinImage" TEXT,
 ADD COLUMN "joinGuide" TEXT,
 ADD COLUMN "claimMethod" TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE "welfare_entries"
 ADD COLUMN "recipientName" TEXT,
 ADD COLUMN "recipientPhone" TEXT,
 ADD COLUMN "recipientAddress" TEXT,
 ADD COLUMN "addressSubmittedAt" TIMESTAMP(3),
 ADD COLUMN "shippingCarrier" TEXT,
 ADD COLUMN "trackingNumber" TEXT,
 ADD COLUMN "shippedAt" TIMESTAMP(3),
 ADD COLUMN "groupVerifiedAt" TIMESTAMP(3);

ALTER TABLE "welfare_campaigns" ADD COLUMN "requireOfficial" BOOLEAN NOT NULL DEFAULT true, ALTER COLUMN "requireStudent" SET DEFAULT true;
