-- Add invite state to post collaborators while treating existing rows as accepted collaborators.

DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "inviterId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'accepted'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "inviteMessage" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "acceptedAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "rejectedAt" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "operatorId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "post_collaborators" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "post_collaborators_userId_status_createdAt_idx" ON "post_collaborators"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "post_collaborators_postId_status_idx" ON "post_collaborators"("postId", "status");
