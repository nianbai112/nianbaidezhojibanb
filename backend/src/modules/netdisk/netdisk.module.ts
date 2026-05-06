import { Module } from '@nestjs/common';
import { NetDiskAdminController } from './netdisk.admin.controller';
import { NetDiskAdminService } from './netdisk.admin.service';

@Module({
  controllers: [NetDiskAdminController],
  providers: [NetDiskAdminService],
  exports: [NetDiskAdminService],
})
export class NetDiskModule {}
