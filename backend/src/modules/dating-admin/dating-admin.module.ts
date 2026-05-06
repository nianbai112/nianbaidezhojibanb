import { Module } from '@nestjs/common'
import { DatingAdminController } from './dating-admin.controller'
import { DatingAdminService } from './dating-admin.service'

@Module({
  controllers: [DatingAdminController],
  providers: [DatingAdminService],
  exports: [DatingAdminService],
})
export class DatingAdminModule {}
