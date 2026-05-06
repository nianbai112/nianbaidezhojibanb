import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { RatingAdminService } from './rating.admin.service';
import {
  RatingCategoryQueryDto, CreateRatingCategoryDto, UpdateRatingCategoryDto,
  RatingItemQueryDto, CreateRatingItemDto, UpdateRatingItemDto,
  RatingRecordQueryDto,
  RatingReplyQueryDto, RatingReplyAuditDto,
  RatingSettingsQueryDto, UpdateRatingSettingsDto,
} from './dto/rating.admin.dto';

@ApiTags('Admin - Rating')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/ratings')
export class RatingAdminController {
  constructor(private readonly service: RatingAdminService) {}

  // ==================== Dashboard ====================

  @Get('dashboard')
  @RequirePermission('rating:view')
  @ApiOperation({ summary: '评分系统概览' })
  getDashboard(@Query('regionId') regionId?: string) {
    return this.service.getDashboard(regionId);
  }

  // ==================== Region Settings ====================

  @Get('settings')
  @RequirePermission('rating:config')
  @ApiOperation({ summary: '区域评分设置列表' })
  getSettings(@Query() query: RatingSettingsQueryDto) {
    return this.service.getSettings(query);
  }

  @Get('settings/:regionId')
  @RequirePermission('rating:config')
  @ApiOperation({ summary: '获取单个区域评分设置' })
  getSetting(@Param('regionId') regionId: string) {
    return this.service.getSetting(regionId);
  }

  @Put('settings/:regionId')
  @RequirePermission('rating:config')
  @ApiOperation({ summary: '更新区域评分设置' })
  updateSetting(@Param('regionId') regionId: string, @Body() dto: UpdateRatingSettingsDto) {
    return this.service.updateSetting(regionId, dto);
  }

  // ==================== Category CRUD ====================

  @Get('categories')
  @RequirePermission('rating:view')
  @ApiOperation({ summary: '评分分类列表' })
  getCategories(@Query() query: RatingCategoryQueryDto) {
    return this.service.getCategories(query);
  }

  @Post('categories')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '创建评分分类' })
  createCategory(@Body() dto: CreateRatingCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Put('categories/:id')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '更新评分分类' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateRatingCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '删除评分分类' })
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  // ==================== Item CRUD ====================

  @Get('items')
  @RequirePermission('rating:view')
  @ApiOperation({ summary: '评分项目列表' })
  getItems(@Query() query: RatingItemQueryDto) {
    return this.service.getItems(query);
  }

  @Post('items')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '创建评分项目' })
  createItem(@Body() dto: CreateRatingItemDto) {
    return this.service.createItem(dto);
  }

  @Put('items/:id')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '更新评分项目' })
  updateItem(@Param('id') id: string, @Body() dto: UpdateRatingItemDto) {
    return this.service.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermission('rating:edit')
  @ApiOperation({ summary: '删除评分项目' })
  deleteItem(@Param('id') id: string) {
    return this.service.deleteItem(id);
  }

  // ==================== Rating Records ====================

  @Get('records')
  @RequirePermission('rating:view')
  @ApiOperation({ summary: '评分记录列表' })
  getRecords(@Query() query: RatingRecordQueryDto) {
    return this.service.getRecords(query);
  }

  @Delete('records/:id')
  @RequirePermission('rating:audit')
  @ApiOperation({ summary: '删除评分记录' })
  deleteRecord(@Param('id') id: string) {
    return this.service.deleteRecord(id);
  }

  // ==================== Replies ====================

  @Get('replies')
  @RequirePermission('rating:view')
  @ApiOperation({ summary: '回复列表' })
  getReplies(@Query() query: RatingReplyQueryDto) {
    return this.service.getReplies(query);
  }

  @Put('replies/:id/audit')
  @RequirePermission('rating:audit')
  @ApiOperation({ summary: '审核回复' })
  auditReply(@Param('id') id: string, @Body() dto: RatingReplyAuditDto) {
    return this.service.auditReply(id, dto);
  }

  @Delete('replies/:id')
  @RequirePermission('rating:audit')
  @ApiOperation({ summary: '删除回复' })
  deleteReply(@Param('id') id: string) {
    return this.service.deleteReply(id);
  }
}
