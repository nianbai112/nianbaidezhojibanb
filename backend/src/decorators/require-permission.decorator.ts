import { SetMetadata } from '@nestjs/common';

export const RequirePermission = (...permissions: string[]) =>
  SetMetadata('admin_permissions', permissions);

/**
 * AUD-P1-074: 检查任意一个权限即可（OR 逻辑）
 * @param permissions 权限码列表，满足任意一个即可访问
 */
export const RequirePermissionAny = (...permissions: string[]) =>
  SetMetadata('admin_permissions_any', permissions);
