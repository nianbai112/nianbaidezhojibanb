-- CreateTable
CREATE TABLE "welfare_prize_reserved" (
    "id" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welfare_prize_reserved_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "welfare_prize_reserved_userId_idx" ON "welfare_prize_reserved"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_prize_reserved_prizeId_userId_key" ON "welfare_prize_reserved"("prizeId", "userId");

-- AddForeignKey
ALTER TABLE "welfare_prize_reserved" ADD CONSTRAINT "welfare_prize_reserved_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "welfare_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_prize_reserved" ADD CONSTRAINT "welfare_prize_reserved_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;