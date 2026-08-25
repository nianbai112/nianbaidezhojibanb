CREATE TABLE IF NOT EXISTS "layout_versions" (
  "id" TEXT NOT NULL,
  "pageType" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config" JSONB NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "layout_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "layout_versions_pageType_regionId_version_key"
  ON "layout_versions"("pageType", "regionId", "version");
CREATE INDEX IF NOT EXISTS "layout_versions_pageType_regionId_idx"
  ON "layout_versions"("pageType", "regionId");
