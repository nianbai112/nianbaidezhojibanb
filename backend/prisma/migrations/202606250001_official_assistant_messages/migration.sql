CREATE TABLE "official_assistant_messages" (
  "id" TEXT NOT NULL,
  "regionId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'campus',
  "renderType" TEXT NOT NULL DEFAULT 'card',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "summary" TEXT,
  "imageUrl" TEXT,
  "iconUrl" TEXT,
  "tagText" TEXT,
  "tagType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "actions" JSONB,
  "extra" JSONB,
  "createdBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "official_assistant_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "official_assistant_messages_regionId_status_publishedAt_idx"
  ON "official_assistant_messages"("regionId", "status", "publishedAt");

CREATE INDEX "official_assistant_messages_category_status_publishedAt_idx"
  ON "official_assistant_messages"("category", "status", "publishedAt");
