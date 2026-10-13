import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { NotifyModule } from '../notify/notify.module';
import { RiderPayoutController } from './rider-payout.controller';
import { RiderAuthorizationService } from './rider-authorization.service';
import { RiderPayoutService } from './rider-payout.service';
import { WechatTransferGateway } from './wechat-transfer.gateway';

@Module({
  imports: [PaymentModule, AuthModule, NotifyModule], controllers: [RiderPayoutController],
  providers: [WechatTransferGateway, RiderAuthorizationService, RiderPayoutService],
  exports: [RiderPayoutService],
})
export class RiderPayoutModule {}
