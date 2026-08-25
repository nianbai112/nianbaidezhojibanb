ALTER TABLE "campus_map_collection_tasks"
  ADD COLUMN IF NOT EXISTS "allowedClients" JSONB NOT NULL DEFAULT '["miniapp"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "objectTypes" JSONB NOT NULL DEFAULT '["road"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "boundary" JSONB,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);

ALTER TABLE "campus_map_collection_sessions"
  ADD COLUMN IF NOT EXISTS "sourceClient" TEXT NOT NULL DEFAULT 'miniapp';
