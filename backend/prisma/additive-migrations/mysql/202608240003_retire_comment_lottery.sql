-- 评论抽奖第一阶段退役：移除管理权限/菜单并停止旧中奖通知重试。
-- 历史抽奖三张物理表本阶段不删除，避免不可逆丢失既有中奖记录。

START TRANSACTION;

UPDATE `notifications`
SET
  `hiddenAt` = COALESCE(`hiddenAt`, CURRENT_TIMESTAMP(3)),
  `isRead` = TRUE,
  `readAt` = COALESCE(`readAt`, CURRENT_TIMESTAMP(3)),
  `deliveryStatus` = CASE
    WHEN LOWER(`deliveryStatus`) IN ('pending', 'partial') THEN 'retired'
    ELSE `deliveryStatus`
  END,
  `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `scene` = 'comment_lottery_winner'
  AND (
    `hiddenAt` IS NULL
    OR `isRead` = FALSE
    OR `readAt` IS NULL
    OR LOWER(`deliveryStatus`) IN ('pending', 'partial')
  );

DELETE role_permission
FROM `admin_role_permissions` AS role_permission
INNER JOIN `admin_permissions` AS permission
  ON permission.`id` = role_permission.`permissionId`
WHERE permission.`code` IN (
  'lottery:list',
  'lottery:detail',
  'lottery:draw',
  'lottery:cancel',
  'lottery:delete',
  'lottery:record:list'
);

DELETE FROM `admin_permissions`
WHERE `code` IN (
  'lottery:list',
  'lottery:detail',
  'lottery:draw',
  'lottery:cancel',
  'lottery:delete',
  'lottery:record:list'
);

DELETE role_menu
FROM `admin_role_menus` AS role_menu
INNER JOIN `admin_menus` AS menu
  ON menu.`id` = role_menu.`menuId`
WHERE menu.`path` IN ('/lottery', '/lottery/list', '/content/comment-lotteries')
   OR menu.`permission` IN (
     'lottery:list',
     'lottery:detail',
     'lottery:draw',
     'lottery:cancel',
     'lottery:delete',
     'lottery:record:list'
   );

DELETE FROM `admin_menus`
WHERE `path` IN ('/lottery/list', '/content/comment-lotteries')
   OR `permission` IN (
     'lottery:list',
     'lottery:detail',
     'lottery:draw',
     'lottery:cancel',
     'lottery:delete',
     'lottery:record:list'
   );

DELETE FROM `admin_menus`
WHERE `path` = '/lottery';

COMMIT;
