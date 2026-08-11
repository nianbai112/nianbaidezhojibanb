ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "messagePermission" INTEGER NOT NULL DEFAULT 1;

UPDATE "user_settings"
SET "messagePermission" = 4
WHERE "allowMessage" = false;
