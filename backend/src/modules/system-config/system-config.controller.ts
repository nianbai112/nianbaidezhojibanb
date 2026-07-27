import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SystemConfigService } from "./system-config.service";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Request } from "express";

@ApiTags("系统配置")
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class SystemConfigController {
  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('admin/config/login-page')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '获取小程序登录页视觉配置' })
  getLoginPageConfig() {
    return this.systemConfigService.getLoginPageConfig();
  }

  @Put('admin/config/login-page')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '保存小程序登录页视觉配置' })
  saveLoginPageConfig(@Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.systemConfigService.saveLoginPageConfig(dto, operatorId, req.ip);
  }

  @Get("admin/configs")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取配置列表" })
  getConfigs(
    @Query("group") group?: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigs(group, regionId);
  }

  @Get("admin/config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "按分组获取配置（后台兼容路径）" })
  getConfigGroup(
    @Query("group") group?: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigs(group, regionId);
  }

  @Get("admin/configs/:key")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取单个配置" })
  getConfigByKey(
    @Param("key") key: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigByKey(key, regionId);
  }

  @Put("admin/configs")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量更新配置" })
  updateConfigs(
    @Body() dto: { configs: any[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.updateConfigs(
      dto.configs,
      operatorId,
      req.ip,
    );
  }

  @Put("admin/config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量保存配置（后台兼容路径）" })
  saveConfigGroup(
    @Body() dto: { configs: any[] },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.updateConfigs(
      dto.configs,
      operatorId,
      req.ip,
    );
  }

  @Post("admin/config/reset")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  resetConfigGroup(
    @Body() dto: { group: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.resetGroup(dto.group, operatorId, req.ip);
  }

  @Get("admin/config/ai")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  getAiConfig() {
    return this.systemConfigService.getNamedConfig("ai");
  }

  @Put("admin/config/ai")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  saveAiConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.setNamedConfig(
      "ai",
      dto,
      operatorId,
      req.ip,
    );
  }

  @Post("admin/config/ai/test")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  testAiConfig() {
    return this.systemConfigService.testAiConfig();
  }

  @Get("admin/config/robot")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  getRobotConfig() {
    return this.systemConfigService.getNamedConfig("robot");
  }

  @Put("admin/config/robot")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  saveRobotConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.setNamedConfig(
      "robot",
      dto,
      operatorId,
      req.ip,
    );
  }

  @Get("admin/config/ai-ops")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取AI运营配置" })
  getAiOpsConfig() {
    return this.systemConfigService.getNamedConfig("ai_ops_config");
  }

  @Put("admin/config/ai-ops")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "保存AI运营配置" })
  saveAiOpsConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.setNamedConfig(
      "ai_ops_config",
      dto,
      operatorId,
      req.ip,
    );
  }

  @Post("admin/config/ai-ops/reset")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "重置AI运营配置为默认值" })
  async resetAiOpsConfig(
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    await this.prisma.config.deleteMany({ where: { key: "ai_ops_config" } });
    return { success: true, data: this.systemConfigService.getDefaultAiOpsConfig() };
  }

  @Post("admin/config/ai-ops/test-generate")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "测试AI内容生成" })
  async testAiOpsGenerate() {
    return this.systemConfigService.testAiGenerate();
  }

  // ============ 存储配置 ============

  @Get("admin/config/storage")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取存储配置" })
  async getStorageConfig() {
    return this.systemConfigService.getStorageConfig();
  }

  @Put("admin/config/storage")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "保存存储配置" })
  async saveStorageConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.saveStorageConfig(dto, operatorId, req.ip);
  }

  @Post("admin/config/storage/test")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "测试存储连接" })
  async testStorageConfig(@Body() dto: any) {
    return this.systemConfigService.testStorageConfig(dto);
  }

  // ============ 高德地图配置 ============

  @Get("admin/config/amap")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取高德地图配置" })
  async getAmapConfig() {
    return this.systemConfigService.getAmapConfig();
  }

  @Get("admin/config/amap/runtime")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取高德地图运行时配置" })
  async getAmapRuntimeConfig() {
    return this.systemConfigService.getAmapRuntimeConfig();
  }

  @Put("admin/config/amap")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "保存高德地图配置" })
  async saveAmapConfig(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    return this.systemConfigService.saveAmapConfig(dto, operatorId, req.ip);
  }

  @Get('admin/config/feie')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '获取飞鹅云打印配置' })
  getFeieConfig() {
    return this.systemConfigService.getFeieConfig();
  }

  @Put('admin/config/feie')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '保存飞鹅云打印配置' })
  saveFeieConfig(@Body() dto: any, @CurrentUser('sub') operatorId: string, @Req() req: Request) {
    return this.systemConfigService.saveFeieConfig(dto, operatorId, req.ip);
  }

  @Post("admin/config/amap/test-web")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "测试高德 Web服务 Key" })
  async testAmapWebKey() {
    return this.systemConfigService.testAmapWebKey();
  }

  @Post("admin/config/amap/test-js")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "测试高德 JS API Key" })
  async testAmapJsKey() {
    return this.systemConfigService.testAmapJsKey();
  }

  @Post("admin/amap/geocode")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "高德地理编码" })
  async amapGeocode(@Body() dto: { address: string; city?: string }) {
    return this.systemConfigService.amapGeocode(dto.address, dto.city);
  }

  @Post("admin/amap/regeocode")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "高德逆地理编码" })
  async amapRegeocode(@Body() dto: { longitude: number; latitude: number }) {
    return this.systemConfigService.amapRegeocode(dto.longitude, dto.latitude);
  }

  @Post("admin/amap/place-search")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "高德 POI 搜索" })
  async amapPlaceSearch(@Body() dto: { keywords: string; city?: string }) {
    return this.systemConfigService.amapPlaceSearch(dto.keywords, dto.city);
  }

  @Get("admin/sensitive-words/stats")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "敏感词统计" })
  sensitiveWordsStats() {
    return this.systemConfigService.sensitiveWordsStats();
  }

  @Get("admin/sensitive-words")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  sensitiveWords(@Query() query: any) {
    return this.systemConfigService.sensitiveWords(query);
  }

  @Post("admin/sensitive-words")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  createSensitiveWord(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.createSensitiveWord(dto, operatorId);
  }

  @Put("admin/sensitive-words/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateSensitiveWord(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.updateSensitiveWord(id, dto, operatorId);
  }

  @Delete("admin/sensitive-words/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  deleteSensitiveWord(@Param("id") id: string) {
    return this.systemConfigService.deleteSensitiveWord(id);
  }

  @Post("admin/sensitive-words/batch")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  batchSensitiveWords(
    @Body() dto: { words: string[]; category?: string; level?: string; replaceWord?: string },
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.batchSensitiveWords(dto.words, operatorId, dto.category, dto.level, dto.replaceWord);
  }

  @Get("admin/advertisements")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  advertisements(@Query() query: any) {
    return this.systemConfigService.advertisements(query);
  }

  @Post("admin/advertisements")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  createAdvertisement(
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.createAdvertisement(dto, operatorId);
  }

  @Put("admin/advertisements/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  updateAdvertisement(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("sub") operatorId: string,
  ) {
    return this.systemConfigService.updateAdvertisement(id, dto, operatorId);
  }

  @Delete("admin/advertisements/:id")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  deleteAdvertisement(@Param("id") id: string) {
    return this.systemConfigService.deleteAdvertisement(id);
  }

  @Put("admin/advertisements/:id/status")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  advertisementStatus(
    @Param("id") id: string,
    @Body() dto: { status: number },
  ) {
    return this.systemConfigService.updateAdvertisement(id, {
      status: dto.status,
    });
  }

  // ============ 新后台兼容接口 ============

  @Get("config/website-info")
  @ApiOperation({ summary: "获取网站信息配置（新后台兼容）" })
  async websiteInfo() {
    const config = await this.prisma.config.findUnique({
      where: { key: "website_info" },
    });
    const value = (config?.value as Record<string, any>) || {};
    return {
      siteName: value.siteName || "灵萌平台",
      logo: value.logo || "",
      copyright: value.copyright || "© 2025 Lingmeng",
      icp: value.icp || "",
      contactEmail: value.contactEmail || "",
      contactPhone: value.contactPhone || "",
      adminTitle: value.adminTitle || "灵萌后台管理",
    };
  }

  @Get("config/get")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "按组获取配置（新后台兼容）" })
  getConfigCompat(
    @Query("group") group?: string,
    @Query("regionId") regionId?: string,
  ) {
    return this.systemConfigService.getConfigs(group, regionId);
  }

  @Put("config/update")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "批量更新配置（新后台兼容）" })
  updateConfigCompat(
    @Body() dto: { configs?: any[]; key?: string; value?: any; group?: string },
    @CurrentUser("sub") operatorId: string,
    @Req() req: Request,
  ) {
    if (dto.configs) {
      return this.systemConfigService.updateConfigs(dto.configs, operatorId, req.ip);
    }
    if (dto.key) {
      return this.systemConfigService.setNamedConfig(dto.key, dto.value, operatorId, req.ip);
    }
    return { code: 400, message: "缺少 configs 或 key" };
  }

  @Post("config/toggle-service")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "切换服务开关（新后台兼容）" })
  async toggleService(@Body() dto: { key: string; enabled: boolean }) {
    const config = await this.prisma.config.findUnique({
      where: { key: dto.key },
    });
    const value = { ...((config?.value as Record<string, any>) || {}), enabled: dto.enabled };
    await this.prisma.config.upsert({
      where: { key: dto.key },
      update: { value },
      create: { key: dto.key, value, group: "service_toggles" },
    });
    return { success: true, key: dto.key, enabled: dto.enabled };
  }

  @Get("config/amap-config")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "获取高德地图配置（新后台兼容）" })
  async amapConfig() {
    const config = await this.prisma.config.findUnique({
      where: { key: "amap" },
    });
    const value = (config?.value as Record<string, any>) || {};
    return {
      key: value.key || process.env.AMAP_KEY || "",
      securityCode: value.securityCode || process.env.AMAP_SECURITY_CODE || "",
      webKey: value.webKey || "",
    };
  }

  @Post("config/clear-redis-cache")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "清除 Redis 缓存（新后台兼容）" })
  async clearRedisCache() {
    await this.redis.flushdb();
    return { success: true, message: "Redis 缓存已清除" };
  }

  @Post("config/refresh-wechat-token")
  @RequirePermission("system:config")
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: "刷新微信 Token（新后台兼容）" })
  async refreshWechatToken() {
    await this.redis.del("wechat:access_token");
    return { success: true, message: "微信 Token 缓存已清除，下次请求将自动刷新" };
  }
}

@ApiTags('小程序公开配置')
@Controller()
export class LoginPageConfigPublicController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('platform/login-page-config')
  @ApiOperation({ summary: '获取小程序登录页视觉配置' })
  getLoginPageConfig() {
    return this.systemConfigService.getLoginPageConfig();
  }
}
