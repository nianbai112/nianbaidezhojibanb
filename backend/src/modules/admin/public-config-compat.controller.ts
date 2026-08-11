import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/services/prisma.service";
import { buildPublicSiteData } from "./public-site-config";

@ApiTags("新后台公开配置")
@Controller()
export class PublicConfigCompatController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("config/website-info")
  @ApiOperation({ summary: "获取网站信息配置（新后台公开兼容）" })
  async websiteInfo() {
    const config = await this.prisma.config.findUnique({
      where: { key: "website_info" },
    });
    const value = (config?.value as Record<string, any>) || {};
    const siteLogo = value.siteLogo || value.logo || "";
    return {
      siteName: value.siteName || value.adminTitle || "灵萌平台",
      siteShortName: value.siteShortName || value.adminTitle || "灵萌后台管理系统",
      siteLogo,
      logo: siteLogo,
      heroTitle: value.heroTitle || "",
      heroSubtitle: value.heroSubtitle || "",
      heroVideoUrl: value.heroVideoUrl || value.heroVideo || "",
      heroPosterUrl: value.heroPosterUrl || value.heroPoster || value.heroImageUrl || "",
      heroImageUrl: value.heroImageUrl || value.heroPosterUrl || "",
      miniappQrUrl: value.miniappQrUrl || value.miniappQr || "",
      icpNumber: value.icpNumber || value.icp || "",
      policeNumber: value.policeNumber || "",
      policeLink: value.policeLink || "",
      copyright: value.copyright || "© 2025 Lingmeng",
      contactEmail: value.contactEmail || "",
      contactPhone: value.contactPhone || "",
      adminTitle: value.adminTitle || value.siteName || "灵萌后台管理",
    };
  }

  @Get("site/public")
  @ApiOperation({ summary: "获取官网公开展示数据" })
  async publicSiteData() {
    const [config, userCount, postCount, merchantCount, regionCount] = await Promise.all([
      this.prisma.config.findUnique({ where: { key: "website_info" } }),
      this.prisma.user.count().catch(() => 0),
      this.prisma.post.count({ where: { status: "published", auditStatus: "approved" } as any }).catch(() => 0),
      this.prisma.merchant.count().catch(() => 0),
      this.prisma.region.count().catch(() => 0),
    ]);
    const value = (config?.value as Record<string, any>) || {};
    return buildPublicSiteData(value, {
      users: userCount,
      posts: postCount,
      merchants: merchantCount,
      regions: regionCount,
    });
  }

  @Get("site/forum/bootstrap")
  @ApiOperation({ summary: "获取官网论坛启动数据" })
  async publicForumBootstrap() {
    const config = await this.prisma.config.findUnique({
      where: { key: "website_info" },
    });
    const value = (config?.value as Record<string, any>) || {};
    const configuredRegionId = String(value.defaultRegionId || value.regionId || value.siteRegionId || "").trim();
    const configuredRegion = configuredRegionId
      ? await this.prisma.region.findFirst({
          where: { id: configuredRegionId, isOpen: true },
          select: { id: true, name: true, code: true, logo: true, cover: true, studentOnly: true, regionType: true },
        }).catch(() => null)
      : null;
    const region = configuredRegion || await this.prisma.region.findFirst({
      where: { isOpen: true },
      select: { id: true, name: true, code: true, logo: true, cover: true, studentOnly: true, regionType: true },
      orderBy: [{ isHot: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }).catch(() => null);
    const regionWhere = region?.id ? { regionId: region.id } : {};
    const [postCount, userCount, commentCount] = await Promise.all([
      this.prisma.post.count({
        where: { ...regionWhere, status: "PUBLISHED", deletedAt: null },
      }).catch(() => 0),
      this.prisma.user.count({
        where: { deletedAt: null, status: "ACTIVE" },
      }).catch(() => 0),
      this.prisma.comment.count({
        where: { deletedAt: null, status: "active", auditStatus: "approved", post: regionWhere },
      }).catch(() => 0),
    ]);
    return {
      region,
      stats: {
        posts: postCount,
        users: userCount,
        comments: commentCount,
      },
      rules: {
        studentOnly: !!region?.studentOnly,
        loginRequiredForPost: true,
        loginRequiredForComment: true,
      },
    };
  }
}
