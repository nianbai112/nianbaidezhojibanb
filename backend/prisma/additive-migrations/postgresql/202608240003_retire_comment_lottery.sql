-- 评论抽奖第一阶段退役：移除管理权限/菜单并停止旧中奖通知重试。
-- 历史抽奖三张物理表本阶段不删除，避免不可逆丢失既有中奖记录。

BEGIN;

UPDATE "notifications"
SET
  "hiddenAt" = COALESCE("hiddenAt", CURRENT_TIMESTAMP),
  "isRead" = TRUE,
  "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP),
  "deliveryStatus" = CASE
    WHEN LOWER("deliveryStatus") IN ('pending', 'partial') THEN 'retired'
    ELSE "deliveryStatus"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "scene" = 'comment_lottery_winner'
  AND (
    "hiddenAt" IS NULL
    OR "isRead" = FALSE
    OR "readAt" IS NULL
    OR LOWER("deliveryStatus") IN ('pending', 'partial')
  );

DELETE FROM "admin_role_permissions" AS role_permission
USING "admin_permissions" AS permission
WHERE permission."id" = role_permission."permissionId"
  AND permission."code" IN (
    'lottery:list',
    'lottery:detail',
    'lottery:draw',
    'lottery:cancel',
    'lottery:delete',
    'lottery:record:list'
  );

DELETE FROM "admin_permissions"
WHERE "code" IN (
  'lottery:list',
  'lottery:detail',
  'lottery:draw',
  'lottery:cancel',
  'lottery:delete',
  'lottery:record:list'
);

DELETE FROM "admin_role_menus" AS role_menu
USING "admin_menus" AS menu
WHERE menu."id" = role_menu."menuId"
  AND (
    menu."path" IN ('/lottery', '/lottery/list', '/content/comment-lotteries')
    OR menu."permission" IN (
      'lottery:list',
      'lottery:detail',
      'lottery:draw',
      'lottery:cancel',
      'lottery:delete',
      'lottery:record:list'
    )
  );

DELETE FROM "admin_menus"
WHERE "path" IN ('/lottery/list', '/content/comment-lotteries')
   OR "permission" IN (
     'lottery:list',
     'lottery:detail',
     'lottery:draw',
     'lottery:cancel',
     'lottery:delete',
     'lottery:record:list'
   );

DELETE FROM "admin_menus"
WHERE "path" = '/lottery';

COMMIT;
