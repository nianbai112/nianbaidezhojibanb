-- Allow regional finance percentage fields to store normal admin-entered values such as 15 or 30.
ALTER TABLE "regions"
  ALTER COLUMN "withdrawRate" TYPE DECIMAL(8,4),
  ALTER COLUMN "commissionRate" TYPE DECIMAL(8,4);
