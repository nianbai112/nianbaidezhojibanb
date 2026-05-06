import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PunchInService } from './punch-in.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  CreatePunchCategoryDto,
  UpdatePunchCategoryDto,
  CreatePunchLocationDto,
  UpdatePunchLocationDto,
  UpdatePunchConfigDto,
  PunchQueryDto,
} from './dto/punch-in.admin.dto';

@ApiTags('后台管理-打卡')
@Controller()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class PunchInAdminController {
  constructor(private readonly punchInService: PunchInService) {}

  // ==================== 分类管理 ====================

  @Get('admin/punch/categories')
  @ApiOperation({ summary: '获取打卡分类列表' })
  @RequirePermission('punch:view')
  getCategories(@Query() query: PunchQueryDto) {
    return this.punchInService.getCategories(query);
  }

  @Get('admin/punch/categories/:id')
  @ApiOperation({ summary: '获取打卡分类详情' })
  @RequirePermission('punch:view')
  getCategory(@Param('id') id: string) {
    return this.punchInService.getCategory(id);
  }

  @Post('admin/punch/categories')
  @ApiOperation({ summary: '新增打卡分类' })
  @RequirePermission('punch:edit')
  createCategory(@Body() dto: CreatePunchCategoryDto) {
    return this.punchInService.createCategory(dto);
  }

  @Put('admin/punch/categories/:id')
  @ApiOperation({ summary: '编辑打卡分类' })
  @RequirePermission('punch:edit')
  updateCategory(@Param('id') id: string, @Body() dto: UpdatePunchCategoryDto) {
    return this.punchInService.updateCategory(id, dto);
  }

  @Delete('admin/punch/categories/:id')
  @ApiOperation({ summary: '删除打卡分类' })
  @RequirePermission('punch:edit')
  deleteCategory(@Param('id') id: string) {
    return this.punchInService.deleteCategory(id);
  }

  // ==================== 地点管理 ====================

  @Get('admin/punch/locations')
  @ApiOperation({ summary: '获取打卡地点列表' })
  @RequirePermission('punch:view')
  getLocations(@Query() query: any) {
    return this.punchInService.getLocations(query);
  }

  @Get('admin/punch/locations/:id')
  @ApiOperation({ summary: '获取打卡地点详情' })
  @RequirePermission('punch:view')
  getLocation(@Param('id') id: string) {
    return this.punchInService.getLocation(id);
  }

  @Post('admin/punch/locations')
  @ApiOperation({ summary: '新增打卡地点' })
  @RequirePermission('punch:edit')
  createLocation(@Body() dto: CreatePunchLocationDto) {
    return this.punchInService.createLocation(dto);
  }

  @Put('admin/punch/locations/:id')
  @ApiOperation({ summary: '编辑打卡地点' })
  @RequirePermission('punch:edit')
  updateLocation(@Param('id') id: string, @Body() dto: UpdatePunchLocationDto) {
    return this.punchInService.updateLocation(id, dto);
  }

  @Delete('admin/punch/locations/:id')
  @ApiOperation({ summary: '删除打卡地点' })
  @RequirePermission('punch:edit')
  deleteLocation(@Param('id') id: string) {
    return this.punchInService.deleteLocation(id);
  }

  // ==================== 打卡记录 ====================

  @Get('admin/punch/records')
  @ApiOperation({ summary: '获取打卡记录列表' })
  @RequirePermission('punch:view')
  getRecords(@Query() query: any) {
    return this.punchInService.getRecords(query);
  }

  @Get('admin/punch/records/:id')
  @ApiOperation({ summary: '获取打卡记录详情' })
  @RequirePermission('punch:view')
  getRecord(@Param('id') id: string) {
    return this.punchInService.getRecord(id);
  }

  @Delete('admin/punch/records/:id')
  @ApiOperation({ summary: '删除打卡记录' })
  @RequirePermission('punch:audit')
  deleteRecord(@Param('id') id: string) {
    return this.punchInService.deleteRecord(id);
  }

  // ==================== 评论管理 ====================

  @Get('admin/punch/comments')
  @ApiOperation({ summary: '获取打卡评论列表' })
  @RequirePermission('punch:view')
  getComments(@Query() query: any) {
    return this.punchInService.getComments(query);
  }

  @Get('admin/punch/comments/:id')
  @ApiOperation({ summary: '获取打卡评论详情' })
  @RequirePermission('punch:view')
  getComment(@Param('id') id: string) {
    return this.punchInService.getComment(id);
  }

  @Delete('admin/punch/comments/:id')
  @ApiOperation({ summary: '删除打卡评论' })
  @RequirePermission('punch:audit')
  deleteComment(@Param('id') id: string) {
    return this.punchInService.deleteComment(id);
  }

  // ==================== 区域配置 ====================

  @Get('admin/punch/configs')
  @ApiOperation({ summary: '获取区域配置列表' })
  @RequirePermission('punch:config')
  getConfigs(@Query() query: any) {
    return this.punchInService.getConfigs(query);
  }

  @Get('admin/punch/configs/:regionId')
  @ApiOperation({ summary: '获取区域配置详情' })
  @RequirePermission('punch:config')
  getConfig(@Param('regionId') regionId: string) {
    return this.punchInService.getConfig(regionId);
  }

  @Put('admin/punch/configs/:regionId')
  @ApiOperation({ summary: '更新区域配置' })
  @RequirePermission('punch:config')
  updateConfig(@Param('regionId') regionId: string, @Body() dto: UpdatePunchConfigDto) {
    return this.punchInService.updateConfig(regionId, dto);
  }

  @Delete('admin/punch/configs/:regionId')
  @ApiOperation({ summary: '删除区域配置' })
  @RequirePermission('punch:config')
  deleteConfig(@Param('regionId') regionId: string) {
    return this.punchInService.deleteConfig(regionId);
  }

  // ==================== 数据统计 ====================

  @Get('admin/punch/stats/overview')
  @ApiOperation({ summary: '打卡数据总览' })
  @RequirePermission('punch:view')
  getStatsOverview() {
    return this.punchInService.getStatsOverview();
  }

  @Get('admin/punch/stats/trends')
  @ApiOperation({ summary: '打卡趋势统计' })
  @RequirePermission('punch:view')
  getStatsTrends(@Query('days') days?: number) {
    return this.punchInService.getStatsTrends(days || 7);
  }

  @Get('admin/punch/stats/locations')
  @ApiOperation({ summary: '热门打卡地点排行' })
  @RequirePermission('punch:view')
  getStatsLocations(@Query('top') top?: number) {
    return this.punchInService.getStatsLocations(top || 10);
  }
}
