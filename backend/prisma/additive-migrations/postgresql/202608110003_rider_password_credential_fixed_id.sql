WITH "keeper" AS (
  SELECT "id"
  FROM "rider_app_password_credentials"
  ORDER BY
    ("id" = 'rider-password-login') DESC,
    "updatedAt" DESC,
    "createdAt" DESC,
    "id" ASC
  LIMIT 1
)
DELETE FROM "rider_app_password_credentials"
WHERE "id" <> (SELECT "id" FROM "keeper");

UPDATE "rider_app_password_credentials"
SET "id" = 'rider-password-login'
WHERE "id" <> 'rider-password-login';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rider_app_password_credentials_fixed_id_check'
      AND conrelid = 'rider_app_password_credentials'::regclass
  ) THEN
    ALTER TABLE "rider_app_password_credentials"
      ADD CONSTRAINT "rider_app_password_credentials_fixed_id_check"
      CHECK ("id" = 'rider-password-login');
  END IF;
END $$;
