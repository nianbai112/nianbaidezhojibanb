import { ThrottlerRedisStorage } from './throttler-redis.storage';

describe('ThrottlerRedisStorage', () => {
  it('returns the Nest 11 blocking state from the atomic Redis result', async () => {
    const evalMock = jest.fn().mockResolvedValue([6, 30_000, 1, 30_000]);
    const storage = new ThrottlerRedisStorage({
      getClient: () => ({ eval: evalMock }),
    } as any);

    await expect(storage.increment('login:user-1', 60_000, 5, 30_000, 'auth'))
      .resolves.toEqual({
        totalHits: 6,
        timeToExpire: 30,
        isBlocked: true,
        timeToBlockExpire: 30,
      });
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'login:user-1',
      60_000,
      5,
      30_000,
    );
  });
});
