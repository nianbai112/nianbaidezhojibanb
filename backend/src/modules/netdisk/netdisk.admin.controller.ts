import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NetDiskAdminService } from './netdisk.admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('Admin - NetDisk')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/netdisk')
export class NetDiskAdminController {
  constructor(private readonly service: NetDiskAdminService) {}

  // ==================== 分类管理 ====================
  @Get('categories')
  @ApiOperation({ summary: '获取分类列表' })
  @RequirePermission('netdisk:view')
  getCategoryList(@Query() query: any) {
    return this.service.getCategoryList(query);
  }

  @Post('categories')
  @ApiOperation({ summary: '创建分类' })
  @RequirePermission('netdisk:edit')
  createCategory(@Body() dto: any) {
    return this.service.createCategory(dto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: '更新分类' })
  @RequirePermission('netdisk:edit')
  updateCategory(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: '删除分类' })
  @RequirePermission('netdisk:edit')
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  // ==================== 平台管理 ====================
  @Get('platforms')
  @ApiOperation({ summary: '获取平台列表' })
  @RequirePermission('netdisk:view')
  getPlatformList(@Query() query: any) {
    return this.service.getPlatformList(query);
  }

  @Post('platforms')
  @ApiOperation({ summary: '创建平台' })
  @RequirePermission('netdisk:edit')
  createPlatform(@Body() dto: any) {
    return this.service.createPlatform(dto);
  }

  @Put('platforms/:id')
  @ApiOperation({ summary: '更新平台' })
  @RequirePermission('netdisk:edit')
  updatePlatform(@Param('id') id: string, @Body() dto: any) {
    return this.service.updatePlatform(id, dto);
  }

  @Delete('platforms/:id')
  @ApiOperation({ summary: '删除平台' })
  @RequirePermission('netdisk:edit')
  deletePlatform(@Param('id') id: string) {
    return this.service.deletePlatform(id);
  }

  // ==================== 资源管理 ====================
  @Get('resources')
  @ApiOperation({ summary: '获取资源列表' })
  @RequirePermission('netdisk:view')
  getResourceList(@Query() query: any) {
    return this.service.getResourceList(query);
  }

  @Get('resources/:id')
  @ApiOperation({ summary: '获取资源详情' })
  @RequirePermission('netdisk:view')
  getResourceDetail(@Param('id') id: string) {
    return this.service.getResourceDetail(id);
  }

  @Post('resources')
  @ApiOperation({ summary: '创建资源' })
  @RequirePermission('netdisk:edit')
  createResource(@Body() dto: any) {
    return this.service.createResource(dto);
  }

  @Put('resources/:id')
  @ApiOperation({ summary: '更新资源' })
  @RequirePermission('netdisk:edit')
  updateResource(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateResource(id, dto);
  }

  @Put('resources/:id/status')
  @ApiOperation({ summary: '更新资源状态（审核/上下架）' })
  @RequirePermission('netdisk:audit')
  updateResourceStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateResourceStatus(id, status);
  }

  @Delete('resources/:id')
  @ApiOperation({ summary: '删除资源' })
  @RequirePermission('netdisk:audit')
  deleteResource(@Param('id') id: string) {
    return this.service.deleteResource(id);
  }

  // ==================== 评论管理 ====================
  @Get('comments')
  @ApiOperation({ summary: '获取评论列表' })
  @RequirePermission('netdisk:view')
  getCommentList(@Query() query: any) {
    return this.service.getCommentList(query);
  }

  @Put('comments/:id/status')
  @ApiOperation({ summary: '更新评论状态' })
  @RequirePermission('netdisk:audit')
  updateCommentStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateCommentStatus(id, status);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: '删除评论' })
  @RequirePermission('netdisk:audit')
  deleteComment(@Param('id') id: string) {
    return this.service.deleteComment(id);
  }

  // ==================== 下载记录 ====================
  @Get('downloads')
  @ApiOperation({ summary: '获取下载记录' })
  @RequirePermission('netdisk:view')
  getDownloadList(@Query() query: any) {
    return this.service.getDownloadList(query);
  }

  // ==================== 收益配置 ====================
  @Get('profit-config')
  @ApiOperation({ summary: '获取收益配置' })
  @RequirePermission('netdisk:config')
  getProfitConfig(@Query('regionId') regionId: string) {
    return this.service.getProfitConfig(regionId);
  }

  @Put('profit-config')
  @ApiOperation({ summary: '更新收益配置' })
  @RequirePermission('netdisk:config')
  upsertProfitConfig(@Query('regionId') regionId: string, @Body() dto: any) {
    return this.service.upsertProfitConfig(regionId, dto);
  }

  // ==================== 举报管理 ====================
  @Get('reports')
  @ApiOperation({ summary: '获取举报列表' })
  @RequirePermission('netdisk:view')
  getReportList(@Query() query: any) {
    return this.service.getReportList(query);
  }

  @Put('reports/:id')
  @ApiOperation({ summary: '处理举报' })
  @RequirePermission('netdisk:audit')
  handleReport(@Param('id') id: string, @Body('status') status: string) {
    return this.service.handleReport(id, status);
  }
}
