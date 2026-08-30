import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from '../services/redis.service';
import { ServiceHeartbeatStore } from '../services/service-heartbeat.store';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => {
        const setupMode = String(config.get('SETUP_WIZARD') || '').toLowerCase() === 'true';
        const client = new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD') || undefined,
          db: config.get('REDIS_DB') || 0,
          lazyConnect: setupMode,
          enableOfflineQueue: !setupMode,
          maxRetriesPerRequest: setupMode ? 0 : undefined,
          retryStrategy: setupMode ? () => null : undefined,
        });
        client.on('error', () => undefined);
        return client;
      },
      inject: [ConfigService],
    },
    RedisService,
    ServiceHeartbeatStore,
  ],
  exports: [RedisService, ServiceHeartbeatStore],
})
export class RedisModule {}
