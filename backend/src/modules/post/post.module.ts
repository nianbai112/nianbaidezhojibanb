import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { NotifyModule } from '../notify/notify.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { MembershipModule } from '../membership/membership.module';
import { GrowthModule } from '../growth/growth.module';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Module({
  imports: [NotifyModule, AiRuntimeModule, MembershipModule, GrowthModule],
  controllers: [PostController],
  providers: [PostService, UserAccessPolicyService],
  exports: [PostService],
})
export class PostModule {}
