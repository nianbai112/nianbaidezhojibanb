import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtGuard } from '../../guards/jwt.guard'
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard'
import { RequirePermission } from '../../decorators/require-permission.decorator'
import { DatingAdminService } from './dating-admin.service'
import {
  DatingConfigQueryDto, UpdateDatingConfigDto,
  DatingProfileQueryDto, AuditDatingProfileDto,
  DatingMatchQueryDto,
  DatingPackageQueryDto, CreateDatingPackageDto, UpdateDatingPackageDto,
  DatingOrderQueryDto, RefundDatingOrderDto,
  DatingReportQueryDto, HandleDatingReportDto,
  DatingCacheClearDto,
} from './dto/dating-admin.dto'

@ApiTags('Admin - Dating')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/dating')
export class DatingAdminController {
  constructor(private readonly service: DatingAdminService) {}

  // ==================== Config ====================

  @Get('configs')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '交友配置列表' })
  getConfigs(@Query() q: DatingConfigQueryDto) {
    return this.service.getConfigs(q)
  }

  @Put('configs/:id')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '更新交友配置' })
  updateConfig(@Param('id') id: string, @Body() dto: UpdateDatingConfigDto) {
    return this.service.updateConfig(id, dto)
  }

  // ==================== Profile ====================

  @Get('profiles')
  @RequirePermission('dating:view')
  @ApiOperation({ summary: '交友资料列表' })
  getProfiles(@Query() q: DatingProfileQueryDto) {
    return this.service.getProfiles(q)
  }

  @Put('profiles/:id/audit')
  @RequirePermission('dating:audit')
  @ApiOperation({ summary: '审核交友资料' })
  auditProfile(@Param('id') id: string, @Body() dto: AuditDatingProfileDto) {
    return this.service.auditProfile(id, dto)
  }

  // ==================== Match ====================

  @Get('matches')
  @RequirePermission('dating:view')
  @ApiOperation({ summary: '匹配记录列表' })
  getMatches(@Query() q: DatingMatchQueryDto) {
    return this.service.getMatches(q)
  }

  // ==================== Package ====================

  @Get('packages')
  @RequirePermission('dating:view')
  @ApiOperation({ summary: '交友套餐列表' })
  getPackages(@Query() q: DatingPackageQueryDto) {
    return this.service.getPackages(q)
  }

  @Post('packages')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '创建交友套餐' })
  createPackage(@Body() dto: CreateDatingPackageDto) {
    return this.service.createPackage(dto)
  }

  @Put('packages/:id')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '更新交友套餐' })
  updatePackage(@Param('id') id: string, @Body() dto: UpdateDatingPackageDto) {
    return this.service.updatePackage(id, dto)
  }

  @Delete('packages/:id')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '删除交友套餐' })
  deletePackage(@Param('id') id: string) {
    return this.service.deletePackage(id)
  }

  // ==================== Order ====================

  @Get('orders')
  @RequirePermission('dating:view')
  @ApiOperation({ summary: '交友订单列表' })
  getOrders(@Query() q: DatingOrderQueryDto) {
    return this.service.getOrders(q)
  }

  @Post('orders/:id/refund')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '退款交友订单' })
  refundOrder(@Param('id') id: string, @Body() dto: RefundDatingOrderDto) {
    return this.service.refundOrder(id, dto)
  }

  // ==================== Report ====================

  @Get('reports')
  @RequirePermission('dating:audit')
  @ApiOperation({ summary: '举报列表' })
  getReports(@Query() q: DatingReportQueryDto) {
    return this.service.getReports(q)
  }

  @Post('reports/:id/handle')
  @RequirePermission('dating:audit')
  @ApiOperation({ summary: '处理举报' })
  handleReport(@Param('id') id: string, @Body() dto: HandleDatingReportDto) {
    return this.service.handleReport(id, dto)
  }

  // ==================== Cache ====================

  @Get('cache')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '查看缓存信息' })
  getCacheInfo() {
    return this.service.getCacheInfo()
  }

  @Post('cache/clear')
  @RequirePermission('dating:config')
  @ApiOperation({ summary: '清除缓存' })
  clearCache(@Body() dto: DatingCacheClearDto) {
    return this.service.clearCache(dto)
  }
}
