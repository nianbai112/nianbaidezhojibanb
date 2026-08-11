CREATE TABLE IF NOT EXISTS "upload_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileType" TEXT NOT NULL,
  "mimeType" TEXT,
  "url" TEXT NOT NULL,
  "scene" TEXT,
  "hash" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "upload_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "upload_records_userId_createdAt_idx" ON "upload_records"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "upload_records_fileType_createdAt_idx" ON "upload_records"("fileType", "createdAt");
CREATE INDEX IF NOT EXISTS "upload_records_scene_createdAt_idx" ON "upload_records"("scene", "createdAt");
