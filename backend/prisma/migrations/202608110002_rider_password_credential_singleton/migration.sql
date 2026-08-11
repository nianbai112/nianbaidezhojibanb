WITH "keeper" AS (
  SELECT "id"
  FROM "rider_app_password_credentials"
  ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
  LIMIT 1
)
DELETE FROM "rider_app_password_credentials"
WHERE "id" <> (SELECT "id" FROM "keeper");

UPDATE "rider_app_password_credentials"
SET "id" = 'rider-password-login'
WHERE "id" <> 'rider-password-login';

ALTER TABLE "rider_app_password_credentials"
  ALTER COLUMN "id" SET DEFAULT 'rider-password-login';
