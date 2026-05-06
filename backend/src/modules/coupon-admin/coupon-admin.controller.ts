import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtGuard } from '../../guards/jwt.guard'
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard'
import { RequirePermission } from '../../decorators/require-permission.decorator'
import { CouponAdminService } from './coupon-admin.service'
import { CouponQueryDto, CreateCouponDto, UpdateCouponDto, CouponUsageQueryDto } from './dto/coupon-admin.dto'

@ApiTags('Admin - Coupon')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/coupons')
export class CouponAdminController {
  constructor(private readonly couponAdminService: CouponAdminService) {}

  @Get()
  @RequirePermission('coupon:view')
  @ApiOperation({ summary: '优惠券列表' })
  getCoupons(@Query() q: CouponQueryDto) {
    return this.couponAdminService.getCoupons(q)
  }

  @Get('records/list')
  @RequirePermission('coupon:records')
  @ApiOperation({ summary: '优惠券使用记录' })
  getCouponUsages(@Query() q: CouponUsageQueryDto) {
    return this.couponAdminService.getCouponUsages(q)
  }

  @Get(':id')
  @RequirePermission('coupon:view')
  @ApiOperation({ summary: '优惠券详情' })
  getCoupon(@Param('id') id: string) {
    return this.couponAdminService.getCouponById(id)
  }

  @Post()
  @RequirePermission('coupon:edit')
  @ApiOperation({ summary: '新建优惠券' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.couponAdminService.createCoupon(dto)
  }

  @Put(':id')
  @RequirePermission('coupon:edit')
  @ApiOperation({ summary: '编辑优惠券' })
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponAdminService.updateCoupon(id, dto)
  }

  @Delete(':id')
  @RequirePermission('coupon:edit')
  @ApiOperation({ summary: '删除优惠券' })
  deleteCoupon(@Param('id') id: string) {
    return this.couponAdminService.deleteCoupon(id)
  }

  @Put(':id/toggle')
  @RequirePermission('coupon:edit')
  @ApiOperation({ summary: '启用/停用优惠券' })
  toggleCouponStatus(@Param('id') id: string) {
    return this.couponAdminService.toggleCouponStatus(id)
  }

  @Post(':id/copy')
  @RequirePermission('coupon:edit')
  @ApiOperation({ summary: '复制优惠券' })
  copyCoupon(@Param('id') id: string) {
    return this.couponAdminService.copyCoupon(id)
  }
}
