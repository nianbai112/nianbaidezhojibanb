import { Module } from '@nestjs/common';
import { TopupController } from './topup.controller';
import { TopupService } from './topup.service';
import { PaymentModule } from '../payment/payment.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [PaymentModule, MembershipModule],
  controllers: [TopupController],
  providers: [TopupService],
})
export class TopupModule {}
