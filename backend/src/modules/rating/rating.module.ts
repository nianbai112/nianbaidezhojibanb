import { Module } from '@nestjs/common';
import { RatingAdminController } from './rating.admin.controller';
import { RatingAdminService } from './rating.admin.service';

@Module({
  controllers: [RatingAdminController],
  providers: [RatingAdminService],
  exports: [RatingAdminService],
})
export class RatingModule {}
