import { Module } from '@nestjs/common'
import { ErrandAdminController } from './errand-admin.controller'
import { ErrandAdminService } from './errand-admin.service'

@Module({
  controllers: [ErrandAdminController],
  providers: [ErrandAdminService],
  exports: [ErrandAdminService],
})
export class ErrandAdminModule {}
