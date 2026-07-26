import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/services/prisma.service";

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
      icpNumber: value.icpNumber || value.icp || "",
      policeNumber: value.policeNumber || "",
      policeLink: value.policeLink || "",
      copyright: value.copyright || "© 2025 Lingmeng",
      contactEmail: value.contactEmail || "",
      contactPhone: value.contactPhone || "",
      adminTitle: value.adminTitle || value.siteName || "灵萌后台管理",
    };
  }
}
