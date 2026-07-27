import { Module } from '@nestjs/common';
import { ErrandController } from './errand.controller';
import { ErrandAdminController } from './errand.admin.controller';
import { ErrandService } from './errand.service';
import { WalletService } from '../../common/services/wallet.service';
import { NotifyModule } from '../notify/notify.module';
import { MembershipModule } from '../membership/membership.module';
import { PaymentModule } from '../payment/payment.module';
import { ErrandQuoteService } from './errand-quote.service';
import { ErrandLifecycleService } from './errand-lifecycle.service';

@Module({
  imports: [NotifyModule, MembershipModule, PaymentModule],
  controllers: [ErrandController, ErrandAdminController],
  providers: [ErrandService, ErrandQuoteService, ErrandLifecycleService, WalletService],
  exports: [ErrandService, ErrandQuoteService, ErrandLifecycleService],
})
export class ErrandModule {}
