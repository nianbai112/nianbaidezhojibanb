-- 订单群播报：校区绑定的微信群与每条群消息记录。
CREATE TABLE IF NOT EXISTS "wechat_order_broadcast_groups" (
    "regionId" TEXT NOT NULL,
    "groupWxid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_order_broadcast_groups_pkey" PRIMARY KEY ("regionId")
);

CREATE TABLE IF NOT EXISTS "wechat_order_broadcasts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "groupWxid" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "text" TEXT,
    "remoteId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_order_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wechat_order_broadcasts_orderId_round_kind_key" ON "wechat_order_broadcasts"("orderId", "round", "kind");
CREATE INDEX IF NOT EXISTS "wechat_order_broadcasts_status_notBefore_idx" ON "wechat_order_broadcasts"("status", "notBefore");
CREATE INDEX IF NOT EXISTS "wechat_order_broadcasts_kind_closedAt_createdAt_idx" ON "wechat_order_broadcasts"("kind", "closedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "wechat_order_broadcasts_groupWxid_updatedAt_idx" ON "wechat_order_broadcasts"("groupWxid", "updatedAt");
CREATE INDEX IF NOT EXISTS "wechat_order_broadcasts_createdAt_idx" ON "wechat_order_broadcasts"("createdAt");

INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wb_ddf4c287682cac1709a4f9f6','wechat:broadcast:view','查看订单群播报','wechat','broadcast_view') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wb_09ca37cf56e298f95d4d7826','wechat:broadcast:edit','管理订单群播报','wechat','broadcast_edit') ON CONFLICT ("code") DO NOTHING;
