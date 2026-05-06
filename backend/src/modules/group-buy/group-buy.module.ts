import { Module } from '@nestjs/common';
import { GroupBuyAdminController } from './group-buy.admin.controller';
import { GroupBuyService } from './group-buy.service';

@Module({
  controllers: [GroupBuyAdminController],
  providers: [GroupBuyService],
  exports: [GroupBuyService]
})
export class GroupBuyModule {}
