import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CampusMapImportService } from './campus-map-import.service';
import { CampusMapService } from './campus-map.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';

@ApiTags('校园地图')
@Controller()
export class CampusMapController {
  constructor(
    private readonly service: CampusMapService,
    private readonly imports: CampusMapImportService,
    private readonly scope: AdminDataScopeService,
  ) {}

  @Get('campus-map/active')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前区域活动校园地图' })
  getActiveMap(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMap(regionId || camelRegionId);
  }

  @Get('admin/campus-map/project-catalog')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取校园官方项目目录' })
  getProjectCatalog() {
    return this.service.getProjectCatalog();
  }

  @Get('admin/campus-map/converter/status')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '检测校园地图 DWG 转换器状态' })
  getConverterStatus() {
    return this.imports.getConverterStatus();
  }

  @Put('admin/campus-map/converter')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('system:config')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存校园地图 DWG 转换器路径' })
  saveConverterConfig(@Body() dto: { converterPath?: string | null }, @Req() req: Request) {
    return this.imports.saveConverterConfig(dto, (req as any).user?.sub);
  }

  @Get('admin/campus-map/:regionId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台区域校园地图配置' })
  async getAdminRegionMap(@Param('regionId') regionId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.getRegionMap(regionId);
  }

  @Put('admin/campus-map/:regionId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存并发布区域校园地图配置' })
  async upsertAdminRegionMap(@Param('regionId') regionId: string, @Body() dto: Record<string, any>, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.upsertRegionMap(regionId, dto, (req as any).user?.sub);
  }

  @Put('admin/campus-map/:regionId/draft')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存区域校园地图草稿' })
  async saveAdminRegionMapDraft(
    @Param('regionId') regionId: string,
    @Body() dto: Record<string, any>,
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    return this.service.saveDraft(
      regionId,
      dto.config || dto,
      (req as any).user?.sub,
      dto.revision ?? dto.expectedRevision,
    );
  }

  @Post('admin/campus-map/:regionId/publish')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布区域校园地图草稿' })
  async publishAdminRegionMapDraft(
    @Param('regionId') regionId: string,
    @Body() dto: { revision?: number },
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    return this.service.publishDraft(regionId, (req as any).user?.sub, dto?.revision);
  }

  @Get('admin/campus-map/:regionId/versions')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取区域校园地图发布版本' })
  async listAdminRegionMapVersions(
    @Param('regionId') regionId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    return this.service.listVersions(regionId, Number(page), Number(pageSize));
  }

  @Post('admin/campus-map/:regionId/versions/:versionId/rollback')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '回滚区域校园地图到指定版本' })
  async rollbackAdminRegionMapVersion(
    @Param('regionId') regionId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    return this.service.rollbackVersion(regionId, versionId, (req as any).user?.sub);
  }

  @Post('admin/campus-map/:regionId/imports')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 80 * 1024 * 1024 } }))
  @ApiOperation({ summary: '上传 CAD/GeoJSON 并生成校园地图草稿' })
  async createImportJob(
    @Param('regionId') regionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    return this.imports.createImport(regionId, file, (req as any).user?.sub);
  }

  @Get('admin/campus-map/:regionId/imports')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取区域校园地图导入任务列表' })
  async listImportJobs(@Param('regionId') regionId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.imports.listImports(regionId);
  }

  @Get('admin/campus-map/:regionId/imports/:jobId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取校园地图导入任务详情' })
  async getImportJob(@Param('regionId') regionId: string, @Param('jobId') jobId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.imports.getImport(regionId, jobId);
  }

  @Post('admin/campus-map/:regionId/imports/:jobId/retry')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '重新转换失败的校园地图导入任务' })
  async retryImportJob(@Param('regionId') regionId: string, @Param('jobId') jobId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.imports.retryImportJob(regionId, jobId, (req as any).user?.sub);
  }

  @Delete('admin/campus-map/:regionId/imports/:jobId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除校园地图导入任务并中止仍在运行的转换' })
  async deleteImportJob(@Param('regionId') regionId: string, @Param('jobId') jobId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.imports.deleteImportJob(regionId, jobId, (req as any).user?.sub);
  }

  @Delete('admin/campus-map/:regionId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '停用区域校园地图配置' })
  async disableAdminRegionMap(@Param('regionId') regionId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.disableRegionMap(regionId, (req as any).user?.sub);
  }

  private assertRegionAccess(req: Request, regionId: string) {
    return this.scope.assertRegionAccess((req as any).user?.sub, regionId);
  }
}
