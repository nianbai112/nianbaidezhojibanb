import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ShopRankingService } from './shop-ranking.service';
import { ShopRankingController } from './shop-ranking.controller';
import { NotifyModule } from '../notify/notify.module';
import { MembershipModule } from '../membership/membership.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { PrintModule } from '../print/print.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [NotifyModule, MembershipModule, SystemConfigModule, PrintModule, PaymentModule],
  controllers: [ShopController, ShopRankingController],
  providers: [ShopService, ShopRankingService],
  exports: [ShopService],
})
export class ShopModule {}
