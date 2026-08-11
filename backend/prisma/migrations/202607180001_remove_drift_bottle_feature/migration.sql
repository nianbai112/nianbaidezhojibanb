-- Remove the retired feature from existing admin navigation and RBAC records.
-- Historical drift-bottle content tables are intentionally retained for audit/recovery.

DELETE FROM "admin_menus"
WHERE "path" IN ('/drift-bottle', '/drift-bottle/bottles');

DELETE FROM "admin_permissions"
WHERE "code" IN ('driftBottle:list', 'driftBottle:delete');
