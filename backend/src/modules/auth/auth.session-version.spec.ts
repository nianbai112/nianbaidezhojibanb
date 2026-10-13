import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { readAccessSession } from '../../common/user-token-policy';

const fixture = () => {
  const user = { id: 'user-1', status: 'ACTIVE', authVersion: 0, deletedAt: null };
  const prisma = { user: { findUnique: jest.fn().mockImplementation(async () => ({ ...user })) } };
  const jwt = new JwtService({ secret: 'session-test-key' });
  const config = { get: jest.fn((k: string) => k === 'JWT_SECRET' ? 'session-test-key' : undefined) };
  const entries = new Map<string, string>();
  const redis = { get: jest.fn(async (k: string) => entries.get(k)), set: jest.fn(async (k: string, v: string) => { entries.set(k, v); }), del: jest.fn().mockResolvedValue(undefined), delPattern: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(prisma as any, jwt, config as any, redis as any, {} as any);
  const issue = () => (service as any).generateTokens('user-1', 'mini-openid');
  return { user, prisma, jwt, redis, service, issue, entries };
};
describe('refresh purpose, migration and version races', () => {
  it('issues separate access/refresh purposes with the same persisted version', async () => {
    const f = fixture(); f.user.authVersion = 7; const tokens = await f.issue();
    expect(f.jwt.verify(tokens.accessToken)).toEqual(expect.objectContaining({ token_use: 'access', sv: 7 }));
    expect(f.jwt.verify(tokens.refreshToken)).toEqual(expect.objectContaining({ token_use: 'refresh', sv: 7 }));
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    const renewed = await f.service.refreshToken(tokens.refreshToken);
    expect(f.jwt.verify(renewed.accessToken)).toEqual(expect.objectContaining({ token_use: 'access', sv: 7 }));
  });
  it('rejects an access token at refresh even if Redis is maliciously or accidentally set to it', async () => {
    const f = fixture(); const tokens = await f.issue(); const decoded = f.jwt.verify(tokens.accessToken);
    f.entries.set(`refresh:user-1:${decoded.sid}`, tokens.accessToken); f.redis.get.mockClear();
    await expect(f.service.refreshToken(tokens.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.redis.get).not.toHaveBeenCalled();
  });
  it('requires exact Redis matching for a no-purpose legacy refresh and upgrades its access token', async () => {
    const f = fixture(); const legacy = f.jwt.sign({ sub: 'user-1', openid: 'mini-openid' }, { expiresIn: '1h' });
    await expect(f.service.refreshToken(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
    f.entries.set('refresh:user-1', legacy);
    const renewed = await f.service.refreshToken(legacy);
    expect(f.jwt.verify(renewed.accessToken)).toEqual(expect.objectContaining({ token_use: 'access', sv: 0 }));
  });
  it('rejects legacy refresh after any persisted revocation even if Redis retains it', async () => {
    const f = fixture(); const legacy = f.jwt.sign({ sub: 'user-1' }, { expiresIn: '1h' });
    f.entries.set('refresh:user-1', legacy); f.user.authVersion = 1;
    await expect(f.service.refreshToken(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects refresh when revocation happens after Redis matching but before reading the user', async () => {
    const f = fixture(); const tokens = await f.issue();
    f.redis.get.mockImplementationOnce(async k => { f.user.authVersion++; return f.entries.get(k); });
    await expect(f.service.refreshToken(tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('a token signed from a pre-revocation database snapshot cannot become a valid new session', async () => {
    const f = fixture(); const tokens = await f.issue();
    f.prisma.user.findUnique.mockImplementationOnce(async () => { const old = { ...f.user }; f.user.authVersion++; return old; });
    const renewed = await f.service.refreshToken(tokens.refreshToken);
    await expect(readAccessSession(f.prisma, f.jwt.verify(renewed.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('does not let a Redis read failure mint a token', async () => {
    const f = fixture(); const tokens = await f.issue(); const failure = new Error('redis unavailable'); f.redis.get.mockRejectedValue(failure);
    await expect(f.service.refreshToken(tokens.refreshToken)).rejects.toBe(failure);
  });
});
