import { Module } from '@nestjs/common';
import { WechatTokenService } from './wechat-token.service';
import { WechatSubscribeService } from './wechat-subscribe.service';
import { WechatOfficialService } from './wechat-official.service';
import { WechatController } from './wechat.controller';
import { WechatAdminController } from './wechat.admin.controller';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [WechatController, WechatAdminController],
  providers: [WechatTokenService, WechatSubscribeService, WechatOfficialService],
  exports: [WechatTokenService, WechatSubscribeService, WechatOfficialService],
})
export class WechatModule {}
