import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

@Injectable()
export class RedisService {
  constructor(@Inject("REDIS_CLIENT") private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delPattern(pattern: string): Promise<number> {
    let cursor = "0";
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        200,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
    } while (cursor !== "0");
    return deleted;
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      await this.del(key).catch(() => undefined);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async getLock(key: string, ttlSeconds: number = 10): Promise<boolean> {
    const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Runs a short scheduled job once across all application instances.
   * ponytail: no lock renewal; scheduled jobs are bounded to small batches and
   * should be moved to a worker queue if they can run longer than the TTL.
   */
  async withLock<T>(
    key: string,
    ttlSeconds: number,
    task: () => Promise<T>,
  ): Promise<T | undefined> {
    const token = randomUUID();
    const locked = await this.redis.set(key, token, "EX", ttlSeconds, "NX");
    if (locked !== "OK") return undefined;
    try {
      return await task();
    } finally {
      await this.redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        1,
        key,
        token,
      );
    }
  }

  /**
   * Runs a potentially long job under a token-owned Redis lease. The lease is
   * renewed while the task is active and still expires automatically if the
   * Worker process crashes.
   */
  async withRenewingLock<T>(
    key: string,
    ttlSeconds: number,
    task: () => Promise<T>,
  ): Promise<T | undefined> {
    const token = randomUUID();
    const locked = await this.redis.set(key, token, "EX", ttlSeconds, "NX");
    if (locked !== "OK") return undefined;

    let renewal: Promise<unknown> | undefined;
    const renewEveryMs = Math.max(250, Math.floor((ttlSeconds * 1000) / 3));
    const timer = setInterval(() => {
      if (renewal) return;
      renewal = this.redis
        .eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) end return 0',
          1,
          key,
          token,
          ttlSeconds,
        )
        .catch(() => 0)
        .finally(() => {
          renewal = undefined;
        });
    }, renewEveryMs);
    timer.unref?.();

    try {
      return await task();
    } finally {
      clearInterval(timer);
      if (renewal) await renewal;
      await this.redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        1,
        key,
        token,
      );
    }
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.redis.lpush(key, ...values);
  }

  async brpop(
    key: string,
    timeout: number = 0,
  ): Promise<[string, string] | null> {
    return this.redis.brpop(key, timeout);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, field, value);
  }

  async hsetIfNewer(
    key: string,
    field: string,
    value: { time: number; [name: string]: unknown },
  ): Promise<boolean> {
    const time = Number(value?.time);
    if (!Number.isFinite(time))
      throw new Error("Redis freshness value requires a finite time");
    const result = await this.redis.eval(
      `local current = redis.call('HGET', KEYS[1], ARGV[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and decoded['time'] ~= nil then
    local current_time = tonumber(decoded['time'])
    local incoming_time = tonumber(ARGV[2])
    if current_time and incoming_time and current_time >= incoming_time then return 0 end
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1`,
      1,
      key,
      field,
      time,
      JSON.stringify(value),
    );
    return Number(result) === 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redis.hdel(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(key, score, member);
  }

  async zincrby(key: string, increment: number, member: string): Promise<void> {
    await this.redis.zincrby(key, increment, member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redis.zrevrange(key, start, stop);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.redis.zrem(key, member);
  }

  async flushdb(): Promise<void> {
    await this.redis.flushdb();
  }

  getClient(): Redis {
    return this.redis;
  }
}
