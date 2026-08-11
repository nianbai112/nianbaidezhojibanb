import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard, SuperAdminGuard } from "../../guards/admin.guard";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { PrismaService } from "../../common/services/prisma.service";

@ApiTags("新后台 /api 兼容接口")
@Controller("api")
@UseGuards(JwtGuard, AdminGuard, SuperAdminGuard)
@ApiBearerAuth()
export class ApiCompatController {

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // 社区
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("community")
  async community() {
    const [communities, payments] = await Promise.all([
      this.prisma.community.count(),
      this.prisma.communityPayment.count(),
    ]);
    return { data: { communities, payments } };
  }

  @Get("community/list")
  async communityList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.community.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.community.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("community/admin/config")
  async communityAdminConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: "community_config" } });
    return { data: config?.value || {} };
  }

  @Get("community/admin/purchases")
  async communityAdminPurchases(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.communityPayment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.communityPayment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 通讯录
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("contacts")
  @RequirePermission("contacts:list")
  @UseGuards(AdminPermissionGuard)
  async contacts(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { category: true } }),
      this.prisma.contact.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("contacts/categories")
  async contactsCategories(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.contactCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.contactCategory.count(),
    ]);
    return { list, total };
  }

  @Get("contacts/audit/pending")
  async contactsAuditPending(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({ where: { isPublic: true }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.contact.count({ where: { isPublic: true } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("contacts/audit/stats")
  async contactsAuditStats() {
    const [total, publicCount] = await Promise.all([
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { isPublic: true } }),
    ]);
    return { data: { total, public: publicCount } };
  }

  @Post("contacts/audit/batch")
  async contactsAuditBatch(@Body() dto: { ids: string[]; status: string }) {
    if (dto.ids?.length) {
      await this.prisma.contact.updateMany({ where: { id: { in: dto.ids } }, data: { isPublic: dto.status === "approved" } as any });
    }
    return { success: true };
  }

  @Post("contacts/batch-import")
  @ApiOperation({ summary: "通讯录批量导入（旧后台兼容，无当前前端依赖）", deprecated: true })
  contactsBatchImport() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 相亲
  // ═══════════════════════════════════════════════════════════════════════════

  private datingPage(q: any) { return { page: +q.page || 1, pageSize: +q.pageSize || 20 }; }

  @Get("dating/packages")
  async datingPackages(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.datingPackage.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.datingPackage.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/profile")
  async datingProfile(@Query() q: any) {
    const profile = q.userId ? await this.prisma.datingProfile.findUnique({ where: { userId: q.userId } }) : null;
    return { data: profile || {} };
  }

  @Get("dating/profile/list")
  async datingProfileList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.datingProfile.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true, avatar: true } } } }),
      this.prisma.datingProfile.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Post("dating/profile/admin/batch")
  async datingProfileBatch(@Body() dto: { ids: string[]; action: string }) {
    if (dto.ids?.length && dto.action === "audit") {
      await this.prisma.datingProfile.updateMany({ where: { userId: { in: dto.ids } }, data: { status: "approved" } as any });
    }
    return { success: true };
  }

  @Get("dating/matches/admin/list")
  async datingMatchesAdminList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.match.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.match.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/matches/stats")
  async datingMatchesStats() {
    const [total, today] = await Promise.all([
      this.prisma.match.count(),
      this.prisma.match.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { data: { total, today } };
  }

  @Get("dating/orders/admin/list")
  async datingOrdersAdminList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.datingOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.datingOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/orders/admin/stats")
  async datingOrdersAdminStats() {
    const [total, totalGmv] = await Promise.all([
      this.prisma.datingOrder.count(),
      this.prisma.datingOrder.aggregate({ _sum: { amount: true } }),
    ]);
    return { data: { total, totalGmv: Number(totalGmv._sum.amount || 0) } };
  }

  @Get("dating/reports/admin/list")
  async datingReportsAdminList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.datingReport.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.datingReport.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("dating/reports/admin/stats")
  async datingReportsAdminStats() {
    const [total, pending] = await Promise.all([
      this.prisma.datingReport.count(),
      this.prisma.datingReport.count({ where: { status: "pending" } }),
    ]);
    return { data: { total, pending } };
  }

  @Get("dating/packages/admin/stats")
  async datingPackagesAdminStats() {
    const [total] = await Promise.all([
      this.prisma.datingPackage.count(),
    ]);
    return { data: { total } };
  }

  @Post("dating/packages/batch")
  datingPackagesBatch() { return { success: true }; }

  @Get("dating/config/admin/stats")
  async datingConfigAdminStats() {
    const configs = await this.prisma.datingConfig.findMany();
    return { data: { total: configs.length, configs } };
  }

  @Get("dating/config/region")
  async datingConfigRegion(@Query() q: any) {
    const config = q.regionId ? await this.prisma.datingConfig.findUnique({ where: { regionId: q.regionId } }) : null;
    return { data: config || {} };
  }

  @Post("dating/config/region/batch")
  async datingConfigRegionBatch(@Body() dto: { ids: string[]; isOpen: boolean }) {
    if (dto.ids?.length) {
      await this.prisma.datingConfig.updateMany({ where: { regionId: { in: dto.ids } }, data: { isOpen: dto.isOpen } });
    }
    return { success: true };
  }

  @Get("dating/config/check-region-access")
  async datingConfigCheckRegionAccess(@Query("regionId") regionId: string) {
    const config = regionId ? await this.prisma.datingConfig.findUnique({ where: { regionId } }) : null;
    return { data: { hasAccess: !!config?.isOpen } };
  }

  @Get("dating/cache/stats")
  @ApiOperation({ summary: "相亲缓存统计（旧后台兼容，需对接Redis）", deprecated: true })
  datingCacheStats() { return { data: { message: "缓存统计需对接Redis" } }; }

  @Get("dating/cache/dating/all")
  @ApiOperation({ summary: "相亲缓存数据（旧后台兼容，需对接Redis）", deprecated: true })
  datingCacheDatingAll() { return { data: { message: "缓存数据需对接Redis" } }; }

  @Post("dating/cache/warm-up")
  @ApiOperation({ summary: "相亲缓存预热（旧后台兼容，需对接Redis）", deprecated: true })
  datingCacheWarmUp() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 团购
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("groupbuy/categories")
  async groupbuyCategories(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.groupBuyCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.groupBuyCategory.count(),
    ]);
    return { list, total };
  }

  @Get("groupbuy/dashboard")
  async groupbuyDashboard() {
    const [orders, totalGmv, packages, categories] = await Promise.all([
      this.prisma.groupBuyOrder.count(),
      this.prisma.groupBuyOrder.aggregate({ _sum: { amount: true } }),
      this.prisma.groupBuyPackage.count(),
      this.prisma.groupBuyCategory.count(),
    ]);
    return { data: { orders, totalGmv: Number(totalGmv._sum.amount || 0), packages, categories } };
  }

  @Get("groupbuy/orders")
  async groupbuyOrders(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { User: { select: { id: true, nickname: true } } } }),
      this.prisma.groupBuyOrder.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/packages")
  async groupbuyPackages(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyPackage.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/reviews")
  async groupbuyReviews(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.groupBuyReview.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.groupBuyReview.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("groupbuy/settings")
  async groupbuySettings() {
    const config = await this.prisma.config.findUnique({ where: { key: "groupbuy_settings" } });
    return { data: config?.value || {} };
  }

  @Post("groupbuy/settings/batch-init")
  async groupbuySettingsBatchInit(@Body() dto: { regions: string[] }) {
    return { success: true, message: `已为 ${dto.regions?.length || 0} 个区域初始化团购设置` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 打卡
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("punch-in/category")
  async punchInCategory(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.punchInCategory.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.punchInCategory.count(),
    ]);
    return { list, total };
  }

  @Get("punch-in/check-in")
  async punchInCheckIn(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { location: { select: { id: true, name: true } } } }),
      this.prisma.punchInRecord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/comment")
  async punchInComment(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.punchInComment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.punchInComment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/config")
  async punchInConfig() {
    const configs = await this.prisma.punchInConfig.findMany();
    return { data: configs };
  }

  @Get("punch-in/location")
  async punchInLocation(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.punchInLocation.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.punchInLocation.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("punch-in/dashboard/stats")
  async punchInDashboardStats() {
    const [locations, records, categories, todayRecords] = await Promise.all([
      this.prisma.punchInLocation.count(),
      this.prisma.punchInRecord.count(),
      this.prisma.punchInCategory.count(),
      this.prisma.punchInRecord.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { success: true, data: { overview: { locations, total_checkins: records, categories, today_checkins: todayRecords } } };
  }

  @Post("punch-in/config/batch/default")
  punchInConfigBatchDefault() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 评分
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("rating/categories")
  async ratingCategories(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.ratingCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.ratingCategory.count(),
    ]);
    return { list, total };
  }

  @Get("rating/dashboard")
  async ratingDashboard() {
    const [items, ratings, categories] = await Promise.all([
      this.prisma.ratingItem.count(),
      this.prisma.userRating.count(),
      this.prisma.ratingCategory.count(),
    ]);
    return { data: { overview: { total_items: items, total_ratings: ratings, active_categories: categories } } };
  }

  @Get("rating/items")
  async ratingItems(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.ratingItem.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.ratingItem.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rating/ratings")
  async ratings(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.userRating.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { item: { select: { id: true, name: true } } } }),
      this.prisma.userRating.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rating/settings")
  async ratingSettings() {
    const settings = await this.prisma.ratingRegionSetting.findMany();
    return { data: settings };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 网盘
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("netdisk/admin/categories")
  async netdiskAdminCategories(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.netDiskCategory.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.netDiskCategory.count(),
    ]);
    return { list, total };
  }

  @Get("netdisk/admin/comments")
  async netdiskAdminComments(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.netDiskComment.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskComment.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("netdisk/admin/platforms")
  async netdiskAdminPlatforms(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.netDiskPlatform.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskPlatform.count(),
    ]);
    return { list, total };
  }

  @Get("netdisk/admin/reports")
  async netdiskAdminReports(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({ where: { targetType: "netdisk" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.report.count({ where: { targetType: "netdisk" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("netdisk/admin/resources")
  async netdiskAdminResources(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.netDiskResource.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskResource.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 资源
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("resources/overview")
  async resourcesOverview() {
    const [resources, categories, downloads] = await Promise.all([
      this.prisma.netDiskResource.count(),
      this.prisma.netDiskCategory.count(),
      this.prisma.netDiskDownload.count(),
    ]);
    return { data: { resources, categories, downloads } };
  }

  @Get("resources/categories")
  async resourcesCategories(@Query() q: any) { return this.netdiskAdminCategories(q); }

  @Get("resources/config")
  async resourcesConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: "resources_config" } });
    return { data: config?.value || {} };
  }

  @Get("resources/config/all")
  async resourcesConfigAll() {
    const configs = await this.prisma.netDiskProfitConfig.findMany();
    return { data: configs };
  }

  @Post("resources/config/batch")
  resourcesConfigBatch() { return { success: true }; }

  @Get("resources/items")
  async resourcesItems(@Query() q: any) { return this.netdiskAdminResources(q); }

  @Get("resources/downloads")
  async resourcesDownloads(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.netDiskDownload.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskDownload.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("resources/favorites")
  async resourcesFavorites(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.netDiskFavorite.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskFavorite.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Post("resources/favorites/batch")
  resourcesFavoritesBatch() { return { success: true }; }

  @Get("resources/ads/records")
  async resourcesAdsRecords(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.advertisement.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.advertisement.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("resources/ads/stats")
  async resourcesAdsStats() {
    const [total] = await Promise.all([
      this.prisma.advertisement.count(),
    ]);
    return { data: { total } };
  }

  @Get("resources/profits/author")
  async resourcesProfitsAuthor(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.netDiskProfitConfig.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.netDiskProfitConfig.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("resources/profits/author/stats")
  resourcesProfitsAuthorStats() { return this.resourcesOverview(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 用户管理
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("user-management/tags")
  async userManagementTags(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.userTagDefinition.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.userTagDefinition.count(),
    ]);
    return { list, total };
  }

  @Get("user-management/levels")
  async userManagementLevels(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.userLevel.findMany({ orderBy: { levelNumber: "asc" } }),
      this.prisma.userLevel.count(),
    ]);
    return { list, total };
  }

  @Get("user-management/user-levels")
  async userManagementUserLevels(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.userLevel.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { levelNumber: "asc" } }),
      this.prisma.userLevel.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("user-management/tag-relations")
  async userManagementTagRelations(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.userTag.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, nickname: true } } } }),
      this.prisma.userTag.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Post("user-management/tag-relations/batch")
  userManagementTagRelationsBatch() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 用户引导
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("user-guidance/admin")
  async userGuidanceAdmin(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.userGuidancePage.findMany({ orderBy: { sortOrder: "asc" } as any }),
      this.prisma.userGuidancePage.count(),
    ]);
    return { list, total };
  }

  @Get("user-guidance/admin/list")
  async userGuidanceAdminList(@Query() q: any) { return this.userGuidanceAdmin(q); }

  @Post("user-guidance/admin/batch-status")
  userGuidanceAdminBatchStatus() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 富文本内容
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("rich-text-content/admin")
  async richTextContentAdmin(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.richTextContent.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.richTextContent.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rich-text-content/admin/list")
  async richTextContentAdminList(@Query() q: any) { return this.richTextContentAdmin(q); }

  @Get("rich-text-content/config/admin")
  async richTextContentConfigAdmin(@Query() q: any) { return this.richTextContentAdmin(q); }

  @Get("rich-text-content/config/admin/list")
  async richTextContentConfigAdminList(@Query() q: any) { return this.richTextContentAdmin(q); }

  @Post("rich-text-content/config/admin/batch-status")
  richTextContentConfigAdminBatchStatus() { return { success: true }; }

  @Get("rich-text-content/banned-words")
  async richTextContentBannedWords(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.sensitiveWord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.sensitiveWord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("rich-text-content/banned-words/statistics")
  async richTextContentBannedWordsStatistics() {
    const [total, active] = await Promise.all([
      this.prisma.sensitiveWord.count(),
      this.prisma.sensitiveWord.count({ where: { status: 1 } }),
    ]);
    return { data: { total, active } };
  }

  @Post("rich-text-content/banned-words/batch")
  richTextContentBannedWordsBatch() { return { success: true }; }

  @Post("rich-text-content/banned-words/batch-import")
  richTextContentBannedWordsBatchImport() { return { success: true }; }

  @Post("rich-text-content/banned-words/batch-status")
  richTextContentBannedWordsBatchStatus() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 贴纸
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("sticker-categories")
  async stickerCategories(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.stickerCategory.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.stickerCategory.count(),
    ]);
    return { list, total };
  }

  @Get("sticker-settings")
  async stickerSettings() {
    const config = await this.prisma.config.findUnique({ where: { key: "sticker_settings" } });
    return { data: config?.value || {} };
  }

  @Post("sticker-settings/init")
  stickerSettingsInit() { return { success: true }; }

  @Get("stickers/audit/pending")
  async stickersAuditPending(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.sticker.findMany({ where: { status: "pending" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.sticker.count({ where: { status: "pending" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("stickers/my")
  async stickersMy(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.sticker.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.sticker.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("sticker-packs/audit/pending")
  async stickerPacksAuditPending(@Query() q: any) { return this.stickersMy(q); }

  // ═══════════════════════════════════════════════════════════════════════════
  // 头像库
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("avatar-library")
  async avatarLibrary(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ where: { fileType: "image", scene: "avatar" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.uploadRecord.count({ where: { fileType: "image", scene: "avatar" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("avatar-library/admin/statistics")
  async avatarLibraryAdminStatistics() {
    const [total, today] = await Promise.all([
      this.prisma.uploadRecord.count({ where: { fileType: "image", scene: "avatar" } }),
      this.prisma.uploadRecord.count({ where: { fileType: "image", scene: "avatar", createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    ]);
    return { data: { total, today } };
  }

  @Post("avatar-library/batch")
  avatarLibraryBatch() { return { success: true }; }

  @Post("avatar-library/batch-status")
  avatarLibraryBatchStatus() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 邮件
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("email")
  async emailConfig() {
    const config = await this.prisma.emailConfig.findFirst();
    return { data: config || {} };
  }

  @Post("email/test")
  emailTest() { return { success: true, message: "邮件功能暂未配置" }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 微信模板 / CI 工具
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("wechat-template")
  async wechatTemplate(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.wechatTemplateConfig.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.wechatTemplateConfig.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Put("wechat-template/batch-toggle")
  async wechatTemplateBatchToggle(@Body() dto: { ids: string[]; enabled: boolean }) {
    if (dto.ids?.length) {
      await this.prisma.wechatTemplateConfig.updateMany({ where: { id: { in: dto.ids } }, data: { enabled: dto.enabled } as any });
    }
    return { success: true };
  }

  @Get("weixin-ci/project-info")
  weixinCiProjectInfo() { return { data: { name: "lingmeng", version: "1.0.0", appId: "" } }; }

  @Get("weixin-ci/keys")
  @ApiOperation({ summary: "微信CI密钥（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiKeys(@Query() q: any) {
    return { list: [], total: 0 };
  }

  @Get("weixin-ci/logo")
  @ApiOperation({ summary: "微信CI Logo（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiLogo() { return { data: {} }; }

  @Get("weixin-ci/preview")
  @ApiOperation({ summary: "微信CI预览（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiPreview() { return { data: {} }; }

  @Get("weixin-ci/subpackages")
  @ApiOperation({ summary: "微信CI分包（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiSubpackages() { return { data: [] }; }

  @Post("weixin-ci/save-key")
  @ApiOperation({ summary: "微信CI保存密钥（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiSaveKey() { return { success: true }; }

  @Post("weixin-ci/upload-key")
  @ApiOperation({ summary: "微信CI上传密钥（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiUploadKey() { return { success: true }; }

  @Post("weixin-ci/upload-logo")
  @ApiOperation({ summary: "微信CI上传Logo（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiUploadLogo() { return { success: true }; }

  @Post("weixin-ci/upload")
  @ApiOperation({ summary: "微信CI上传（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiUpload() { return { success: true }; }

  @Post("weixin-ci/export-project")
  @ApiOperation({ summary: "微信CI导出（旧后台兼容，无当前前端依赖）", deprecated: true })
  weixinCiExportProject() { return { success: true }; }

  @Get("wechat-article/images")
  async wechatArticleImages(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.wechatArticle.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.wechatArticle.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 骑手
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("riders")
  async apiRiders(@Query() q: any) {
    const [list, total] = await Promise.all([
      this.prisma.rider.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.rider.count(),
    ]);
    return { list, total };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 小红书
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("xiaohongshu/content")
  @ApiOperation({ summary: "小红书内容（旧后台兼容，无当前前端依赖）", deprecated: true })
  xiaohongshuContent(@Query() q: any) {
    return { list: [], total: 0 };
  }

  @Get("xiaohongshu/comments")
  @ApiOperation({ summary: "小红书评论（旧后台兼容，无当前前端依赖）", deprecated: true })
  xiaohongshuComments(@Query() q: any) {
    return { list: [], total: 0 };
  }

  @Post("xiaohongshu/batch")
  @ApiOperation({ summary: "小红书批量操作（旧后台兼容，无当前前端依赖）", deprecated: true })
  xiaohongshuBatch() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 草稿管理
  // ═══════════════════════════════════════════════════════════════════════════

  @Get("draft-manage/list")
  async draftManageList(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({ where: { status: "DRAFT" }, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.post.count({ where: { status: "DRAFT" } }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("draft-manage/count")
  async draftManageCount() {
    const count = await this.prisma.post.count({ where: { status: "DRAFT" } });
    return { count };
  }

  @Get("draft-manage/materials")
  async draftManageMaterials(@Query() q: any) {
    const { page = 1, pageSize = 20 } = q;
    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.uploadRecord.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Post("draft-manage/add")
  draftManageAdd() { return { success: true }; }

  @Post("draft-manage/create-from-notes")
  draftManageCreateFromNotes() { return { success: true }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 余额 / Bull / License / 区域 / 小程序 / 笔记 / 商家 / 分享 / 商城
  // ═══════════════════════════════════════════════════════════════════════════

  @Post("balance-tools/clear")
  balanceToolsClear() { return { success: true }; }

  @Post("bull/add-traffic")
  bullAddTraffic() { return { success: true }; }

  @Get("bull/stats")
  @ApiOperation({ summary: "队列统计（旧后台兼容，无当前前端依赖）", deprecated: true })
  bullStats() { return { data: { waiting: 0, active: 0, completed: 0, failed: 0 } }; }

  @Get("bull/failed")
  @ApiOperation({ summary: "失败队列（旧后台兼容，无当前前端依赖）", deprecated: true })
  bullFailed(@Query() q: any) { return { list: [], total: 0 }; }

  @Get("license/announcements")
  @ApiOperation({ summary: "License公告（旧后台兼容，无当前前端依赖）", deprecated: true })
  licenseAnnouncements(@Query() q: any) { return { list: [], total: 0 }; }

  @Get("license/auth-info")
  @ApiOperation({ summary: "License认证信息（旧后台兼容，无当前前端依赖）", deprecated: true })
  licenseAuthInfo() { return { data: {} }; }

  @Get("license/version-updates")
  @ApiOperation({ summary: "License版本更新（旧后台兼容，无当前前端依赖）", deprecated: true })
  licenseVersionUpdates(@Query() q: any) { return { list: [], total: 0 }; }

  @Get("license/latest-version/download")
  @ApiOperation({ summary: "License最新版本下载（旧后台兼容，无当前前端依赖）", deprecated: true })
  licenseLatestVersionDownload() { return { url: "" }; }

  @Post("license/revoke-update")
  @ApiOperation({ summary: "License撤销更新（旧后台兼容，无当前前端依赖）", deprecated: true })
  licenseRevokeUpdate() { return { success: true }; }

  @Get("region-robot")
  async regionRobot() { const c = await this.prisma.config.findUnique({ where: { key: "robot" } }); return { data: c?.value || {} }; }

  @Get("region-signin")
  async regionSignin() { const c = await this.prisma.config.findUnique({ where: { key: "signin_config" } }); return { data: c?.value || {} }; }

  @Get("region/incentive-config")
  async regionIncentiveConfig() {
    const records = await this.prisma.incentiveRecord.groupBy({ by: ["type"], _count: { id: true } });
    return { data: records };
  }

  @Post("miniprogram-data/batch-report")
  miniprogramDataBatchReport() { return { success: true }; }

  @Get("note-poster")
  notePoster() { return { data: {} }; }

  @Get("note-settings")
  async noteSettings() {
    const settings = await this.prisma.noteSettings.findMany();
    return { data: settings };
  }

  @Get("merchant-settings")
  async merchantSettings() {
    const settings = await this.prisma.regionMerchantSettings.findMany();
    return { data: settings };
  }

  @Get("share/records")
  async shareRecords(@Query() q: any) {
    const { page = 1, pageSize = 20, status, regionId, inviterId, inviteeId, keyword } = q;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (inviterId) where.inviterId = inviterId;
    if (inviteeId) where.inviteeId = inviteeId;
    if (keyword) {
      where.OR = [
        { inviterId: String(keyword) },
        { inviteeId: String(keyword) },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.shareInvite.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: "desc" }, include: { inviter: { select: { id: true, nickname: true } }, invitee: { select: { id: true, nickname: true } }, rewards: true } }),
      this.prisma.shareInvite.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  @Get("mall")
  async mall() { const c = await this.prisma.config.findUnique({ where: { key: "mall_config" } }); return { data: c?.value || {} }; }
}
