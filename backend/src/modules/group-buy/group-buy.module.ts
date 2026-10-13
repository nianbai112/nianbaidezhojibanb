import { GroupBuyConsumerService } from './group-buy.consumer.service';
import { GroupBuyConsumerController } from './group-buy.consumer.controller';
import { PaymentModule } from '../payment/payment.module';
import { WalletService } from '../../common/services/wallet.service';
import { Module } from '@nestjs/common';
import { GroupBuyAdminController } from './group-buy.admin.controller';
import { GroupBuyService } from './group-buy.service';

@Module({
  imports: [PaymentModule],
  controllers: [GroupBuyAdminController, GroupBuyConsumerController],
  providers: [GroupBuyService, GroupBuyConsumerService, WalletService],
  exports: [GroupBuyService, GroupBuyConsumerService]
})
export class GroupBuyModule {}
