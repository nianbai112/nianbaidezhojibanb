import { AddressModule } from '../address/address.module';
import { Module } from '@nestjs/common';
import { MallOwnerController } from './mall-owner.controller';
import { MallOwnerService } from './mall-owner.service';
import { MallController } from './mall.controller';
import { MallService } from './mall.service';
import { MallAdminController } from './mall-admin.controller';
import { MallAdminService } from './mall-admin.service';
import { WalletService } from '../../common/services/wallet.service';
import { MembershipModule } from '../membership/membership.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [MembershipModule, PaymentModule, AddressModule],
  controllers: [MallController, MallAdminController, MallOwnerController],
  providers: [MallService, MallAdminService, MallOwnerService, WalletService],
  exports: [MallService, MallAdminService],
})
export class MallModule {}
