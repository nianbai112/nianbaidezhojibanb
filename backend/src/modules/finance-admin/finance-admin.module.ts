import { Module } from '@nestjs/common';
import { FinanceAdminController } from './finance-admin.controller';
import { FinanceAdminService } from './finance-admin.service';
import { RiderPayoutModule } from '../rider-payout/rider-payout.module';

@Module({
  imports: [RiderPayoutModule],
  controllers: [FinanceAdminController],
  providers: [FinanceAdminService],
  exports: [FinanceAdminService]
})
export class FinanceAdminModule {}
