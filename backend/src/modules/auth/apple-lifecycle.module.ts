import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { AppOauthService } from './app-oauth.service';
import { AppleLifecycleService } from './apple-lifecycle.service';
import { AppleLifecycleController } from './apple-lifecycle.controller';

@Module({
  imports: [PrismaModule, RedisModule, WebsocketModule],
  controllers: [AppleLifecycleController],
  providers: [AppOauthService, AppleLifecycleService],
  exports: [AppOauthService, AppleLifecycleService],
})
export class AppleLifecycleModule {}
