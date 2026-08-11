ALTER TABLE "rich_text_contents"
ADD COLUMN IF NOT EXISTS "version" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS "scene" TEXT,
ADD COLUMN IF NOT EXISTS "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "user_agreement_consents" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT,
  "code" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "regionId" TEXT NOT NULL DEFAULT 'global',
  "scene" TEXT,
  "source" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_agreement_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_agreement_consents_userId_code_version_regionId_key"
ON "user_agreement_consents"("userId", "code", "version", "regionId");

CREATE INDEX IF NOT EXISTS "user_agreement_consents_userId_acceptedAt_idx"
ON "user_agreement_consents"("userId", "acceptedAt");

CREATE INDEX IF NOT EXISTS "user_agreement_consents_code_version_regionId_idx"
ON "user_agreement_consents"("code", "version", "regionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_agreement_consents_userId_fkey'
  ) THEN
    ALTER TABLE "user_agreement_consents"
    ADD CONSTRAINT "user_agreement_consents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_agreement_consents_documentId_fkey'
  ) THEN
    ALTER TABLE "user_agreement_consents"
    ADD CONSTRAINT "user_agreement_consents_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "rich_text_contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
