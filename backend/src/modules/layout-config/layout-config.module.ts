import { Module } from '@nestjs/common';
import { LayoutConfigController } from './layout-config.controller';
import { LayoutConfigService } from './layout-config.service';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LayoutConfigController],
  providers: [LayoutConfigService],
  exports: [LayoutConfigService],
})
export class LayoutConfigModule {}
