ALTER TABLE "campus_map_collection_tasks"
  ADD COLUMN IF NOT EXISTS "targetPlaceIds" JSONB;
