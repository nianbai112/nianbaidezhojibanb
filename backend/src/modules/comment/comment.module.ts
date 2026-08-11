import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { NotifyModule } from '../notify/notify.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { MembershipModule } from '../membership/membership.module';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Module({
  imports: [NotifyModule, AiRuntimeModule, MembershipModule],
  controllers: [CommentController],
  providers: [CommentService, UserAccessPolicyService],
  exports: [CommentService],
})
export class CommentModule {}
