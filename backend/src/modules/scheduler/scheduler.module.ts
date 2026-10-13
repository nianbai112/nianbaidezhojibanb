import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { PaymentExpiryService } from './payment-expiry.service';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { MallModule } from '../mall/mall.module';
import { ShopModule } from '../shop/shop.module';
import { ErrandModule } from '../errand/errand.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [PrismaModule, PaymentModule, MallModule, ShopModule, ErrandModule, ActivityModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, PaymentExpiryService, RefundReconciliationService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
