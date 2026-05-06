import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GroupBuyService } from './group-buy.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  GroupBuyQueryDto,
  CreateGroupBuyCategoryDto,
  UpdateGroupBuyCategoryDto,
  CreateGroupBuyPackageDto,
  UpdateGroupBuyPackageDto,
  GroupBuyConfigDto,
  VerifyOrderDto,
  RefundOrderDto,
  ReplyReviewDto,
  ReviewAuditDto,
} from './dto/group-buy.admin.dto';

@ApiTags('Admin - Group Buy')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/group-buy')
export class GroupBuyAdminController {
  constructor(private readonly groupBuyService: GroupBuyService) {}

  // ================= 概览统计 (Overview) =================
  @Get('stats')
  @ApiOperation({ summary: '获取团购数据统计' })
  @RequirePermission('groupbuy:view')
  getAdminStats(@Query('regionId') regionId?: string) {
    return this.groupBuyService.getAdminStats(regionId);
  }

  // ================= 区域设置 (Config) =================
  @Get('config')
  @ApiOperation({ summary: '获取区域团购配置' })
  @RequirePermission('groupbuy:view')
  getAdminConfig(@Query('regionId') regionId: string) {
    return this.groupBuyService.getAdminConfig(regionId);
  }

  @Put('config')
  @ApiOperation({ summary: '更新区域团购配置' })
  @RequirePermission('groupbuy:config')
  updateAdminConfig(@Query('regionId') regionId: string, @Body() dto: GroupBuyConfigDto) {
    return this.groupBuyService.updateAdminConfig(regionId, dto);
  }

  // ================= 分类管理 (Category) =================
  @Get('categories')
  @ApiOperation({ summary: '获取分类列表' })
  @RequirePermission('groupbuy:view')
  getAdminCategories(@Query() query: GroupBuyQueryDto) {
    return this.groupBuyService.getAdminCategories(query);
  }

  @Post('categories')
  @ApiOperation({ summary: '创建分类' })
  @RequirePermission('groupbuy:edit')
  createCategory(@Body() dto: CreateGroupBuyCategoryDto) {
    return this.groupBuyService.createCategory(dto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: '更新分类' })
  @RequirePermission('groupbuy:edit')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateGroupBuyCategoryDto) {
    return this.groupBuyService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: '删除分类' })
  @RequirePermission('groupbuy:edit')
  deleteCategory(@Param('id') id: string) {
    return this.groupBuyService.deleteCategory(id);
  }

  // ================= 套餐管理 (Package) =================
  @Get('packages')
  @ApiOperation({ summary: '获取套餐列表' })
  @RequirePermission('groupbuy:view')
  getAdminPackages(@Query() query: GroupBuyQueryDto) {
    return this.groupBuyService.getAdminPackages(query);
  }

  @Post('packages')
  @ApiOperation({ summary: '创建套餐' })
  @RequirePermission('groupbuy:edit')
  createPackage(@Body() dto: CreateGroupBuyPackageDto) {
    return this.groupBuyService.createPackage(dto);
  }

  @Put('packages/:id')
  @ApiOperation({ summary: '更新套餐' })
  @RequirePermission('groupbuy:edit')
  updatePackage(@Param('id') id: string, @Body() dto: UpdateGroupBuyPackageDto) {
    return this.groupBuyService.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  @ApiOperation({ summary: '删除套餐' })
  @RequirePermission('groupbuy:edit')
  deletePackage(@Param('id') id: string) {
    return this.groupBuyService.deletePackage(id);
  }

  // ================= 订单管理 (Order) =================
  @Get('orders')
  @ApiOperation({ summary: '获取订单列表' })
  @RequirePermission('groupbuy:view')
  getAdminOrders(@Query() query: GroupBuyQueryDto) {
    return this.groupBuyService.getAdminOrders(query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: '获取订单详情' })
  @RequirePermission('groupbuy:view')
  getOrderDetail(@Param('id') id: string) {
    return this.groupBuyService.getOrderDetail(id);
  }

  @Post('orders/:id/verify')
  @ApiOperation({ summary: '核销订单' })
  @RequirePermission('groupbuy:order')
  verifyOrder(@Param('id') id: string, @Body() dto: VerifyOrderDto) {
    return this.groupBuyService.verifyOrder(id, dto.code);
  }

  @Post('orders/:id/refund')
  @ApiOperation({ summary: '退款' })
  @RequirePermission('groupbuy:order')
  refundOrder(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    return this.groupBuyService.refundOrder(id, dto.reason, dto.amount);
  }

  // ================= 评价管理 (Review) =================
  @Get('reviews')
  @ApiOperation({ summary: '获取评价列表' })
  @RequirePermission('groupbuy:view')
  getAdminReviews(@Query() query: GroupBuyQueryDto) {
    return this.groupBuyService.getAdminReviews(query);
  }

  @Put('reviews/:id/audit')
  @ApiOperation({ summary: '审核/处理评价' })
  @RequirePermission('groupbuy:edit')
  auditReview(@Param('id') id: string, @Body() dto: ReviewAuditDto) {
    return this.groupBuyService.auditReview(id, dto.status);
  }

  @Put('reviews/:id/reply')
  @ApiOperation({ summary: '回复评价' })
  @RequirePermission('groupbuy:edit')
  replyReview(@Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.groupBuyService.replyReview(id, dto.reply);
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: '删除评价' })
  @RequirePermission('groupbuy:edit')
  deleteReview(@Param('id') id: string) {
    return this.groupBuyService.deleteReview(id);
  }
}
