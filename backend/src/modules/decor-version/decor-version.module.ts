import { Module } from '@nestjs/common';
import { DecorVersionController } from './decor-version.controller';
import { DecorVersionService } from './decor-version.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AdminModule } from '../admin/admin.module';
import { LayoutConfigModule } from '../layout-config/layout-config.module';

@Module({
  imports: [PrismaModule, AdminModule, LayoutConfigModule],
  controllers: [DecorVersionController],
  providers: [DecorVersionService],
  exports: [DecorVersionService],
})
export class DecorVersionModule {}
