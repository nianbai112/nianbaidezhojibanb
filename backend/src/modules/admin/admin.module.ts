import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupplementController } from './supplement.controller';
import { PublicConfigCompatController } from './public-config-compat.controller';
import { NewUiCompatController } from './new-ui-compat.controller';
import { ApiCompatController } from './api-compat.controller';
import { PaymentModule } from '../payment/payment.module';
import { FinanceAdminModule } from '../finance-admin/finance-admin.module';
import { MembershipModule } from '../membership/membership.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { CommentModule } from '../comment/comment.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [PaymentModule, FinanceAdminModule, MembershipModule, WebsocketModule, CommentModule, NotifyModule],
  controllers: [PublicConfigCompatController, AdminController, SupplementController, NewUiCompatController, ApiCompatController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
