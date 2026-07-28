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
});
