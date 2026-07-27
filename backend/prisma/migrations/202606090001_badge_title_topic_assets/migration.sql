-- Add manageable assets for badges/titles and real circle topic headers.

CREATE TABLE "circle_topic_headers" (
  "id" TEXT NOT NULL,
  "circleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "circle_topic_headers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "circle_topic_headers_circleId_title_key"
  ON "circle_topic_headers"("circleId", "title");

CREATE INDEX "circle_topic_headers_circleId_sortOrder_idx"
  ON "circle_topic_headers"("circleId", "sortOrder");

ALTER TABLE "circle_topic_headers"
  ADD CONSTRAINT "circle_topic_headers_circleId_fkey"
  FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "circle_topic_groups"
  ADD COLUMN "headerId" TEXT;

CREATE INDEX "circle_topic_groups_headerId_sortOrder_idx"
  ON "circle_topic_groups"("headerId", "sortOrder");

ALTER TABLE "circle_topic_groups"
  ADD CONSTRAINT "circle_topic_groups_headerId_fkey"
  FOREIGN KEY ("headerId") REFERENCES "circle_topic_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "badges"
  ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "user_titles"
  ADD COLUMN "image" TEXT,
  ADD COLUMN "backgroundColor" TEXT,
  ADD COLUMN "textColor" TEXT,
  ADD COLUMN "borderColor" TEXT,
  ADD COLUMN "style" JSONB,
  ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
