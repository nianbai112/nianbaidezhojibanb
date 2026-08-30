ALTER TABLE "campus_map_projects"
  ADD COLUMN IF NOT EXISTS "regionId" TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS "mapId" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "unavailableMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "publishStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "artworkFeatureKey" TEXT,
  ADD COLUMN IF NOT EXISTS "artworkAnchorX" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "artworkAnchorY" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "artworkGeometry" JSONB,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coordinateType" TEXT NOT NULL DEFAULT 'gcj02',
  ADD COLUMN IF NOT EXISTS "coordinateStatus" TEXT NOT NULL DEFAULT 'uncollected',
  ADD COLUMN IF NOT EXISTS "coordinateSource" TEXT,
  ADD COLUMN IF NOT EXISTS "coordinateAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coordinateCollectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "addressDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "addressCandidate" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;

UPDATE "campus_map_projects"
SET "regionId" = (SELECT MIN("regionId") FROM "campus_maps" WHERE "regionId" <> 'global')
WHERE "regionId" = 'global'
  AND (SELECT COUNT(*) FROM "campus_maps" WHERE "regionId" <> 'global') = 1;

UPDATE "campus_map_projects"
SET "artworkFeatureKey" = NULL
WHERE BTRIM(COALESCE("artworkFeatureKey", '')) = '';

-- 只绑定区域内无歧义的地点。重复图形键保留 mapId=NULL，等运营人员解决冲突。
UPDATE "campus_map_projects" AS project
SET "mapId" = map."id"
FROM "campus_maps" AS map
WHERE project."mapId" IS NULL
  AND map."regionId" = project."regionId"
  AND (
    project."artworkFeatureKey" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "campus_map_projects" AS peer
      WHERE peer."regionId" = project."regionId"
        AND peer."id" <> project."id"
        AND peer."artworkFeatureKey" = project."artworkFeatureKey"
    )
  );

UPDATE "campus_map_projects"
SET "publishStatus" = 'published'
WHERE "visibilityScope" = 'phase1_active';

DROP INDEX IF EXISTS "campus_map_projects_officialNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_projects_regionId_officialNumber_key"
  ON "campus_map_projects"("regionId", "officialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_projects_mapId_artworkFeatureKey_key"
  ON "campus_map_projects"("mapId", "artworkFeatureKey");
CREATE INDEX IF NOT EXISTS "campus_map_projects_regionId_sortOrder_idx"
  ON "campus_map_projects"("regionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "campus_map_projects_mapId_publishStatus_idx"
  ON "campus_map_projects"("mapId", "publishStatus");

DO $$ BEGIN
  ALTER TABLE "campus_map_projects" ADD CONSTRAINT "campus_map_projects_mapId_fkey"
    FOREIGN KEY ("mapId") REFERENCES "campus_maps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "campus_map_place_media" (
  "id" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "collectionAttachmentId" TEXT,
  "mediaType" TEXT NOT NULL DEFAULT 'gallery',
  "sourceType" TEXT NOT NULL DEFAULT 'admin',
  "url" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "byteSize" INTEGER NOT NULL DEFAULT 0,
  "checksum" VARCHAR(64),
  "reviewStatus" TEXT NOT NULL DEFAULT 'approved',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "capturedAt" TIMESTAMP(3),
  "captureLongitude" DOUBLE PRECISION,
  "captureLatitude" DOUBLE PRECISION,
  "captureAccuracy" DOUBLE PRECISION,
  "metadata" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_place_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campus_map_place_media_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "campus_map_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_place_media_collectionAttachmentId_key" ON "campus_map_place_media"("collectionAttachmentId");
CREATE INDEX IF NOT EXISTS "campus_map_place_media_placeId_isPublic_sortOrder_idx" ON "campus_map_place_media"("placeId", "isPublic", "sortOrder");
CREATE INDEX IF NOT EXISTS "campus_map_place_media_reviewStatus_createdAt_idx" ON "campus_map_place_media"("reviewStatus", "createdAt");

INSERT INTO "campus_map_place_media" (
  "id", "placeId", "mediaType", "sourceType", "url", "reviewStatus", "isPublic", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  'legacy-photo-' || md5(project."id" || ':' || photo.url),
  project."id",
  CASE WHEN photo.ordinality = 1 THEN 'cover' ELSE 'gallery' END,
  'legacy_admin', photo.url, 'approved', true, photo.ordinality - 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "campus_map_projects" project
CROSS JOIN LATERAL jsonb_array_elements_text(project."photos") WITH ORDINALITY AS photo(url, ordinality)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "campus_map_place_entrances" (
  "id" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "coordinateType" TEXT NOT NULL DEFAULT 'gcj02',
  "accuracy" DOUBLE PRECISION,
  "addressDescription" TEXT,
  "serviceStatus" TEXT NOT NULL DEFAULT 'unknown',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sourceType" TEXT NOT NULL DEFAULT 'admin',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_place_entrances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campus_map_place_entrances_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "campus_map_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "campus_map_place_entrances_placeId_isPrimary_idx" ON "campus_map_place_entrances"("placeId", "isPrimary");

ALTER TABLE "campus_map_collection_tasks"
  ADD COLUMN IF NOT EXISTS "taskType" TEXT NOT NULL DEFAULT 'mixed';
UPDATE "campus_map_collection_tasks"
SET "taskType" = CASE
  WHEN "objectTypes" = '["road"]'::jsonb THEN 'route_collection'
  WHEN "objectTypes" = '["place_verification"]'::jsonb THEN 'place_verification'
  WHEN "objectTypes" = '["building"]'::jsonb
    AND jsonb_array_length(COALESCE("targetPlaceIds", '[]'::jsonb)) > 0 THEN 'place_verification'
  ELSE 'mixed'
END;
UPDATE "campus_map_collection_tasks"
SET "objectTypes" = '["place_verification"]'::jsonb
WHERE "objectTypes" = '["building"]'::jsonb
  AND jsonb_array_length(COALESCE("targetPlaceIds", '[]'::jsonb)) > 0;

CREATE TABLE IF NOT EXISTS "campus_map_collection_task_places" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_map_collection_task_places_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campus_map_collection_task_places_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "campus_map_collection_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "campus_map_collection_task_places_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "campus_map_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_task_places_taskId_placeId_key" ON "campus_map_collection_task_places"("taskId", "placeId");
CREATE INDEX IF NOT EXISTS "campus_map_collection_task_places_placeId_createdAt_idx" ON "campus_map_collection_task_places"("placeId", "createdAt");

INSERT INTO "campus_map_collection_task_places" ("id", "taskId", "placeId", "sortOrder", "createdAt")
SELECT 'task-place-' || md5(task."id" || ':' || place."id"), task."id", place."id", target.ordinality - 1, CURRENT_TIMESTAMP
FROM "campus_map_collection_tasks" task
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(task."targetPlaceIds", '[]'::jsonb)) WITH ORDINALITY AS target(value, ordinality)
JOIN "campus_map_projects" place
  ON place."regionId" = task."regionId" AND place."id" = target.value
ON CONFLICT ("taskId", "placeId") DO NOTHING;

-- 历史图形 ID 只在同区域 artworkFeatureKey 唯一，且不与稳定地点 ID 冲突时才回填。
WITH unique_feature_places AS (
  SELECT "regionId", "artworkFeatureKey", MIN("id") AS "placeId"
  FROM "campus_map_projects"
  WHERE "artworkFeatureKey" IS NOT NULL
  GROUP BY "regionId", "artworkFeatureKey"
  HAVING COUNT(*) = 1
)
INSERT INTO "campus_map_collection_task_places" ("id", "taskId", "placeId", "sortOrder", "createdAt")
SELECT 'task-place-' || md5(task."id" || ':' || place."placeId"), task."id", place."placeId", target.ordinality - 1, CURRENT_TIMESTAMP
FROM "campus_map_collection_tasks" task
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(task."targetPlaceIds", '[]'::jsonb)) WITH ORDINALITY AS target(value, ordinality)
JOIN unique_feature_places place
  ON place."regionId" = task."regionId" AND place."artworkFeatureKey" = target.value
WHERE NOT EXISTS (
  SELECT 1 FROM "campus_map_projects" exact_place
  WHERE exact_place."regionId" = task."regionId" AND exact_place."id" = target.value
)
ON CONFLICT ("taskId", "placeId") DO NOTHING;

ALTER TABLE "campus_map_collection_objects"
  ADD COLUMN IF NOT EXISTS "appliedToDraftAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "appliedDraftId" TEXT,
  ADD COLUMN IF NOT EXISTS "appliedDraftRevision" INTEGER,
  ADD COLUMN IF NOT EXISTS "applyFingerprint" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "applyResult" JSONB;
