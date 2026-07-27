ALTER TABLE "errand_orders"
  ADD COLUMN "deliveryDisplayMode" TEXT NOT NULL DEFAULT 'status_nodes';

ALTER TABLE "orders"
  ADD COLUMN "deliveryDisplayMode" TEXT NOT NULL DEFAULT 'status_nodes';

ALTER TABLE "region_riders"
  ADD COLUMN "riderType" TEXT NOT NULL DEFAULT 'part_time',
  ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "violationCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "delivery_order_nodes" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderType" TEXT NOT NULL DEFAULT 'errand',
  "nodeType" TEXT NOT NULL,
  "nodeLabel" TEXT NOT NULL,
  "operatorId" TEXT,
  "operatorType" TEXT NOT NULL DEFAULT 'rider',
  "riderType" TEXT NOT NULL DEFAULT 'part_time',
  "displayMode" TEXT NOT NULL DEFAULT 'status_nodes',
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "address" TEXT,
  "proofImages" JSONB,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_order_nodes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_order_nodes_orderId_orderType_createdAt_idx"
  ON "delivery_order_nodes"("orderId", "orderType", "createdAt");

CREATE TABLE "delivery_risk_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderType" TEXT NOT NULL DEFAULT 'errand',
  "riderId" TEXT,
  "eventType" TEXT NOT NULL,
  "eventLevel" TEXT NOT NULL DEFAULT 'warning',
  "description" TEXT,
  "handled" BOOLEAN NOT NULL DEFAULT false,
  "handledBy" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_risk_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_risk_events_orderId_orderType_createdAt_idx"
  ON "delivery_risk_events"("orderId", "orderType", "createdAt");

CREATE INDEX "delivery_risk_events_riderId_handled_idx"
  ON "delivery_risk_events"("riderId", "handled");
