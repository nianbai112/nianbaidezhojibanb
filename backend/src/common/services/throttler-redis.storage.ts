import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ) {
    const redis = this.redisService.getClient();

    // 原子自增；首次超限时把剩余窗口切换为封禁时长，避免每次请求延长封禁。
    const luaScript = `
      local current = redis.call('incr', KEYS[1])
      if tonumber(current) == 1 then
        redis.call('pexpire', KEYS[1], ARGV[1])
      end
      local blocked = 0
      if tonumber(current) > tonumber(ARGV[2]) then
        blocked = 1
        if tonumber(current) == tonumber(ARGV[2]) + 1 then
          redis.call('pexpire', KEYS[1], ARGV[3])
        end
      end
      local remaining = redis.call('pttl', KEYS[1])
      local blockRemaining = 0
      if blocked == 1 then
        blockRemaining = remaining
      end
      return {current, remaining, blocked, blockRemaining}
    `;

    let result: [number, number, number, number];
    try {
      result = (await redis.eval(
        luaScript,
        1,
        key,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
    } catch {
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    const [totalHits, pttl, blocked, blockPttl] = result;

    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(pttl / 1000)),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(blockPttl / 1000)),
    };
  }
}
