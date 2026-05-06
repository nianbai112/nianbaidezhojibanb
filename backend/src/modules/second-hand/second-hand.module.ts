import { Module } from '@nestjs/common';
import { SecondHandAdminController } from './second-hand.admin.controller';
import { SecondHandAdminService } from './second-hand.admin.service';

@Module({
  controllers: [SecondHandAdminController],
  providers: [SecondHandAdminService],
  exports: [SecondHandAdminService],
})
export class SecondHandModule {}
