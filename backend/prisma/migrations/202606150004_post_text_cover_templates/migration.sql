CREATE TABLE IF NOT EXISTS "post_text_cover_templates" (
  "id" TEXT PRIMARY KEY,
  "regionId" TEXT,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "backgroundType" TEXT NOT NULL DEFAULT 'color',
  "backgroundColor" TEXT NOT NULL DEFAULT '#F7F3EA',
  "gradientStart" TEXT,
  "gradientEnd" TEXT,
  "backgroundImage" TEXT,
  "textColor" TEXT NOT NULL DEFAULT '#222222',
  "accentColor" TEXT NOT NULL DEFAULT '#FF4D5A',
  "titleFontSize" INTEGER NOT NULL DEFAULT 30,
  "bodyFontSize" INTEGER NOT NULL DEFAULT 24,
  "maxTitleChars" INTEGER NOT NULL DEFAULT 24,
  "maxSummaryChars" INTEGER NOT NULL DEFAULT 72,
  "maxLines" INTEGER NOT NULL DEFAULT 6,
  "coverHeight" INTEGER NOT NULL DEFAULT 350,
  "showTopic" BOOLEAN NOT NULL DEFAULT true,
  "showCircle" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "post_text_cover_templates_region_enabled_priority_idx"
  ON "post_text_cover_templates" ("regionId", "enabled", "priority");
