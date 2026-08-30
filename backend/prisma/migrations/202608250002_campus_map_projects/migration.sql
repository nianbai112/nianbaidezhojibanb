CREATE TABLE "campus_map_projects" (
  "id" TEXT NOT NULL,
  "officialNumber" INTEGER NOT NULL,
  "officialName" TEXT NOT NULL,
  "engineeringAlias" TEXT NOT NULL DEFAULT '',
  "phase" TEXT NOT NULL DEFAULT 'phase1',
  "constructionStatus" TEXT NOT NULL DEFAULT 'built',
  "visibilityScope" TEXT NOT NULL DEFAULT 'phase1_review',
  "semanticType" TEXT NOT NULL DEFAULT 'building',
  "searchable" BOOLEAN NOT NULL DEFAULT false,
  "navigable" BOOLEAN NOT NULL DEFAULT false,
  "geometryStatus" TEXT NOT NULL DEFAULT 'unmatched',
  "sourceConfidence" TEXT NOT NULL DEFAULT 'official_signage_only',
  "photos" JSONB NOT NULL,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campus_map_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campus_map_projects_officialNumber_key"
  ON "campus_map_projects"("officialNumber");
CREATE INDEX "campus_map_projects_officialNumber_idx"
  ON "campus_map_projects"("officialNumber");
CREATE INDEX "campus_map_projects_constructionStatus_visibilityScope_idx"
  ON "campus_map_projects"("constructionStatus", "visibilityScope");
