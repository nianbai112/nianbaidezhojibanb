import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
import { UserSessionRevocationService } from '../websocket/user-session-revocation.service';
import { AppleLifecycleModule } from './apple-lifecycle.module';
import { AppleLifecycleService } from './apple-lifecycle.service';
import { AppleLifecycleController } from './apple-lifecycle.controller';
import { AppleRevocationWorker } from './apple-revocation.worker';
import { AppOauthService } from './app-oauth.service';

describe('Apple lifecycle infrastructure wiring', () => {
  it('resolves the real module graph without connecting Redis or a database', async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => ({ JWT_SECRET: 'isolated-module-test' })] }),
      AppleLifecycleModule,
    ] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider('REDIS_CLIENT').useValue({ quit: jest.fn() })
      .overrideProvider(RedisService).useValue({})
      .overrideProvider(WsNativeGateway).useValue({ disconnectUser: jest.fn() })
      .compile();
    try {
      expect(module.get(AppleLifecycleService)).toBeInstanceOf(AppleLifecycleService);
      expect(module.get(AppleLifecycleController)).toBeInstanceOf(AppleLifecycleController);
      expect(module.get(AppOauthService)).toBeInstanceOf(AppOauthService);
      expect(module.get(UserSessionRevocationService)).toBeInstanceOf(UserSessionRevocationService);
      // Scheduling belongs to the worker process, not each HTTP replica.
      expect(() => module.get(AppleRevocationWorker)).toThrow();
    } finally { await module.close(); }
  });

  it('does not overlap drains and recovers after failures without logging provider secrets', async () => {
    let release!: () => void;
    const lifecycle = { drainRevocations: jest.fn().mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ attempted: 1, completed: 1 });
    })).mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_TOKEN')).mockResolvedValue({ attempted: 1, completed: 1 }) };
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      const worker = new AppleRevocationWorker(lifecycle as any);
      const first = worker.run();
      await worker.run();
      expect(lifecycle.drainRevocations).toHaveBeenCalledTimes(1);
      release(); await first;
      await worker.run(); await worker.run();
      expect(lifecycle.drainRevocations).toHaveBeenCalledTimes(3);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warning.mock.calls)).not.toContain('PRIVATE_');
    } finally { warning.mockRestore(); }
  });
});
