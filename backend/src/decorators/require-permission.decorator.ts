import { SetMetadata } from '@nestjs/common';

/** 要求指定权限码，配合 AdminPermissionGuard 使用 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata('admin_permissions', permissions);
