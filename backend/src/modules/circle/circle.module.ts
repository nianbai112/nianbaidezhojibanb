import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { CircleController } from './circle.controller';
import { CircleAdminController } from './circle.admin.controller';
import { CircleService } from './circle.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Module({
  imports: [UploadModule],
  controllers: [CircleController, CircleAdminController],
  providers: [CircleService, UserAccessPolicyService],
  exports: [CircleService],
})
export class CircleModule {}
