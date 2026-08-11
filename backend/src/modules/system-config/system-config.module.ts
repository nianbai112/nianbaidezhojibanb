import { Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import {
  LoginPageConfigPublicController,
  RiderAppConfigPublicController,
  SystemConfigController,
} from './system-config.controller';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { WechatModule } from '../wechat/wechat.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule, WechatModule],
  controllers: [
    SystemConfigController,
    LoginPageConfigPublicController,
    RiderAppConfigPublicController,
  ],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
