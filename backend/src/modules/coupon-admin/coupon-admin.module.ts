import { Module } from '@nestjs/common'
import { CouponAdminController } from './coupon-admin.controller'
import { CouponAdminService } from './coupon-admin.service'

@Module({
  controllers: [CouponAdminController],
  providers: [CouponAdminService],
  exports: [CouponAdminService],
})
export class CouponAdminModule {}
