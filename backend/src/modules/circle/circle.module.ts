import { Module } from '@nestjs/common';
import { CircleController } from './circle.controller';
import { CircleAdminController } from './circle.admin.controller';
import { CircleService } from './circle.service';

@Module({
  controllers: [CircleController, CircleAdminController],
  providers: [CircleService],
  exports: [CircleService],
})
export class CircleModule {}
