import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeService } from './ai-runtime.service';
import { QrcodeModerationService } from './qrcode-moderation.service';

@Module({
  imports: [PrismaModule],
  providers: [AiRuntimeService, QrcodeModerationService],
  exports: [AiRuntimeService, QrcodeModerationService],
})
export class AiRuntimeModule {}
