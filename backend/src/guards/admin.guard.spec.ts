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
