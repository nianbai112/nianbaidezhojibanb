import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MiniappAdminController } from './miniapp.admin.controller';
import { MiniappCodeController } from './miniapp-code.controller';
import { MiniappCodeService } from './miniapp-code.service';
import { MiniappStaticController } from './miniapp-static.controller';
import { MiniappPreviewController } from './miniapp-preview.controller';
import { MiniappPreviewService } from './miniapp-preview.service';
import { MiniappService } from './miniapp.service';

@Module({
  imports: [ConfigModule],
  controllers: [MiniappAdminController, MiniappCodeController, MiniappStaticController, MiniappPreviewController],
  providers: [MiniappService, MiniappCodeService, MiniappPreviewService],
  exports: [MiniappService, MiniappCodeService, MiniappPreviewService],
})
export class MiniappModule {}
