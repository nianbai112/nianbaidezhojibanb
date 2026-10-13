-- CreateTable
CREATE TABLE "wechat_moment_batches" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "source" TEXT NOT NULL DEFAULT 'cron',
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "snsId" TEXT,
    "error" TEXT,
    "response" JSONB,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_moment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_moment_items" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "posterUrl" TEXT,
    "posterWidth" INTEGER,
    "posterHeight" INTEGER,
    "posterSize" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_moment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wechat_moment_batches_status_updatedAt_idx" ON "wechat_moment_batches"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "wechat_moment_batches_createdAt_idx" ON "wechat_moment_batches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_moment_items_postId_key" ON "wechat_moment_items"("postId");

-- CreateIndex
CREATE INDEX "wechat_moment_items_batchId_idx" ON "wechat_moment_items"("batchId");

-- CreateIndex
CREATE INDEX "wechat_moment_items_status_updatedAt_idx" ON "wechat_moment_items"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "wechat_moment_items" ADD CONSTRAINT "wechat_moment_items_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_moment_items" ADD CONSTRAINT "wechat_moment_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "wechat_moment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
