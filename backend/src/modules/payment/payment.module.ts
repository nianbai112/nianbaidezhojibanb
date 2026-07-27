import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { NotifyModule } from '../notify/notify.module';
import { MembershipModule } from '../membership/membership.module';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [JwtModule, NotifyModule, MembershipModule, PrintModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
