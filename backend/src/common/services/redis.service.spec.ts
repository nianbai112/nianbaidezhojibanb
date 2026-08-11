import { RedisService } from './redis.service';

describe('RedisService freshness writes', () => {
  it('uses one atomic script to reject an older hash value', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(0) };
    const service = new RedisService(redis as any);
    const value = { lat: 30, lng: 120, time: 1_722_168_000_000 };

    await expect(service.hsetIfNewer('rider:location', 'user-1', value)).resolves.toBe(false);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HGET'"),
      1,
      'rider:location',
      'user-1',
      value.time,
      JSON.stringify(value),
    );
  });

  it('renews an owned lock before its original lease expires', async () => {
    jest.useFakeTimers();
    let lock: { token: string; expiresAt: number } | null = null;
    const redis = {
      set: jest.fn(async (_key: string, token: string, _mode: string, ttl: number) => {
        if (lock && lock.expiresAt > Date.now()) return null;
        lock = { token, expiresAt: Date.now() + ttl * 1000 };
        return 'OK';
      }),
      eval: jest.fn(async (script: string, _keys: number, _key: string, token: string, ttlMs?: number) => {
        if (!lock || lock.token !== token || lock.expiresAt <= Date.now()) return 0;
        if (script.includes('pexpire')) {
          lock.expiresAt = Date.now() + Number(ttlMs);
          return 1;
        }
        if (script.includes('del')) {
          lock = null;
          return 1;
        }
        return 0;
      }),
    };
    const service = new RedisService(redis as any);
    let releaseFirst!: () => void;
    const first = service.withLock('security-lock', 1, () => new Promise<void>((resolve) => {
      releaseFirst = resolve;
    }));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1_100);
    const second = await service.withLock('security-lock', 1, async () => 'second');

    expect(second).toBeUndefined();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'security-lock',
      expect.any(String),
      1_000,
    );
    releaseFirst();
    await first;
    jest.useRealTimers();
  });
});
