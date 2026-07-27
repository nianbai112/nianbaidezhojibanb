ALTER TABLE "errand_orders"
  ALTER COLUMN "remark" TYPE TEXT;

CREATE TABLE IF NOT EXISTS "errand_order_tasks" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "taskType" TEXT NOT NULL DEFAULT 'custom_task',
  "itemSizeId" TEXT,
  "pickupPointId" TEXT,
  "expressCompany" TEXT,
  "platform" TEXT,
  "code" TEXT,
  "description" TEXT,
  "itemDescription" TEXT,
  "pickupAddress" TEXT,
  "recipientAddress" TEXT,
  "budgetAmount" DECIMAL(10,2),
  "computedFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "imageUrls" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "errand_order_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "errand_order_tasks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "errand_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "errand_order_tasks_orderId_sortOrder_idx" ON "errand_order_tasks"("orderId", "sortOrder");
CREATE INDEX IF NOT EXISTS "errand_order_tasks_taskType_idx" ON "errand_order_tasks"("taskType");
