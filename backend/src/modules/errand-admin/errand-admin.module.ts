import { Module } from '@nestjs/common'
import { ErrandAdminController } from './errand-admin.controller'
import { ErrandAdminService } from './errand-admin.service'
import { ErrandModule } from '../errand/errand.module'

@Module({
  imports: [ErrandModule],
  controllers: [ErrandAdminController],
  providers: [ErrandAdminService],
  exports: [ErrandAdminService],
})
export class ErrandAdminModule {}
