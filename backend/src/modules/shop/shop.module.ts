import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { NotifyModule } from '../notify/notify.module';
import { MembershipModule } from '../membership/membership.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { PrintModule } from '../print/print.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [NotifyModule, MembershipModule, SystemConfigModule, PrintModule, PaymentModule],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
