CREATE TABLE IF NOT EXISTS "campus_map_collection_tasks" (
  "id" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "instructions" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "accessCodeHash" VARCHAR(64),
  "accessCodeExpiresAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_collection_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_assignments" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_collection_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_marker_templates" (
  "id" TEXT NOT NULL,
  "regionId" TEXT,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "color" TEXT,
  "behavior" TEXT NOT NULL DEFAULT 'info',
  "fieldSchema" JSONB NOT NULL,
  "allowedBindings" JSONB NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
  "requireNote" BOOLEAN NOT NULL DEFAULT false,
  "requireStationarySample" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_marker_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_sessions" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "collectorUserId" TEXT NOT NULL,
  "clientSessionId" TEXT NOT NULL,
  "coordinateType" TEXT NOT NULL DEFAULT 'gcj02',
  "device" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recording',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "pointCount" INTEGER NOT NULL DEFAULT 0,
  "markerCount" INTEGER NOT NULL DEFAULT 0,
  "lastBatchNo" INTEGER NOT NULL DEFAULT -1,
  "uploadComplete" BOOLEAN NOT NULL DEFAULT false,
  "quality" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_collection_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_points" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientPointId" TEXT NOT NULL,
  "batchNo" INTEGER NOT NULL,
  "pointSeq" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION NOT NULL,
  "speed" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "altitude" DOUBLE PRECISION,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_map_collection_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_markers" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "clientMarkerId" TEXT NOT NULL,
  "templateLabelSnapshot" TEXT NOT NULL,
  "templateIconSnapshot" TEXT,
  "templateColorSnapshot" TEXT,
  "behaviorSnapshot" TEXT NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "fieldValues" JSONB NOT NULL,
  "note" TEXT,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_map_collection_markers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_marker_bindings" (
  "id" TEXT NOT NULL,
  "markerId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_map_collection_marker_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campus_map_collection_attachments" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "markerId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'photo',
  "url" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "byteSize" INTEGER NOT NULL DEFAULT 0,
  "checksum" VARCHAR(64),
  "metadata" JSONB,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_map_collection_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "campus_map_collection_tasks_regionId_status_updatedAt_idx" ON "campus_map_collection_tasks"("regionId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_assignments_userId_createdAt_idx" ON "campus_map_collection_assignments"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_assignments_taskId_userId_key" ON "campus_map_collection_assignments"("taskId", "userId");
CREATE INDEX IF NOT EXISTS "campus_map_marker_templates_regionId_enabled_sortOrder_idx" ON "campus_map_marker_templates"("regionId", "enabled", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_sessions_clientSessionId_key" ON "campus_map_collection_sessions"("clientSessionId");
CREATE INDEX IF NOT EXISTS "campus_map_collection_sessions_taskId_status_startedAt_idx" ON "campus_map_collection_sessions"("taskId", "status", "startedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_sessions_collectorUserId_startedAt_idx" ON "campus_map_collection_sessions"("collectorUserId", "startedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_points_sessionId_recordedAt_idx" ON "campus_map_collection_points"("sessionId", "recordedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_points_sessionId_clientPointId_key" ON "campus_map_collection_points"("sessionId", "clientPointId");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_points_sessionId_batchNo_pointSeq_key" ON "campus_map_collection_points"("sessionId", "batchNo", "pointSeq");
CREATE INDEX IF NOT EXISTS "campus_map_collection_markers_templateId_reviewStatus_idx" ON "campus_map_collection_markers"("templateId", "reviewStatus");
CREATE INDEX IF NOT EXISTS "campus_map_collection_markers_sessionId_recordedAt_idx" ON "campus_map_collection_markers"("sessionId", "recordedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_markers_sessionId_clientMarkerId_key" ON "campus_map_collection_markers"("sessionId", "clientMarkerId");
CREATE INDEX IF NOT EXISTS "campus_map_collection_marker_bindings_targetType_targetId_s_idx" ON "campus_map_collection_marker_bindings"("targetType", "targetId", "state");
CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_marker_bindings_markerId_targetType_t_key" ON "campus_map_collection_marker_bindings"("markerId", "targetType", "targetId", "relationType");
CREATE INDEX IF NOT EXISTS "campus_map_collection_attachments_sessionId_uploadedAt_idx" ON "campus_map_collection_attachments"("sessionId", "uploadedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_attachments_markerId_uploadedAt_idx" ON "campus_map_collection_attachments"("markerId", "uploadedAt");
CREATE INDEX IF NOT EXISTS "campus_map_collection_attachments_checksum_idx" ON "campus_map_collection_attachments"("checksum");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_assignments_taskId_fkey') THEN
    ALTER TABLE "campus_map_collection_assignments" ADD CONSTRAINT "campus_map_collection_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "campus_map_collection_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_sessions_taskId_fkey') THEN
    ALTER TABLE "campus_map_collection_sessions" ADD CONSTRAINT "campus_map_collection_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "campus_map_collection_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_points_sessionId_fkey') THEN
    ALTER TABLE "campus_map_collection_points" ADD CONSTRAINT "campus_map_collection_points_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "campus_map_collection_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_markers_sessionId_fkey') THEN
    ALTER TABLE "campus_map_collection_markers" ADD CONSTRAINT "campus_map_collection_markers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "campus_map_collection_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_markers_templateId_fkey') THEN
    ALTER TABLE "campus_map_collection_markers" ADD CONSTRAINT "campus_map_collection_markers_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "campus_map_marker_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_marker_bindings_markerId_fkey') THEN
    ALTER TABLE "campus_map_collection_marker_bindings" ADD CONSTRAINT "campus_map_collection_marker_bindings_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "campus_map_collection_markers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_attachments_sessionId_fkey') THEN
    ALTER TABLE "campus_map_collection_attachments" ADD CONSTRAINT "campus_map_collection_attachments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "campus_map_collection_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campus_map_collection_attachments_markerId_fkey') THEN
    ALTER TABLE "campus_map_collection_attachments" ADD CONSTRAINT "campus_map_collection_attachments_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "campus_map_collection_markers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
