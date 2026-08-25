-- Add collected map objects without changing the existing point/marker pipeline.
ALTER TABLE "campus_map_collection_sessions"
  ADD COLUMN IF NOT EXISTS "objectCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "campus_map_collection_objects" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientObjectId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "geometry" JSONB NOT NULL,
  "properties" JSONB NOT NULL,
  "longitude" DOUBLE PRECISION,
  "latitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "bindings" JSONB NOT NULL,
  "quality" JSONB,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "reviewNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_collection_objects_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "campus_map_collection_attachments"
  ADD COLUMN IF NOT EXISTS "objectId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_objects_sessionId_clientObjectId_key"
  ON "campus_map_collection_objects"("sessionId", "clientObjectId");
CREATE INDEX IF NOT EXISTS "campus_map_collection_objects_sessionId_objectType_recordedAt_idx"
  ON "campus_map_collection_objects"("sessionId", "objectType", "recordedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_objects_reviewStatus_updatedAt_idx"
  ON "campus_map_collection_objects"("reviewStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_attachments_objectId_uploadedAt_idx"
  ON "campus_map_collection_attachments"("objectId", "uploadedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_objects_sessionId_fkey') THEN
    ALTER TABLE "campus_map_collection_objects" ADD CONSTRAINT "campus_map_collection_objects_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "campus_map_collection_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_attachments_objectId_fkey') THEN
    ALTER TABLE "campus_map_collection_attachments" ADD CONSTRAINT "campus_map_collection_attachments_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "campus_map_collection_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
