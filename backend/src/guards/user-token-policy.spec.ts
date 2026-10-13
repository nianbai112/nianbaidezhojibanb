import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { readAccessSession } from '../common/user-token-policy';

const jwt = new JwtService({ secret: 'local-purpose-test-secret' });
const fixture = (version = 0) => {
  const user = { id: 'user-1', status: 'ACTIVE', authVersion: version, deletedAt: null };
  const prisma = { user: { findUnique: jest.fn().mockImplementation(async () => ({ ...user })) } };
  const config = { get: jest.fn().mockReturnValue('local-purpose-test-secret') };
  const required = new JwtGuard(jwt, config as any, prisma as any);
  const optional = new OptionalAuthGuard(jwt, config as any, prisma as any);
  return { user, prisma, required, optional };
};
const request = (payload: any, method = 'GET', path = '/posts') => {
  const req: any = { headers: { authorization: `Bearer ${jwt.sign({ sub: 'user-1', ...payload }, { expiresIn: '1h' })}` }, method, path };
  return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as any };
};
describe('user bearer-token purpose and durable version', () => {
  it.each([{ token_use: 'refresh', sv: 0 }, {}, { token_use: 'access' }, { token_use: 'access', sv: '0' }])('refuses invalid access claims %# without a user query', async payload => {
    const f = fixture(); const r = request(payload);
    await expect(f.required.canActivate(r.context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.prisma.user.findUnique).not.toHaveBeenCalled();
    await expect(f.optional.canActivate(r.context)).resolves.toBe(true);
    expect(r.req.user).toBeUndefined();
  });
  it('accepts a newly issued token, then rejects it after revocation even in the same second', async () => {
    const f = fixture(); const r = request({ token_use: 'access', sv: 0 });
    await expect(f.required.canActivate(r.context)).resolves.toBe(true);
    f.user.authVersion++;
    await expect(f.required.canActivate(r.context)).rejects.toBeInstanceOf(UnauthorizedException);
    await f.optional.canActivate(r.context);
    expect(r.req.user).toBeUndefined();
    await expect(f.required.canActivate(request({ token_use: 'access', sv: 1 }).context)).resolves.toBe(true);
  });
  it('does not restore a pre-ban token when the user is unbanned', async () => {
    const f = fixture(); const r = request({ token_use: 'access', sv: 0 }, 'POST', '/auth/user/pay-unban');
    f.user.status = 'BANNED'; f.user.authVersion = 1;
    await expect(f.required.canActivate(r.context)).rejects.toBeInstanceOf(UnauthorizedException);
    f.user.status = 'ACTIVE';
    await expect(f.required.canActivate(r.context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each(['BANNED', 'INACTIVE', 'DELETED'])('never attaches an optional identity for %s', async status => {
    const f = fixture(); f.user.status = status;
    const r = request({ token_use: 'access', sv: 0 });
    await f.optional.canActivate(r.context); expect(r.req.user).toBeUndefined();
  });
  it('attaches the active identity to optional routes', async () => {
    const f = fixture(); const r = request({ token_use: 'access', sv: 0 });
    await f.optional.canActivate(r.context); expect(r.req.user.sub).toBe('user-1');
  });
  it('fails closed on database loss without misreporting a credential failure', async () => {
    const f = fixture(); const failure = new Error('database unavailable'); f.prisma.user.findUnique.mockRejectedValue(failure);
    const r = request({ token_use: 'access', sv: 0 });
    await expect(f.required.canActivate(r.context)).rejects.toBe(failure);
    await expect(f.optional.canActivate(r.context)).rejects.toBe(failure);
  });
  it('checks the expiry of long-lived websocket payloads on every use', async () => {
    const f = fixture(); await expect(readAccessSession(f.prisma, { sub: 'user-1', token_use: 'access', sv: 0, exp: Math.floor(Date.now() / 1000) })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
