import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupplementController } from './supplement.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PaymentModule],
  controllers: [AdminController, SupplementController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
