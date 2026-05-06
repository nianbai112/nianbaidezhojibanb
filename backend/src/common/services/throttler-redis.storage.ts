import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(key: string, ttl: number) {
    const redis = this.redisService.getClient();

    // 原子性地自增并设置过期时间（如果是新 key）
    const luaScript = `
      local current = redis.call('incr', KEYS[1])
      if tonumber(current) == 1 then
        redis.call('pexpire', KEYS[1], ARGV[1])
      end
      local remaining = redis.call('pttl', KEYS[1])
      return {current, remaining}
    `;

    const result = (await redis.eval(
      luaScript,
      1,
      key,
      ttl,
    )) as [number, number];

    const totalHits = result[0];
    const pttl = result[1];

    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(pttl / 1000)),
    };
  }
}
