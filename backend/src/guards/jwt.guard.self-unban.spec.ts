import { JwtGuard } from './jwt.guard';

const contextFor = (method: string, path: string) => {
  const request: any = { method, path, headers: { authorization: 'Bearer valid-token' } };
  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
    request,
  };
};

describe('JwtGuard self-unban access', () => {
  it('allows a banned user to create the dedicated self-unban payment request', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'BANNED' }) } };
    const guard = new JwtGuard(jwt as any, { get: jest.fn().mockReturnValue('secret') } as any, prisma as any);
    const { context } = contextFor('POST', '/auth/user/pay-unban');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('does not exempt similarly named write routes', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'BANNED' }) } };
    const guard = new JwtGuard(jwt as any, { get: jest.fn().mockReturnValue('secret') } as any, prisma as any);
    const { context } = contextFor('POST', '/auth/user/pay-unban-extra');

    await expect(guard.canActivate(context)).rejects.toThrow('账号已被封禁');
  });

  it('allows the dedicated route under the global api prefix', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'BANNED' }) } };
    const guard = new JwtGuard(jwt as any, { get: jest.fn().mockReturnValue('secret') } as any, prisma as any);
    const { context } = contextFor('POST', '/api/auth/user/pay-unban');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
