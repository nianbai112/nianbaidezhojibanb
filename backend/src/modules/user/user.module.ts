import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { NotifyModule } from '../notify/notify.module';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { GrowthModule } from '../growth/growth.module';
import { FinanceModule } from '../finance/finance.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { IpGeoModule } from '../ip-geo/ip-geo.module';
import { PaymentModule } from '../payment/payment.module';
import { StudentIdentityModule } from '../student-identity/student-identity.module';
import { AppleLifecycleModule } from '../auth/apple-lifecycle.module';

@Module({
  imports: [NotifyModule, GrowthModule, FinanceModule, WebsocketModule, IpGeoModule, PaymentModule, StudentIdentityModule, AppleLifecycleModule],
  controllers: [UserController],
  providers: [UserService, UserAccessPolicyService],
  exports: [UserService],
})
export class UserModule {}
