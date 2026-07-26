import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupplementController } from './supplement.controller';
import { PublicConfigCompatController } from './public-config-compat.controller';
import { NewUiCompatController } from './new-ui-compat.controller';
import { ApiCompatController } from './api-compat.controller';
import { PaymentModule } from '../payment/payment.module';
import { FinanceAdminModule } from '../finance-admin/finance-admin.module';

@Module({
  imports: [PaymentModule, FinanceAdminModule],
  controllers: [PublicConfigCompatController, AdminController, SupplementController, NewUiCompatController, ApiCompatController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
