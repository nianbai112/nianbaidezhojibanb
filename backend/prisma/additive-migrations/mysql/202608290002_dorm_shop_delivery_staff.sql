ALTER TABLE `merchants`
  ADD COLUMN IF NOT EXISTS `auto_dispatch_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `auto_dispatch_minutes` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS `staff_accept_seconds` INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS `staff_max_active_orders` INTEGER NOT NULL DEFAULT 2;

ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `delivery_receipt_code` VARCHAR(6) NULL,
  ADD COLUMN IF NOT EXISTS `delivery_code_attempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `delivery_code_locked_at` DATETIME(3) NULL;

CREATE TABLE IF NOT EXISTS `merchant_staffs` (
  `id` VARCHAR(191) NOT NULL,
  `merchant_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `invited_by_id` VARCHAR(191) NULL,
  `invited_phone` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL DEFAULT 'delivery_staff',
  `status` VARCHAR(191) NOT NULL DEFAULT 'invited',
  `on_duty` BOOLEAN NOT NULL DEFAULT false,
  `invited_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `invite_expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `disabled_at` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `merchant_staffs_merchant_id_user_id_key` (`merchant_id`, `user_id`),
  INDEX `merchant_staffs_user_id_status_idx` (`user_id`, `status`),
  INDEX `merchant_staffs_merchant_id_status_on_duty_idx` (`merchant_id`, `status`, `on_duty`),
  CONSTRAINT `merchant_staffs_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `merchant_staffs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `merchant_staffs_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shop_delivery_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `merchant_id` VARCHAR(191) NOT NULL,
  `staff_id` VARCHAR(191) NULL,
  `assignee_user_id` VARCHAR(191) NOT NULL,
  `assignee_type` VARCHAR(191) NOT NULL DEFAULT 'staff',
  `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending_accept',
  `attempt_no` INTEGER NOT NULL DEFAULT 1,
  `accept_deadline` DATETIME(3) NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `accepted_at` DATETIME(3) NULL,
  `picked_up_at` DATETIME(3) NULL,
  `delivered_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `cancel_reason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `shop_delivery_assignments_order_id_key` (`order_id`),
  INDEX `shop_delivery_assignments_merchant_id_status_assigned_at_idx` (`merchant_id`, `status`, `assigned_at`),
  INDEX `shop_delivery_assignments_assignee_user_id_status_assigned_at_idx` (`assignee_user_id`, `status`, `assigned_at`),
  INDEX `shop_delivery_assignments_staff_id_status_idx` (`staff_id`, `status`),
  CONSTRAINT `shop_delivery_assignments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `shop_delivery_assignments_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `shop_delivery_assignments_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `merchant_staffs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `shop_delivery_assignments_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
