import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ActivityAdminController } from './activity.admin.controller';
import { ActivityAdminService } from './activity.admin.service';
import { PaymentModule } from '../payment/payment.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [PaymentModule, MembershipModule],
  controllers: [ActivityController, ActivityAdminController],
  providers: [ActivityService, ActivityAdminService],
  exports: [ActivityService, ActivityAdminService],
})
export class ActivityModule {}
