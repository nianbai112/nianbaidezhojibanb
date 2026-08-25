-- CreateTable
CREATE TABLE "layout_versions" (
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

-- CreateIndex
CREATE UNIQUE INDEX "layout_versions_pageType_regionId_version_key" ON "layout_versions"("pageType", "regionId", "version");

-- CreateIndex
CREATE INDEX "layout_versions_pageType_regionId_idx" ON "layout_versions"("pageType", "regionId");
