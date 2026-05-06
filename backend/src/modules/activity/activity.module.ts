import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ActivityAdminController } from './activity.admin.controller';
import { ActivityAdminService } from './activity.admin.service';

@Module({
  controllers: [ActivityController, ActivityAdminController],
  providers: [ActivityService, ActivityAdminService],
  exports: [ActivityService, ActivityAdminService],
})
export class ActivityModule {}
