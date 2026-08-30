ALTER TABLE "merchants"
  ADD COLUMN IF NOT EXISTS "auto_dispatch_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auto_dispatch_minutes" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "staff_accept_seconds" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "staff_max_active_orders" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_receipt_code" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_code_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delivery_code_locked_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "merchant_staffs" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "invited_by_id" TEXT,
  "invited_phone" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'delivery_staff',
  "status" TEXT NOT NULL DEFAULT 'invited',
  "on_duty" BOOLEAN NOT NULL DEFAULT false,
  "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invite_expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchant_staffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_staffs_merchant_id_user_id_key"
  ON "merchant_staffs"("merchant_id", "user_id");
CREATE INDEX IF NOT EXISTS "merchant_staffs_user_id_status_idx"
  ON "merchant_staffs"("user_id", "status");
CREATE INDEX IF NOT EXISTS "merchant_staffs_merchant_id_status_on_duty_idx"
  ON "merchant_staffs"("merchant_id", "status", "on_duty");

DO $$ BEGIN
  ALTER TABLE "merchant_staffs" ADD CONSTRAINT "merchant_staffs_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "merchant_staffs" ADD CONSTRAINT "merchant_staffs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "merchant_staffs" ADD CONSTRAINT "merchant_staffs_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shop_delivery_assignments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "staff_id" TEXT,
  "assignee_user_id" TEXT NOT NULL,
  "assignee_type" TEXT NOT NULL DEFAULT 'staff',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'pending_accept',
  "attempt_no" INTEGER NOT NULL DEFAULT 1,
  "accept_deadline" TIMESTAMP(3),
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "picked_up_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_delivery_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_delivery_assignments_order_id_key"
  ON "shop_delivery_assignments"("order_id");
CREATE INDEX IF NOT EXISTS "shop_delivery_assignments_merchant_id_status_assigned_at_idx"
  ON "shop_delivery_assignments"("merchant_id", "status", "assigned_at");
CREATE INDEX IF NOT EXISTS "shop_delivery_assignments_assignee_user_id_status_assigned_at_idx"
  ON "shop_delivery_assignments"("assignee_user_id", "status", "assigned_at");
CREATE INDEX IF NOT EXISTS "shop_delivery_assignments_staff_id_status_idx"
  ON "shop_delivery_assignments"("staff_id", "status");

DO $$ BEGIN
  ALTER TABLE "shop_delivery_assignments" ADD CONSTRAINT "shop_delivery_assignments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shop_delivery_assignments" ADD CONSTRAINT "shop_delivery_assignments_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shop_delivery_assignments" ADD CONSTRAINT "shop_delivery_assignments_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "merchant_staffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shop_delivery_assignments" ADD CONSTRAINT "shop_delivery_assignments_assignee_user_id_fkey"
    FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
