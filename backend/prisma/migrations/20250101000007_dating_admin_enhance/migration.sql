-- AlterTable: dating_configs
ALTER TABLE "dating_configs"
  ADD COLUMN "dailyMatchLimit" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "requireAudit" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "matchRules" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: dating_profiles
ALTER TABLE "dating_profiles"
  ADD COLUMN "auditStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "auditRemark" TEXT;

-- AlterTable: dating_packages
ALTER TABLE "dating_packages"
  ALTER COLUMN "regionId" DROP NOT NULL,
  ADD COLUMN "validDays" INTEGER,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "rights" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: dating_orders
ALTER TABLE "dating_orders"
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundTime" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "dating_orders" ADD CONSTRAINT "dating_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "dating_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dating_packages" ADD CONSTRAINT "dating_packages_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: dating_reports
CREATE TABLE "dating_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "images" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "handlerId" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dating_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dating_reports_status_idx" ON "dating_reports"("status");

-- AddForeignKey
ALTER TABLE "dating_reports" ADD CONSTRAINT "dating_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dating_reports" ADD CONSTRAINT "dating_reports_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
