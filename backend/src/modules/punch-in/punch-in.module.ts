import { Module } from '@nestjs/common';
import { PunchInAdminController } from './punch-in.admin.controller';
import { PunchInService } from './punch-in.service';

@Module({
  controllers: [PunchInAdminController],
  providers: [PunchInService],
  exports: [PunchInService],
})
export class PunchInModule {}
