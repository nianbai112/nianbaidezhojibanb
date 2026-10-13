import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { WechatMomentsAdminController } from './wechat-moments.admin.controller';
import { WechatMomentsService } from './wechat-moments.service';

@Module({
  imports: [UploadModule],
  controllers: [WechatMomentsAdminController],
  providers: [WechatMomentsService],
  exports: [WechatMomentsService],
})
export class WechatMomentsModule {}
