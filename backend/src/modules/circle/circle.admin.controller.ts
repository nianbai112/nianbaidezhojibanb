import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { CircleService } from './circle.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('Admin - Community')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/circles')
export class CircleAdminController {
  constructor(private readonly circleService: CircleService) {}

  // ---- 注意：字面路由必须定义在参数化路由（:circleId）之前，避免被通配捕获 ----

  // ================= 区域配置（字面路由） =================
  @Get('config')
  @ApiOperation({ summary: '获取社群区域配置' })
  @RequirePermission('community:config')
  getAdminCircleConfig(@Query('regionId') regionId: string, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleConfig(regionId, operatorId);
  }

  @Put('config')
  @ApiOperation({ summary: '更新社群区域配置' })
  @RequirePermission('community:config')
  updateAdminCircleConfig(
    @Query('regionId') regionId: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.updateAdminCircleConfig(regionId, dto, operatorId, req.ip);
  }

  // ================= 购买记录（字面路由） =================
  @Get('payments')
  @ApiOperation({ summary: '获取购买记录列表' })
  @RequirePermission('community:view')
  getAdminPayments(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCirclePayments(query, operatorId);
  }

  @Get(':circleId/topic-headers')
  @ApiOperation({ summary: '获取圈子话题分栏' })
  @RequirePermission('community:view')
  getAdminCircleTopicHeaders(@Param('circleId') circleId: string, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleTopicHeaders(circleId, operatorId);
  }

  @Post(':circleId/topic-headers/batch-create')
  @ApiOperation({ summary: '保存圈子话题分栏和话题' })
  @RequirePermission('community:edit')
  adminSaveCircleTopicHeaders(
    @Param('circleId') circleId: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminSaveCircleTopicHeaders(circleId, dto, operatorId, req.ip);
  }

  @Put(':circleId/topic-headers/:headerId')
  @ApiOperation({ summary: '更新圈子话题分栏' })
  @RequirePermission('community:edit')
  adminUpdateCircleTopicHeader(
    @Param('circleId') circleId: string,
    @Param('headerId') headerId: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminUpdateCircleTopicHeader(circleId, headerId, dto, operatorId, req.ip);
  }

  @Delete(':circleId/topic-headers/:headerId')
  @ApiOperation({ summary: '删除圈子话题分栏' })
  @RequirePermission('community:edit')
  adminDeleteCircleTopicHeader(
    @Param('circleId') circleId: string,
    @Param('headerId') headerId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminDeleteCircleTopicHeader(circleId, headerId, operatorId, req.ip);
  }

  @Delete(':circleId/topic-headers/:headerId/topics/:topicId')
  @ApiOperation({ summary: '解绑圈子分栏话题' })
  @RequirePermission('community:edit')
  adminUnbindCircleTopic(
    @Param('circleId') circleId: string,
    @Param('headerId') headerId: string,
    @Param('topicId') topicId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminUnbindCircleTopic(circleId, headerId, topicId, operatorId, req.ip);
  }

  // ================= 运营总览/审核中心（字面路由） =================
  @Get('operations/overview')
  @ApiOperation({ summary: '圈子运营总览' })
  @RequirePermission('community:view')
  getAdminCircleOperationsOverview(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleOperationsOverview(query, operatorId);
  }

  @Get('audit/list')
  @ApiOperation({ summary: '圈子创建审核列表' })
  @RequirePermission('community:view')
  getAdminCircleAuditList(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleAuditList(query, operatorId);
  }

  @Put('audit/:circleId')
  @ApiOperation({ summary: '审核圈子创建申请' })
  @RequirePermission('community:edit')
  adminAuditCircle(
    @Param('circleId') circleId: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminAuditCircle(circleId, dto, operatorId, req.ip);
  }

  // ================= 成员管理（字面路由） =================
  @Delete('members/:memberId')
  @ApiOperation({ summary: '踢出成员' })
  @RequirePermission('community:edit')
  adminRemoveMember(@Param('memberId') memberId: string, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminRemoveMember(memberId, operatorId, req.ip);
  }

  // ================= 社群列表 =================
  @Get()
  @ApiOperation({ summary: '获取社群列表（后台）' })
  @RequirePermission('community:view')
  getAdminCircles(@Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircles(query, operatorId);
  }

  @Get('stats')
  @ApiOperation({ summary: '社群统计' })
  @RequirePermission('community:view')
  getAdminCirclesStats(@CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCirclesStats(operatorId);
  }

  @Post()
  @ApiOperation({ summary: '创建社群' })
  @RequirePermission('community:edit')
  adminCreateCircle(@Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminCreateCircle(dto, operatorId, req.ip);
  }

  // ================= 社群详情/操作（参数化路由） =================
  @Get(':circleId')
  @ApiOperation({ summary: '获取社群详情' })
  @RequirePermission('community:view')
  getAdminCircleDetail(@Param('circleId') circleId: string, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleDetail(circleId, operatorId);
  }

  @Get(':circleId/members')
  @ApiOperation({ summary: '获取社群成员列表' })
  @RequirePermission('community:view')
  getAdminCircleMembers(@Param('circleId') circleId: string, @Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleMembers(circleId, query, operatorId);
  }

  @Get(':circleId/posts')
  @ApiOperation({ summary: '获取圈内帖子列表' })
  @RequirePermission('community:view')
  getAdminCirclePosts(@Param('circleId') circleId: string, @Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCirclePosts(circleId, query, operatorId);
  }

  @Get(':circleId/reports')
  @ApiOperation({ summary: '获取圈内举报列表' })
  @RequirePermission('community:view')
  getAdminCircleReports(@Param('circleId') circleId: string, @Query() query: any, @CurrentUser('sub') operatorId: string) {
    return this.circleService.getAdminCircleReports(circleId, query, operatorId);
  }

  @Put(':circleId/transfer-owner')
  @ApiOperation({ summary: '转让圈主' })
  @RequirePermission('community:edit')
  adminTransferOwner(
    @Param('circleId') circleId: string,
    @Body() dto: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminTransferOwner(circleId, dto, operatorId, req.ip);
  }

  @Put(':circleId/members/:memberId/role')
  @ApiOperation({ summary: '调整圈子成员角色' })
  @RequirePermission('community:edit')
  adminUpdateMemberRole(@Param('memberId') memberId: string, @Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminUpdateMemberRole(memberId, dto, operatorId, req.ip);
  }

  @Put(':circleId/members/:memberId/mute')
  @ApiOperation({ summary: '圈内禁言成员' })
  @RequirePermission('community:edit')
  adminMuteMember(@Param('memberId') memberId: string, @Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminMuteMember(memberId, dto, operatorId, req.ip);
  }

  @Put(':circleId/members/:memberId/unmute')
  @ApiOperation({ summary: '解除圈内禁言' })
  @RequirePermission('community:edit')
  adminUnmuteMember(@Param('memberId') memberId: string, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminUnmuteMember(memberId, operatorId, req.ip);
  }

  @Put(':circleId/members/:memberId/ban')
  @ApiOperation({ summary: '拉黑圈子成员' })
  @RequirePermission('community:edit')
  adminBanMember(@Param('memberId') memberId: string, @Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminBanMember(memberId, dto, operatorId, req.ip);
  }

  @Put(':circleId/status')
  @ApiOperation({ summary: '启用/禁用社群' })
  @RequirePermission('community:edit')
  adminUpdateCircleStatus(
    @Param('circleId') circleId: string,
    @Body('status') status: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.circleService.adminUpdateCircle(circleId, { status }, operatorId, req.ip);
  }

  @Put(':circleId/dissolve')
  @ApiOperation({ summary: '解散社群' })
  @RequirePermission('community:edit')
  adminDissolveCircle(@Param('circleId') circleId: string, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminDissolveCircle(circleId, operatorId, req.ip);
  }

  @Put(':circleId')
  @ApiOperation({ summary: '修改社群信息' })
  @RequirePermission('community:edit')
  adminUpdateCircle(@Param('circleId') circleId: string, @Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminUpdateCircle(circleId, dto, operatorId, req.ip);
  }

  @Delete(':circleId')
  @ApiOperation({ summary: '删除社群' })
  @RequirePermission('community:edit')
  adminDeleteCircle(@Param('circleId') circleId: string, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.circleService.adminDeleteCircle(circleId, operatorId, req.ip);
  }
}
