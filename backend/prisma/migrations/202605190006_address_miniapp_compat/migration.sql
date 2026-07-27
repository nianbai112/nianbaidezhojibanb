ALTER TABLE "addresses" ADD COLUMN "gender" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "addresses" ADD COLUMN "full_address" TEXT;
ALTER TABLE "addresses" ADD COLUMN "dormitory_number" TEXT;
ALTER TABLE "addresses" ADD COLUMN "specified_address_id" TEXT;
CREATE INDEX "addresses_regionId_idx" ON "addresses"("regionId");
CREATE INDEX "addresses_specified_address_id_idx" ON "addresses"("specified_address_id");
