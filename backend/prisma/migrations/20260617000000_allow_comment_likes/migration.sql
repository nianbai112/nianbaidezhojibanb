-- Allow the shared likes table to store both post and comment likes.
ALTER TABLE "likes" DROP CONSTRAINT IF EXISTS "like_post_fk";
