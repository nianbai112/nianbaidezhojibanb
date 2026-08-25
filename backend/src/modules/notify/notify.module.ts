import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotifyService } from './notify.service';
import { NotifyController } from './notify.controller';
import { NotifyAdminController } from './notify.admin.controller';
import { NotificationChannelService } from './notification-channel.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { PrismaModule } from '../../common/modules/prisma.module';
import { WechatModule } from '../wechat/wechat.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    PrismaModule,
    WebsocketModule,
    WechatModule,
    PushModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotifyController, NotifyAdminController],
  providers: [NotifyService, NotificationChannelService],
  exports: [NotifyService, NotificationChannelService],
})
export class NotifyModule {}
