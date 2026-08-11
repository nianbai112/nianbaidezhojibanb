-- Allow the shared reports table to store non-post targets such as second-hand
-- products. The application still keeps targetType/targetId indexes for lookup.
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "report_post_fk";
