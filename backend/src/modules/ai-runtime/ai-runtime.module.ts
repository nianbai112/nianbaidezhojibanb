import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeService } from './ai-runtime.service';

@Module({
  imports: [PrismaModule],
  providers: [AiRuntimeService],
  exports: [AiRuntimeService],
})
export class AiRuntimeModule {}
