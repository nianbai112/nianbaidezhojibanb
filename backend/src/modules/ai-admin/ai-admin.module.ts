import { Module } from '@nestjs/common';
import { AiAdminController } from './ai-admin.controller';
import { AiAdminService } from './ai-admin.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule],
  controllers: [AiAdminController],
  providers: [AiAdminService],
  exports: [AiAdminService],
})
export class AiAdminModule {}
