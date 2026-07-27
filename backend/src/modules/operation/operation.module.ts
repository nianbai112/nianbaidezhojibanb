import { Module } from '@nestjs/common';
import { OperationController } from './operation.controller';
import { OperationService } from './operation.service';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { PaymentModule } from '../payment/payment.module';
import { MembershipModule } from '../membership/membership.module';
import { GrowthModule } from '../growth/growth.module';

@Module({
  imports: [AiRuntimeModule, PaymentModule, MembershipModule, GrowthModule],
  controllers: [OperationController],
  providers: [OperationService],
  exports: [OperationService],
})
export class OperationModule {}
