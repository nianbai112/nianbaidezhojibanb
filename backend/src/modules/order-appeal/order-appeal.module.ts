import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module';
import { OrderAppealAdminController } from './order-appeal.admin.controller';
import { OrderAppealController } from './order-appeal.controller';
import { OrderAppealService } from './order-appeal.service';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [NotifyModule, PaymentModule],
  controllers: [OrderAppealController, OrderAppealAdminController],
  providers: [OrderAppealService],
})
export class OrderAppealModule {}
