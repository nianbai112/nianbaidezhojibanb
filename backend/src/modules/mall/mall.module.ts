import { Module } from '@nestjs/common';
import { MallController } from './mall.controller';
import { MallService } from './mall.service';
import { MallAdminController } from './mall-admin.controller';
import { MallAdminService } from './mall-admin.service';
import { WalletService } from '../../common/services/wallet.service';
import { MembershipModule } from '../membership/membership.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [MembershipModule, PaymentModule],
  controllers: [MallController, MallAdminController],
  providers: [MallService, MallAdminService, WalletService],
  exports: [MallService, MallAdminService],
})
export class MallModule {}
