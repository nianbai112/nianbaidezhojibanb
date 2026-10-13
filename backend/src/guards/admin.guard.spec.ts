import { ForbiddenException } from '@nestjs/common';
import { AdminGuard, SuperAdminGuard } from './admin.guard';

describe('SuperAdminGuard', () => {
  const context = (user: any = { sub: 'admin-1', isAdmin: true }) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('allows super administrators', async () => {
    const scope = {
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
    };
    const guard = new SuperAdminGuard(scope as any);

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('rejects non-super administrators', async () => {
    const scope = {
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false }),
    };
    const guard = new SuperAdminGuard(scope as any);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AdminGuard password reset session revocation', () => {
  it('rejects access tokens issued before an administrator password reset', async () => {
    const prisma = { adminAccount: { findUnique: jest.fn().mockResolvedValue({
      status: 'active', passwordResetRequired: false, passwordChangedAt: new Date('2026-07-28T10:00:00.000Z'),
    }) } };
    const guard = new AdminGuard({} as any, prisma as any);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({
        user: { sub: 'admin-1', isAdmin: true, iat: new Date('2026-07-28T09:00:00.000Z').getTime() / 1000 },
        method: 'GET', path: '/admin/dashboard',
      }) }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow('管理员登录状态已失效');
  });
});

describe('AdminPermissionGuard AND/OR authorization', () => {
  const { AdminPermissionGuard } = require('./admin.guard');
  function setup(and: string[] | undefined, or: string[] | undefined, permissions: string[], superAdmin = false) {
    const reflector = { getAllAndOverride: jest.fn((key) => key === 'admin_permissions' ? and : or) };
    const prisma = { adminAccount: { findUnique: jest.fn().mockResolvedValueOnce({ roles: [{ role: { code: superAdmin ? 'super_admin' : 'operator' } }] }).mockResolvedValueOnce({ roles: [{ role: { permissions: permissions.map((code) => ({ permission: { code } })) } }] }) } };
    const ctx = { getHandler: () => {}, getClass: () => {}, switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'admin1', isAdmin: true } }) }) };
    return { guard: new AdminPermissionGuard(reflector, prisma), ctx, prisma };
  }
  it('denies an OR-only endpoint to an administrator without any required permission', async () => {
    const { guard, ctx } = setup(undefined, ['content:audit', 'system:config'], []);
    await expect(guard.canActivate(ctx)).rejects.toThrow('缺少权限');
  });
  it('allows one matching OR permission', async () => {
    const { guard, ctx } = setup(undefined, ['content:audit', 'system:config'], ['system:config']);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
  it('requires both AND and OR requirements when combined', async () => {
    const denied = setup(['wechat:content:view'], ['wechat:reply:edit'], ['wechat:content:view']);
    await expect(denied.guard.canActivate(denied.ctx)).rejects.toThrow();
    const allowed = setup(['wechat:content:view'], ['wechat:reply:edit'], ['wechat:content:view', 'wechat:reply:edit']);
    await expect(allowed.guard.canActivate(allowed.ctx)).resolves.toBe(true);
  });
  it('preserves super-admin bypass and endpoints without permission declarations', async () => {
    const admin = setup(undefined, ['system:config'], [], true);
    await expect(admin.guard.canActivate(admin.ctx)).resolves.toBe(true);
    const open = setup(undefined, undefined, []);
    await expect(open.guard.canActivate(open.ctx)).resolves.toBe(true);
    expect(open.prisma.adminAccount.findUnique).not.toHaveBeenCalled();
  });
});
