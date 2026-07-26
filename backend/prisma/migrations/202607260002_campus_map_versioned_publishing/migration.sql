-- Campus map publishing becomes versioned. This migration only creates new
-- structures; legacy rows in configs remain untouched for read compatibility.
CREATE TABLE "campus_maps" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "activeVersionId" TEXT,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campus_map_versions" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "featureCount" INTEGER NOT NULL,
    "layerCount" INTEGER NOT NULL,
    "rollbackOfId" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_map_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campus_map_drafts" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "basedOnVersionId" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_map_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campus_map_assets" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "draftId" TEXT,
    "versionId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "storageKey" TEXT,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "checksum" VARCHAR(64),
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_map_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campus_maps_regionId_key" ON "campus_maps"("regionId");
CREATE UNIQUE INDEX "campus_maps_activeVersionId_key" ON "campus_maps"("activeVersionId");
CREATE INDEX "campus_maps_enabled_updatedAt_idx" ON "campus_maps"("enabled", "updatedAt");
CREATE UNIQUE INDEX "campus_map_versions_mapId_version_key" ON "campus_map_versions"("mapId", "version");
CREATE INDEX "campus_map_versions_mapId_publishedAt_idx" ON "campus_map_versions"("mapId", "publishedAt");
CREATE INDEX "campus_map_versions_rollbackOfId_idx" ON "campus_map_versions"("rollbackOfId");
CREATE UNIQUE INDEX "campus_map_drafts_mapId_key" ON "campus_map_drafts"("mapId");
CREATE INDEX "campus_map_drafts_basedOnVersionId_idx" ON "campus_map_drafts"("basedOnVersionId");
CREATE INDEX "campus_map_assets_mapId_kind_idx" ON "campus_map_assets"("mapId", "kind");
CREATE INDEX "campus_map_assets_draftId_idx" ON "campus_map_assets"("draftId");
CREATE INDEX "campus_map_assets_versionId_idx" ON "campus_map_assets"("versionId");
CREATE INDEX "campus_map_assets_checksum_idx" ON "campus_map_assets"("checksum");

ALTER TABLE "campus_map_versions" ADD CONSTRAINT "campus_map_versions_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "campus_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_map_versions" ADD CONSTRAINT "campus_map_versions_rollbackOfId_fkey" FOREIGN KEY ("rollbackOfId") REFERENCES "campus_map_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campus_map_drafts" ADD CONSTRAINT "campus_map_drafts_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "campus_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_map_drafts" ADD CONSTRAINT "campus_map_drafts_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "campus_map_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campus_maps" ADD CONSTRAINT "campus_maps_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "campus_map_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campus_map_assets" ADD CONSTRAINT "campus_map_assets_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "campus_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_map_assets" ADD CONSTRAINT "campus_map_assets_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "campus_map_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_map_assets" ADD CONSTRAINT "campus_map_assets_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "campus_map_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
