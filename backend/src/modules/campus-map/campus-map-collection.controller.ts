import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import {
  CreateCollectionMarkerDto,
  CreateCollectionTaskDto,
  FinishCollectionSessionDto,
  MarkerTemplateDto,
  StartCollectionSessionDto,
  UpdateCollectionTaskDto,
  UploadPointBatchDto,
} from './campus-map-collection.contract';
import { CampusMapCollectionService } from './campus-map-collection.service';

type AuthenticatedRequest = Request & { user?: { sub?: string; isAdmin?: boolean } };

@ApiTags('校园地图现场采集')
@Controller()
export class CampusMapCollectionController {
  constructor(
    private readonly service: CampusMapCollectionService,
    private readonly scope: AdminDataScopeService,
  ) {}

  @Get('admin/campus-map/collections/:regionId/tasks')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async listTasks(
    @Param('regionId') regionId: string,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertAdminRegion(req, regionId);
    return this.service.listTasks(regionId, { status, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Post('admin/campus-map/collections/:regionId/tasks')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async createTask(
    @Param('regionId') regionId: string,
    @Body() dto: CreateCollectionTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = await this.assertAdminRegion(req, regionId);
    return this.service.createTask(regionId, dto, adminId);
  }

  @Get('admin/campus-map/collections/:regionId/tasks/:taskId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async getTask(
    @Param('regionId') regionId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertAdminRegion(req, regionId);
    return this.service.getTask(regionId, taskId);
  }

  @Get('admin/campus-map/collections/:regionId/tasks/:taskId/sessions/:sessionId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async getSession(
    @Param('regionId') regionId: string,
    @Param('taskId') taskId: string,
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertAdminRegion(req, regionId);
    return this.service.getSession(regionId, taskId, sessionId);
  }

  @Patch('admin/campus-map/collections/:regionId/tasks/:taskId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async updateTask(
    @Param('regionId') regionId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateCollectionTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = await this.assertAdminRegion(req, regionId);
    return this.service.updateTask(regionId, taskId, dto, adminId);
  }

  @Post('admin/campus-map/collections/:regionId/tasks/:taskId/access-code')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async rotateAccessCode(
    @Param('regionId') regionId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = await this.assertAdminRegion(req, regionId);
    return this.service.rotateAccessCode(regionId, taskId, adminId);
  }

  @Get('admin/campus-map/collections/:regionId/templates')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async listTemplates(@Param('regionId') regionId: string, @Req() req: AuthenticatedRequest) {
    await this.assertAdminRegion(req, regionId);
    return this.service.listTemplates(regionId);
  }

  @Post('admin/campus-map/collections/:regionId/templates')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async createTemplate(
    @Param('regionId') regionId: string,
    @Body() dto: MarkerTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = await this.assertAdminRegion(req, regionId);
    return this.service.createTemplate(regionId, dto, adminId);
  }

  @Patch('admin/campus-map/collections/:regionId/templates/:templateId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async updateTemplate(
    @Param('regionId') regionId: string,
    @Param('templateId') templateId: string,
    @Body() dto: Partial<MarkerTemplateDto>,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = await this.assertAdminRegion(req, regionId);
    return this.service.updateTemplate(regionId, templateId, dto, adminId);
  }

  @Get('campus-map/collection/context')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  resolveCollectorContext(@Query('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.service.resolveCollectorContext(code, this.collectorUserId(req));
  }

  @Post('campus-map/collection/tasks/:taskId/sessions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  startSession(
    @Param('taskId') taskId: string,
    @Body() dto: StartCollectionSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.startSession(taskId, this.collectorUserId(req), dto);
  }

  @Put('campus-map/collection/sessions/:sessionId/batches/:batchNo')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  uploadPointBatch(
    @Param('sessionId') sessionId: string,
    @Param('batchNo') batchNo: string,
    @Body() dto: UploadPointBatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.uploadPointBatch(sessionId, this.collectorUserId(req), Number(batchNo), dto);
  }

  @Post('campus-map/collection/sessions/:sessionId/markers')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createMarker(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateCollectionMarkerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createMarker(sessionId, this.collectorUserId(req), dto);
  }

  @Post('campus-map/collection/sessions/:sessionId/finish')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  finishSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: FinishCollectionSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.finishSession(sessionId, this.collectorUserId(req), dto);
  }

  private async assertAdminRegion(req: AuthenticatedRequest, regionId: string) {
    const adminId = req.user?.sub;
    await this.scope.assertRegionAccess(adminId, regionId);
    return adminId as string;
  }

  private collectorUserId(req: AuthenticatedRequest) {
    if (!req.user?.sub || req.user.isAdmin) throw new ForbiddenException('采集端不接受管理员登录态');
    return req.user.sub;
  }
}
