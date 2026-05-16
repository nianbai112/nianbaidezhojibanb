import { Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
