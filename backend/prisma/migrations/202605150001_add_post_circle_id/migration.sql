ALTER TABLE "posts" ADD COLUMN "circleId" TEXT;

CREATE INDEX "posts_circleId_status_createdAt_idx" ON "posts"("circleId", "status", "createdAt");

ALTER TABLE "posts" ADD CONSTRAINT "posts_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
