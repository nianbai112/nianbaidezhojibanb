import { Module } from '@nestjs/common';
import { MallController } from './mall.controller';
import { MallService } from './mall.service';
import { MallAdminController } from './mall-admin.controller';
import { MallAdminService } from './mall-admin.service';

@Module({
  controllers: [MallController, MallAdminController],
  providers: [MallService, MallAdminService],
  exports: [MallService, MallAdminService],
})
export class MallModule {}
