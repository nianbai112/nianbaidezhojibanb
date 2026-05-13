-- Add status column to reviews table for review visibility control
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
