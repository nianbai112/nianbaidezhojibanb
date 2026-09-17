import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CampusMapService } from './campus-map.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { UploadService } from '../upload/upload.service';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CampusMapReadGuard, campusMapReadThrottleTracker } from './campus-map-read.guard';

@ApiTags('校园地图')
@Controller()
export class CampusMapController {
  constructor(
    private readonly service: CampusMapService,
    private readonly scope: AdminDataScopeService,
    private readonly upload: UploadService,
  ) {}

  @Get('campus-map/active')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前区域活动校园地图' })
  getActiveMap(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMap(regionId || camelRegionId);
  }

  @Get('campus-map/version')
  @UseGuards(JwtGuard)
  @Throttle({ default: { getTracker: campusMapReadThrottleTracker } })
  @ApiBearerAuth()
  getActiveMapVersion(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMapVersion(regionId || camelRegionId);
  }

  @Get('campus-map/site/version')
  getPublicMapVersion(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMapVersion(regionId || camelRegionId);
  }

  @Get('campus-map/read-access')
  @UseGuards(CampusMapReadGuard, JwtGuard)
  @Throttle({ default: { getTracker: campusMapReadThrottleTracker } })
  @ApiBearerAuth()
  @ApiOperation({ summary: '地图读取服务复用登录及账号状态校验，不读取地图' })
  getMapReadAccess() {
    return { allowed: true };
  }

  @Get('campus-map/read-snapshot')
  @SkipThrottle()
  @UseGuards(CampusMapReadGuard)
  @ApiOperation({ summary: '内部导出经公开过滤的已发布地图，禁止公网直连' })
  getMapReadSnapshot(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMap(regionId || camelRegionId);
  }

  @Post('campus-map/places/:placeId/check-ins')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: '到达校园地点后提交待审核打卡照片' })
  async submitPlaceCheckIn(
    @Param('placeId') placeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: Record<string, any>,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('请拍摄或选择一张到达照片');
    const folder = this.upload.resolveFolder('post', userId);
    const result = await this.upload.upload(file, { type: 'image', folder, scene: 'post' });
    await this.upload.recordUpload(userId, 'user', result, 'campus-map-checkin', req);
    return this.service.submitUserCheckIn(placeId, {
      ...dto,
      url: result.url,
      storageKey: result.key,
      mimeType: result.mimeType || file.mimetype,
      byteSize: result.size || file.size,
    }, userId);
  }

  @Get('campus-map/site')
  @ApiOperation({ summary: '获取官网校园地图（公开匿名，根路径豁免）' })
  getPublicSiteMap(@Query('region_id') regionId?: string, @Query('regionId') camelRegionId?: string) {
    return this.service.getActiveMap(regionId || camelRegionId);
  }

  @Get('admin/campus-map/project-catalog')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取校园官方项目目录' })
  async getProjectCatalog(
    @Query('regionId') regionId: string | undefined,
    @Req() req: Request,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = mapId
      ? await this.service.resolveCatalogRegionId(regionId, mapId)
      : regionId;
    if (resolvedRegionId) await this.assertRegionAccess(req, resolvedRegionId);
    return this.service.getProjectCatalog(resolvedRegionId);
  }

  @Post('admin/campus-map/project-catalog/release-batch/prepare')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按已核验地点整理本次滚动发布批次' })
  async prepareVerifiedReleaseBatch(
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    return this.service.prepareVerifiedReleaseBatch(resolvedRegionId, (req as any).user?.sub);
  }

  @Put('admin/campus-map/project-catalog/:number')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '新增或更新校园建筑项目（按编号）' })
  async upsertProject(
    @Param('number') number: string,
    @Body() dto: Record<string, any>,
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    return this.service.upsertProject({ ...dto, regionId: resolvedRegionId, officialNumber: Number(number) }, (req as any).user?.sub);
  }

  @Delete('admin/campus-map/project-catalog/:number')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除校园建筑项目（按编号）' })
  async deleteProject(
    @Param('number') number: string,
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    return this.service.deleteProject(Number(number), resolvedRegionId);
  }

  @Post('admin/campus-map/project-catalog/:number/photos')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: '上传建筑照片并追加到项目' })
  async uploadProjectPhoto(
    @Param('number') number: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    if (!file) throw new BadRequestException('请上传照片文件');
    const result = await this.upload.upload(file, { type: 'image', folder: 'campus-map/projects', scene: 'admin' });
    return this.service.addProjectPhoto(Number(number), result.url, (req as any).user?.sub, resolvedRegionId);
  }

  @Delete('admin/campus-map/project-catalog/:number/photos')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除建筑项目的指定照片' })
  async removeProjectPhoto(
    @Param('number') number: string,
    @Body() dto: { url: string },
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    return this.service.removeProjectPhoto(Number(number), dto.url, (req as any).user?.sub, resolvedRegionId);
  }

  @Post('admin/campus-map/project-catalog/seed')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('system:config')
  @ApiBearerAuth()
  @ApiOperation({ summary: '从静态目录初始化数据库（首次部署用）' })
  async seedProjects(
    @Req() req: Request,
    @Query('regionId') regionId?: string,
    @Query('mapId') mapId?: string,
  ) {
    const resolvedRegionId = await this.resolveCatalogWriteRegion(req, regionId, mapId);
    return this.service.seedProjectsFromCatalog((req as any).user?.sub, resolvedRegionId);
  }

  @Get('admin/campus-map/:regionId/places')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async listPlaces(@Param('regionId') regionId: string, @Query() filters: Record<string, any>, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.listPlaces(regionId, filters);
  }

  @Post('admin/campus-map/:regionId/places')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async createPlace(@Param('regionId') regionId: string, @Body() dto: Record<string, any>, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.createPlace(regionId, dto, (req as any).user?.sub);
  }

  @Get('admin/campus-map/:regionId/places/:placeId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  async getPlace(@Param('regionId') regionId: string, @Param('placeId') placeId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.getPlace(regionId, placeId);
  }

  @Put('admin/campus-map/:regionId/places/:placeId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async updatePlace(@Param('regionId') regionId: string, @Param('placeId') placeId: string, @Body() dto: Record<string, any>, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.updatePlace(regionId, placeId, dto, (req as any).user?.sub);
  }

  @Delete('admin/campus-map/:regionId/places/:placeId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async deletePlace(@Param('regionId') regionId: string, @Param('placeId') placeId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.deletePlace(regionId, placeId);
  }

  @Post('admin/campus-map/:regionId/places/:placeId/media')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadPlaceMedia(
    @Param('regionId') regionId: string,
    @Param('placeId') placeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: Record<string, any>,
    @Req() req: Request,
  ) {
    await this.assertRegionAccess(req, regionId);
    if (!file) throw new BadRequestException('请上传地点图片');
    const result = await this.upload.upload(file, { type: 'image', folder: 'campus-map/places', scene: 'admin' });
    return this.service.addPlaceMedia(regionId, placeId, {
      ...dto,
      url: result.url,
      storageKey: (result as any).storageKey,
      mimeType: file.mimetype,
      byteSize: file.size,
      isPublic: dto.isPublic === true || dto.isPublic === 'true',
    }, (req as any).user?.sub);
  }

  @Patch('admin/campus-map/:regionId/places/:placeId/media/:mediaId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async updatePlaceMedia(@Param('regionId') regionId: string, @Param('placeId') placeId: string, @Param('mediaId') mediaId: string, @Body() dto: Record<string, any>, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.updatePlaceMedia(regionId, placeId, mediaId, dto);
  }

  @Delete('admin/campus-map/:regionId/places/:placeId/media/:mediaId')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:edit')
  @ApiBearerAuth()
  async deletePlaceMedia(@Param('regionId') regionId: string, @Param('placeId') placeId: string, @Param('mediaId') mediaId: string, @Req() req: Request) {
    await this.assertRegionAccess(req, regionId);
    return this.service.deletePlaceMedia(regionId, placeId, mediaId);
  }

  @Get('admin/campus-map/statuses')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('region:view')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取管理员可见学校的校园地图状态' })
  async listAdminCampusMapStatuses(@Req() req: Request) {
    const where = await this.scope.regionFieldWhere('regionId', (req as any).user?.sub);
    return this.service.listAvailabilityStatuses(where);
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
  @ApiOperation({ summary: '兼容保存区域校园地图草稿（不发布）' })
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

  private async resolveCatalogWriteRegion(req: Request, regionId?: string, mapId?: string) {
    const resolvedRegionId = await this.service.resolveCatalogRegionId(regionId, mapId);
    await this.assertRegionAccess(req, resolvedRegionId);
    return resolvedRegionId;
  }
}
