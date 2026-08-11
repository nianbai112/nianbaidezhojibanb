import { Module } from '@nestjs/common';
import { LayoutConfigController } from './layout-config.controller';
import { LayoutPublicController } from './layout-public.controller';
import { LayoutConfigService } from './layout-config.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule],
  controllers: [LayoutConfigController, LayoutPublicController],
  providers: [LayoutConfigService],
  exports: [LayoutConfigService],
})
export class LayoutConfigModule {}
