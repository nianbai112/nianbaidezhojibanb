CREATE TABLE IF NOT EXISTS "rider_location_tracks" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "orderId" TEXT,
  "orderType" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION,
  "speed" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rider_location_tracks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rider_location_tracks_riderId_clientId_key"
  ON "rider_location_tracks"("riderId", "clientId");
CREATE INDEX IF NOT EXISTS "rider_location_tracks_riderId_recordedAt_idx"
  ON "rider_location_tracks"("riderId", "recordedAt");
CREATE INDEX IF NOT EXISTS "rider_location_tracks_orderId_orderType_recordedAt_idx"
  ON "rider_location_tracks"("orderId", "orderType", "recordedAt");
