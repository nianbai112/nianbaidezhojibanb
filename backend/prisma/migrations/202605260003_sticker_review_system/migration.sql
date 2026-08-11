ALTER TABLE "sticker_categories"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "stickers"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "auditReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "stickers"
SET "source" = CASE WHEN "userId" IS NULL THEN 'system' ELSE 'user' END,
    "isOfficial" = CASE WHEN "userId" IS NULL THEN true ELSE false END
WHERE "source" IS NULL OR "source" = '';

CREATE INDEX IF NOT EXISTS "stickers_status_createdAt_idx" ON "stickers"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "stickers_isOfficial_status_idx" ON "stickers"("isOfficial", "status");
CREATE INDEX IF NOT EXISTS "stickers_isShared_status_idx" ON "stickers"("isShared", "status");
CREATE INDEX IF NOT EXISTS "stickers_userId_status_idx" ON "stickers"("userId", "status");
CREATE INDEX IF NOT EXISTS "stickers_categoryId_status_idx" ON "stickers"("categoryId", "status");
