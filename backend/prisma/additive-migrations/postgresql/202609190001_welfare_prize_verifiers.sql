CREATE TABLE IF NOT EXISTS "welfare_prize_verifiers" (
  "id" TEXT NOT NULL,
  "prizeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "welfare_prize_verifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "welfare_prize_verifiers_prizeId_userId_key" UNIQUE ("prizeId", "userId"),
  CONSTRAINT "welfare_prize_verifiers_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "welfare_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "welfare_prize_verifiers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "welfare_prize_verifiers_userId_idx" ON "welfare_prize_verifiers"("userId");
