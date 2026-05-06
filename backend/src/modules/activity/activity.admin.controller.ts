import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { ActivityAdminService } from './activity.admin.service';
import {
  ActivityQueryDto, CreateActivityDto, UpdateActivityDto,
  ActivityTypeQueryDto, CreateActivityTypeDto, UpdateActivityTypeDto,
  ActivityPackageQueryDto, CreateActivityPackageDto, UpdateActivityPackageDto,
  ActivityOrderQueryDto, ActivityOrderRefundAuditDto,
  RewardQueryDto, CreateActivityRewardDto, UpdateActivityRewardDto,
} from './dto/activity.admin.dto';

@ApiTags('Admin - Activity')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/activities')
export class ActivityAdminController {
  constructor(private readonly service: ActivityAdminService) {}

  // ==================== Activities CRUD ====================

  @Get()
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '活动列表' })
  getActivities(@Query() query: ActivityQueryDto) {
    return this.service.getActivities(query);
  }

  @Post()
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '创建活动' })
  createActivity(@Body() dto: CreateActivityDto) {
    return this.service.createActivity(dto);
  }

  // ==================== Activity Types (static before :id) ====================

  @Get('types/list')
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '活动类型列表' })
  getTypes(@Query() query: ActivityTypeQueryDto) {
    return this.service.getTypes(query);
  }

  @Post('types')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '创建活动类型' })
  createType(@Body() dto: CreateActivityTypeDto) {
    return this.service.createType(dto);
  }

  @Put('types/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '更新活动类型' })
  updateType(@Param('id') id: string, @Body() dto: UpdateActivityTypeDto) {
    return this.service.updateType(id, dto);
  }

  @Delete('types/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '删除活动类型' })
  deleteType(@Param('id') id: string) {
    return this.service.deleteType(id);
  }

  // ==================== Packages ====================

  @Get('packages/list')
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '套餐列表' })
  getPackages(@Query() query: ActivityPackageQueryDto) {
    return this.service.getPackages(query);
  }

  @Post('packages')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '创建套餐' })
  createPackage(@Body() dto: CreateActivityPackageDto) {
    return this.service.createPackage(dto);
  }

  @Put('packages/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '更新套餐' })
  updatePackage(@Param('id') id: string, @Body() dto: UpdateActivityPackageDto) {
    return this.service.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '删除套餐' })
  deletePackage(@Param('id') id: string) {
    return this.service.deletePackage(id);
  }

  // ==================== Orders ====================

  @Get('orders')
  @RequirePermission('activity:order')
  @ApiOperation({ summary: '活动订单列表' })
  getOrders(@Query() query: ActivityOrderQueryDto) {
    return this.service.getOrders(query);
  }

  @Get('orders/:id')
  @RequirePermission('activity:order')
  @ApiOperation({ summary: '订单详情' })
  getOrderDetail(@Param('id') id: string) {
    return this.service.getOrderDetail(id);
  }

  @Put('orders/:id/refund-audit')
  @RequirePermission('activity:audit')
  @ApiOperation({ summary: '退款审核' })
  auditRefund(@Param('id') id: string, @Body() dto: ActivityOrderRefundAuditDto) {
    return this.service.auditRefund(id, dto);
  }

  // ==================== Rewards ====================

  @Get('rewards')
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '奖励列表' })
  getRewards(@Query() query: RewardQueryDto) {
    return this.service.getRewards(query);
  }

  @Post('rewards')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '创建奖励' })
  createReward(@Body() dto: CreateActivityRewardDto) {
    return this.service.createReward(dto);
  }

  @Put('rewards/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '更新奖励' })
  updateReward(@Param('id') id: string, @Body() dto: UpdateActivityRewardDto) {
    return this.service.updateReward(id, dto);
  }

  @Delete('rewards/:id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '删除奖励' })
  deleteReward(@Param('id') id: string) {
    return this.service.deleteReward(id);
  }

  // ==================== Dynamic :id routes (LAST) ====================

  @Get(':id')
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '活动详情' })
  getActivityDetail(@Param('id') id: string) {
    return this.service.getActivityDetail(id);
  }

  @Put(':id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '更新活动' })
  updateActivity(@Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.service.updateActivity(id, dto);
  }

  @Delete(':id')
  @RequirePermission('activity:edit')
  @ApiOperation({ summary: '删除活动' })
  deleteActivity(@Param('id') id: string) {
    return this.service.deleteActivity(id);
  }

  @Get(':id/participants')
  @RequirePermission('activity:view')
  @ApiOperation({ summary: '活动参与者列表' })
  getParticipants(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getParticipants(id, page, limit);
  }
}
