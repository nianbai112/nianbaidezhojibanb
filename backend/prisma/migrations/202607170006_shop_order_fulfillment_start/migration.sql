ALTER TABLE "orders" ADD COLUMN "fulfillment_start_time" TIMESTAMP(3);

UPDATE "orders" AS o
SET "fulfillment_start_time" = o."scheduled_delivery_time" - (
  CASE WHEN o."business_type" = 'dorm_shop' THEN 15 ELSE 30 END * INTERVAL '1 minute'
)
WHERE o."scheduled_delivery_time" IS NOT NULL;

CREATE INDEX "orders_fulfillment_start_time_status_idx"
ON "orders"("fulfillment_start_time", "status");
