ALTER TABLE "campus_map_collection_tasks"
  ADD COLUMN "allowedClients" JSONB NOT NULL DEFAULT '["miniapp"]',
  ADD COLUMN "objectTypes" JSONB NOT NULL DEFAULT '["road","building","entrance","facility","issue"]',
  ADD COLUMN "boundary" JSONB,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "dueAt" TIMESTAMP(3);

ALTER TABLE "campus_map_collection_sessions"
  ADD COLUMN "sourceClient" TEXT NOT NULL DEFAULT 'miniapp',
  ADD COLUMN "objectCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "campus_map_collection_objects" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientObjectId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "geometry" JSONB NOT NULL,
  "properties" JSONB NOT NULL,
  "bindings" JSONB NOT NULL,
  "longitude" DOUBLE PRECISION,
  "latitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "reviewNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "quality" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_collection_objects_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "campus_map_collection_attachments" ADD COLUMN "objectId" TEXT;

CREATE UNIQUE INDEX "campus_map_collection_objects_sessionId_clientObjectId_key"
  ON "campus_map_collection_objects"("sessionId", "clientObjectId");
CREATE INDEX "campus_map_collection_objects_sessionId_objectType_recordedAt_idx"
  ON "campus_map_collection_objects"("sessionId", "objectType", "recordedAt");
CREATE INDEX "campus_map_collection_objects_reviewStatus_updatedAt_idx"
  ON "campus_map_collection_objects"("reviewStatus", "updatedAt");
CREATE INDEX "campus_map_collection_attachments_objectId_uploadedAt_idx"
  ON "campus_map_collection_attachments"("objectId", "uploadedAt");

ALTER TABLE "campus_map_collection_objects"
  ADD CONSTRAINT "campus_map_collection_objects_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "campus_map_collection_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campus_map_collection_attachments"
  ADD CONSTRAINT "campus_map_collection_attachments_objectId_fkey"
  FOREIGN KEY ("objectId") REFERENCES "campus_map_collection_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
