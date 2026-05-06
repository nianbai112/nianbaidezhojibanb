import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class RegionService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRegion(raw: any, includeDistance = false) {
    const settings = (raw.settings || {}) as Record<string, any>;
    const region_type =
      raw.regionType ||
      (raw.studentOnly ? 'campus' : 'community') ||
      'other';
    const result: any = {
      region_id: raw.id,
      id: raw.id,
      name: raw.name,
      code: raw.code,
      logo: raw.logo || raw.cover || '',
      coverImage: raw.cover || '',
      cover: raw.cover || '',
      description: raw.description || '',
      address: raw.address || '',
      latitude: raw.latitude ?? null,
      longitude: raw.longitude ?? null,
      distance: includeDistance && raw.distance != null ? raw.distance : null,
      distance_text:
        includeDistance && raw.distance != null
          ? raw.distance < 1000
            ? `${Math.round(raw.distance)}m`
            : `${(raw.distance / 1000).toFixed(1)}km`
          : '',
      status: raw.isOpen ? 1 : 0,
      region_type,
      studentOnly: !!raw.studentOnly,
      is_force_guidance: !!raw.isForceGuidance,
      // 新增字段
      is_hot: !!raw.isHot,
      region_cover_mode: raw.regionCoverMode || 'cover',
      distance_limit: raw.distanceLimit ?? 0,
      balance: raw.balance ? Number(raw.balance) : 0,
      min_withdraw: raw.minWithdraw ? Number(raw.minWithdraw) : 0,
      max_withdraw: raw.maxWithdraw ? Number(raw.maxWithdraw) : 0,
      withdraw_fee: raw.withdrawFee ? Number(raw.withdrawFee) : 0,
      withdraw_rate: raw.withdrawRate ? Number(raw.withdrawRate) : 0,
      commission_rate: raw.commissionRate ? Number(raw.commissionRate) : 0,
      self_unban_fee: raw.selfUnbanFee ? Number(raw.selfUnbanFee) : 0,
      show_hot_list: !!raw.showHotList,
      hot_featured_display: raw.hotFeaturedDisplay || 'none',
      private_message_enabled: raw.privateMessageEnabled ?? true,
      contacts_require_student_auth: !!raw.contactsRequireStudentAuth,
      only_student_auth_users: !!raw.onlyStudentAuthUsers,
      group_chat_enabled: !!raw.groupChatEnabled,
      enable_qrcode_filter: !!raw.enableQrcodeFilter,
      home_nav_layout: raw.homeNavLayout ?? 1,
      message_page_layout: raw.messagePageLayout || 'default',
      profile_page_layout: raw.profilePageLayout || 'default',
      carousel_images: raw.carouselImages ?? [],
      region_tabs: raw.regionTabs ?? [],
      home_leaderboard: raw.homeLeaderboard ?? { enabled: false, items: [] },
      message_icons: raw.messageIcons ?? {},
      message_navigation: raw.messageNavigation ?? { cards: [] },
      profile_layout_items: raw.profileLayoutItems ?? [],
      home_nav_layout_config: raw.homeNavLayoutConfig ?? {},
      settings: {
        features: settings.features || null,
        share: settings.share || null,
        signin: settings.signin || null,
        robots: settings.robots || null,
        avatars: settings.avatars || null,
        emojis: settings.emojis || null,
        tabbar: settings.tabbar || null,
        ...settings,
      },
      sort: raw.sortOrder ?? 0,
      sortOrder: raw.sortOrder ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
    return result;
  }

  async list() {
    const regions = await this.prisma.region.findMany({
      where: { isOpen: true },
      orderBy: { sortOrder: 'asc' },
    });
    return regions.map((r) => this.normalizeRegion(r));
  }

  async detail(id: string) {
    const region = await this.prisma.region.findUnique({
      where: { id },
      include: {
        banners: { where: { isShow: true } },
        notices: { where: { isShow: true } },
        navs: { where: { isShow: true } },
      },
    });
    if (!region) throw new NotFoundException('区域不存在');
    return this.normalizeRegion(region);
  }

  async getContentItems(id: string) {
    return this.prisma.regionContentItem.findMany({
      where: { regionId: id, isShow: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addContentItem(id: string, dto: any) {
    return this.prisma.regionContentItem.create({
      data: { regionId: id, ...dto },
    });
  }

  async updateContentItem(id: string, itemId: string, dto: any) {
    return this.prisma.regionContentItem.update({
      where: { id: itemId },
      data: dto,
    });
  }

  async deleteContentItem(id: string, itemId: string) {
    await this.prisma.regionContentItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async getTabbar(id: string) {
    return this.prisma.regionTabBar.findUnique({ where: { regionId: id } });
  }

  async getSearchConfig(regionId: string) {
    return { hotKeywords: [], categories: [] };
  }

  async getShareSettings(regionId: string) {
    return this.prisma.shareSettings.findUnique({ where: { regionId } });
  }

  async getHomePageContent(query: any) {
    const { status = 1, region_id, page = 1, limit = 20 } = query;
    return this.prisma.regionContentItem.findMany({
      where: { regionId: region_id, isShow: true },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { sortOrder: 'asc' },
    });
  }
}
