CREATE TABLE IF NOT EXISTS "mall_service_staffs" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT,
  "regionId" TEXT,
  "nickname" TEXT NOT NULL,
  "avatar" TEXT,
  "phone" TEXT,
  "wechat" TEXT,
  "onlineStatus" TEXT NOT NULL DEFAULT 'offline',
  "workTime" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mall_service_staffs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mall_service_staffs_merchantId_idx" ON "mall_service_staffs"("merchantId");
CREATE INDEX IF NOT EXISTS "mall_service_staffs_regionId_idx" ON "mall_service_staffs"("regionId");
CREATE INDEX IF NOT EXISTS "mall_service_staffs_status_idx" ON "mall_service_staffs"("status");
