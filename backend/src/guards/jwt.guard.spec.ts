import { UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard password credential sessions', () => {
  function createGuard(payload: Record<string, unknown>, credential?: Record<string, unknown>) {
    const request: any = {
      method: 'GET',
      path: '/rider-app/session',
      headers: { authorization: 'Bearer signed-token' },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' }),
      },
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue(credential),
      },
    };
    const guard = new JwtGuard(
      { verifyAsync: jest.fn().mockResolvedValue(payload) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma as any,
    );
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
    return { guard, context, request, prisma };
  }

  it('rejects a rotated password token before protected user access', async () => {
    const { guard, context, request, prisma } = createGuard({
      sub: 'user-1',
      isAdmin: false,
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 2,
    }, {
      id: 'credential-1',
      userId: 'user-1',
      enabled: true,
      expiresAt: null,
      sessionVersion: 3,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('keeps ordinary SMS tokens credential-free', async () => {
    const payload = { sub: 'user-1', openid: 'openid-1', isAdmin: false };
    const { guard, context, request, prisma } = createGuard(payload);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.riderAppPasswordCredential.findUnique).not.toHaveBeenCalled();
    expect(request.user).toEqual(payload);
  });

  it('fails closed when a password token omits its credential version', async () => {
    const { guard, context, prisma } = createGuard({
      sub: 'user-1',
      isAdmin: false,
      authSource: 'rider_password',
      credentialId: 'credential-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow('登录状态已失效');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
