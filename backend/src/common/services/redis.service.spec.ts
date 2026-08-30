import { RedisService } from "./redis.service";

describe("RedisService freshness writes", () => {
  it("uses one atomic script to reject an older hash value", async () => {
    const redis = { eval: jest.fn().mockResolvedValue(0) };
    const service = new RedisService(redis as any);
    const value = { lat: 30, lng: 120, time: 1_722_168_000_000 };

    await expect(
      service.hsetIfNewer("rider:location", "user-1", value),
    ).resolves.toBe(false);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HGET'"),
      1,
      "rider:location",
      "user-1",
      value.time,
      JSON.stringify(value),
    );
  });

  it("renews a token-owned lease while a long Worker task is active", async () => {
    jest.useFakeTimers();
    const redis = {
      set: jest.fn().mockResolvedValue("OK"),
      eval: jest.fn().mockResolvedValue(1),
    };
    const service = new RedisService(redis as any);
    let finish!: () => void;
    const task = service.withRenewingLock(
      "worker:long-job",
      3,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("expire"),
      1,
      "worker:long-job",
      expect.any(String),
      3,
    );

    finish();
    await task;
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("del"),
      1,
      "worker:long-job",
      expect.any(String),
    );
    jest.useRealTimers();
  });
});
