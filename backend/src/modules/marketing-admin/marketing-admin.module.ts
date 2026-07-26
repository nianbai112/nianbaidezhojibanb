import { Module } from '@nestjs/common';
import { MarketingAdminController } from './marketing-admin.controller';
import { MarketingAdminService } from './marketing-admin.service';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketingAdminController],
  providers: [MarketingAdminService],
  exports: [MarketingAdminService],
})
export class MarketingAdminModule {}
