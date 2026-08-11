import { Module } from '@nestjs/common';
import { CircleController } from './circle.controller';
import { CircleAdminController } from './circle.admin.controller';
import { CircleService } from './circle.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Module({
  controllers: [CircleController, CircleAdminController],
  providers: [CircleService, UserAccessPolicyService],
  exports: [CircleService],
})
export class CircleModule {}
