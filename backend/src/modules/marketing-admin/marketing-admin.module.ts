import { Module } from '@nestjs/common';
import { MarketingAdminController } from './marketing-admin.controller';
import { MarketingAdminService } from './marketing-admin.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [PrismaModule, NotifyModule],
  controllers: [MarketingAdminController],
  providers: [MarketingAdminService],
  exports: [MarketingAdminService],
})
export class MarketingAdminModule {}
