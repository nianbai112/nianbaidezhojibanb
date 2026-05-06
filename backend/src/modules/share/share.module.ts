import { Module } from '@nestjs/common';
import { ShareAdminController } from './share.admin.controller';
import { ShareService } from './share.service';

@Module({
  controllers: [ShareAdminController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
