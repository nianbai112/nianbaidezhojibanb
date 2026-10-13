import { UserSessionRevocationService } from './user-session-revocation.service';

const encoded = (sv?: number, sub = 'user-1') => `e30.${Buffer.from(JSON.stringify({ sub, ...(sv === undefined ? {} : { token_use: 'refresh', sv }) })).toString('base64url')}.opaque-internal-signature`;
const fixture = () => {
  const entries = new Map<string, string>();
  const client = {
    get: jest.fn(async (key: string) => entries.get(key)),
    scan: jest.fn(async () => ['0', Array.from(entries.keys())]),
    eval: jest.fn(async (_script: string, _count: number, key: string, value: string) => {
      if (entries.get(key) !== value) return 0;
      return Number(entries.delete(key));
    }),
  };
  const redis = { getClient: jest.fn(() => client) };
  const prisma = { user: { update: jest.fn().mockResolvedValue({ authVersion: 1 }) } };
  const wsNative = { disconnectUser: jest.fn().mockReturnValue(2) };
  const messageGateway = { disconnectUser: jest.fn().mockResolvedValue(1) };
  const service = new UserSessionRevocationService(redis as any, wsNative as any, prisma as any, messageGateway as any);
  return { entries, client, redis, prisma, wsNative, messageGateway, service };
};
describe('durable version-bounded session revocation', () => {
  it('captures the atomic increment before narrowing cleanup to that cutoff', async () => {
    const f = fixture(); f.entries.set('refresh:user-1:old', encoded(0));
    await expect(f.service.revoke('user-1')).resolves.toEqual({ nativeSockets: 2, socketIoSockets: 1 });
    expect(f.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { authVersion: { increment: 1 } }, select: { authVersion: true } });
    expect(f.prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(f.client.get.mock.invocationCallOrder[0]);
    expect(f.entries.size).toBe(0);
    expect(f.wsNative.disconnectUser).toHaveBeenCalledWith('user-1', 1);
    expect(f.messageGateway.disconnectUser).toHaveBeenCalledWith('user-1', 1);
  });
  it('does not increment twice or read a later version when the lifecycle transaction supplied the cutoff', async () => {
    const f = fixture();
    await f.service.revoke('user-1', { versionAlreadyRevoked: true, invalidBeforeVersion: 4 });
    expect(f.prisma.user.update).not.toHaveBeenCalled();
    expect(f.wsNative.disconnectUser).toHaveBeenCalledWith('user-1', 4);
  });
  it('does not acknowledge a database revocation failure', async () => {
    const f = fixture(); const failure = new Error('database unavailable'); f.prisma.user.update.mockRejectedValue(failure);
    await expect(f.service.revoke('user-1')).rejects.toBe(failure);
    expect(f.redis.getClient).not.toHaveBeenCalled(); expect(f.wsNative.disconnectUser).not.toHaveBeenCalled();
  });
  it('keeps persisted revocation and bounded disconnects when Redis is unavailable', async () => {
    const f = fixture(); f.client.get.mockRejectedValue(new Error('offline'));
    await expect(f.service.revoke('user-1')).resolves.toEqual({ nativeSockets: 2, socketIoSockets: 1 });
    expect(f.prisma.user.update).toHaveBeenCalledTimes(1); expect(f.wsNative.disconnectUser).toHaveBeenCalledWith('user-1', 1);
  });
  it('preserves a new authorization created after the commit but before old cleanup begins', async () => {
    const f = fixture();
    f.entries.set('refresh:user-1', encoded()); f.entries.set('refresh:user-1:old', encoded(0));
    f.entries.set('refresh:user-1:new', encoded(1)); f.entries.set('refresh:user-1:newer', encoded(2));
    f.entries.set('refresh:user-2:other', encoded(0, 'user-2'));
    await f.service.revoke('user-1', { versionAlreadyRevoked: true, invalidBeforeVersion: 1 });
    expect(Array.from(f.entries.keys())).toEqual(['refresh:user-1:new', 'refresh:user-1:newer', 'refresh:user-2:other']);
  });
  it('compares the exact Redis value so a GET-to-DEL replacement remains intact', async () => {
    const f = fixture(); const key = 'refresh:user-1:replaced'; const old = encoded(0); const fresh = encoded(1);
    f.entries.set(key, old);
    f.client.get.mockImplementation(async currentKey => {
      const value = f.entries.get(currentKey);
      if (currentKey === key) f.entries.set(key, fresh);
      return value;
    });
    await f.service.revoke('user-1', { versionAlreadyRevoked: true, invalidBeforeVersion: 1 });
    expect(f.client.eval).toHaveBeenCalledWith(expect.stringContaining('ARGV[1]'), 1, key, old);
    expect(f.entries.get(key)).toBe(fresh);
  });
  it('cannot delete another subject or interpret corrupt payloads as authorization', async () => {
    const f = fixture(); f.entries.set('refresh:user-1:wrong', encoded(0, 'user-2'));
    f.entries.set('refresh:user-1:corrupt', 'not-a-jwt'); f.entries.set('refresh:user-1:bad-version', encoded(-1));
    await f.service.revoke('user-1', { versionAlreadyRevoked: true, invalidBeforeVersion: 1 });
    expect(f.entries.size).toBe(3); expect(f.client.eval).not.toHaveBeenCalled();
  });
  it.each([undefined, 0, -1, NaN, '1'])('refuses an absent or invalid captured cutoff (%s)', async cutoff => {
    const f = fixture();
    await expect(f.service.revoke('user-1', { versionAlreadyRevoked: true, invalidBeforeVersion: cutoff as any })).rejects.toThrow('committed authVersion');
    expect(f.redis.getClient).not.toHaveBeenCalled(); expect(f.wsNative.disconnectUser).not.toHaveBeenCalled();
  });
});
