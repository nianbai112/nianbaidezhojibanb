import { Module } from '@nestjs/common';
import { PhotoContestAdminController } from './photo-contest.admin.controller';
import { PhotoContestService } from './photo-contest.service';

@Module({
  controllers: [PhotoContestAdminController],
  providers: [PhotoContestService],
  exports: [PhotoContestService],
})
export class PhotoContestModule {}
