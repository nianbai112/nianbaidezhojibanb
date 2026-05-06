import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtGuard } from '../../guards/jwt.guard'
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard'
import { RequirePermission } from '../../decorators/require-permission.decorator'
import { ErrandAdminService } from './errand-admin.service'
import {
  RiderQueryDto, AuditRiderDto, RiderStatusDto,
  DeliveryOrderQueryDto, AssignOrderDto, CancelOrderDto,
  UpdateFeeConfigDto,
  UpdatePageConfigDto,
  UpdateRewardPunishDto,
} from './dto/errand-admin.dto'

@ApiTags('Admin - Errand & Rider')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller()
export class ErrandAdminController {
  constructor(private readonly service: ErrandAdminService) {}

  // ==================== Rider ====================

  @Get('admin/riders')
  @RequirePermission('rider:view')
  @ApiOperation({ summary: '骑手列表' })
  getRiders(@Query() q: RiderQueryDto) {
    return this.service.getRiders(q)
  }

  @Get('admin/riders/:id')
  @RequirePermission('rider:view')
  @ApiOperation({ summary: '骑手详情' })
  getRiderDetail(@Param('id') id: string) {
    return this.service.getRiderDetail(id)
  }

  @Put('admin/riders/:id/audit')
  @RequirePermission('rider:audit')
  @ApiOperation({ summary: '审核骑手' })
  auditRider(@Param('id') id: string, @Body() dto: AuditRiderDto) {
    return this.service.auditRider(id, dto)
  }

  @Put('admin/riders/:id/status')
  @RequirePermission('rider:audit')
  @ApiOperation({ summary: '更改骑手状态' })
  updateRiderStatus(@Param('id') id: string, @Body() dto: RiderStatusDto) {
    return this.service.updateRiderStatus(id, dto)
  }

  @Get('admin/riders/:id/records')
  @RequirePermission('rider:view')
  @ApiOperation({ summary: '骑手配送记录' })
  getRiderRecords(@Param('id') id: string, @Query() q: any) {
    return this.service.getRiderRecords(id, q)
  }

  // ==================== Order ====================

  @Get('admin/errand/orders')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '跑腿订单列表' })
  getOrders(@Query() q: DeliveryOrderQueryDto) {
    return this.service.getOrders(q)
  }

  @Get('admin/errand/orders/:id')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '订单详情' })
  getOrderDetail(@Param('id') id: string) {
    return this.service.getOrderDetail(id)
  }

  @Put('admin/errand/orders/:id/cancel')
  @RequirePermission('errand:config')
  @ApiOperation({ summary: '取消订单' })
  cancelOrder(@Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.service.cancelOrder(id, dto)
  }

  @Post('admin/errand/orders/:id/assign')
  @RequirePermission('errand:config')
  @ApiOperation({ summary: '分配骑手' })
  assignOrder(@Param('id') id: string, @Body() dto: AssignOrderDto) {
    return this.service.assignOrder(id, dto)
  }

  @Get('admin/errand/orders/:id/timeline')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '订单时间线' })
  getOrderTimeline(@Param('id') id: string) {
    return this.service.getOrderTimeline(id)
  }

  // ==================== Fee Config ====================

  @Get('admin/errand/fee-config')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '获取计费配置' })
  getFeeConfig(@Query('regionId') regionId: string) {
    return this.service.getFeeConfig(regionId)
  }

  @Put('admin/errand/fee-config')
  @RequirePermission('errand:config')
  @ApiOperation({ summary: '更新计费配置' })
  updateFeeConfig(@Query('regionId') regionId: string, @Body() dto: UpdateFeeConfigDto) {
    return this.service.updateFeeConfig(regionId, dto)
  }

  // ==================== Page Config ====================

  @Get('admin/errand/page-config')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '获取页面配置' })
  getPageConfig(@Query('regionId') regionId: string) {
    return this.service.getPageConfig(regionId)
  }

  @Put('admin/errand/page-config')
  @RequirePermission('errand:config')
  @ApiOperation({ summary: '更新页面配置' })
  updatePageConfig(@Query('regionId') regionId: string, @Body() dto: UpdatePageConfigDto) {
    return this.service.updatePageConfig(regionId, dto)
  }

  // ==================== Reward/Punish ====================

  @Get('admin/errand/reward-punish')
  @RequirePermission('errand:view')
  @ApiOperation({ summary: '获取奖惩配置' })
  getRewardPunish(@Query('regionId') regionId: string) {
    return this.service.getRewardPunish(regionId)
  }

  @Put('admin/errand/reward-punish')
  @RequirePermission('errand:config')
  @ApiOperation({ summary: '更新奖惩配置' })
  updateRewardPunish(@Query('regionId') regionId: string, @Body() dto: UpdateRewardPunishDto) {
    return this.service.updateRewardPunish(regionId, dto)
  }
}
