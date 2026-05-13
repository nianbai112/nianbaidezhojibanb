import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class RegionService {
  constructor(private readonly prisma: PrismaService) {}

  private toBool(value: any, fallback = true) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value === '1' || value === 'true';
    return Boolean(value);
  }

  private normalizeMiniPath(path?: string) {
    const raw = String(path || '').trim();
    if (!raw || raw === 'custom') return '';
    if (raw.startsWith('internal:') || raw.startsWith('miniapp:') || raw.startsWith('miniapp_half:') || raw.startsWith('img:') || raw.startsWith('http')) {
      return raw;
    }
    const clean = raw.replace(/^\/+/, '');
    const aliases: Record<string, string> = {
      'pages/note/list': 'pagesB/post/post',
      'pages/takeout/list': 'pagesA/selection/selection',
      'pages/secondhand/list': 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease',
      'pages/activity/list': 'pagesA/news/SharingCourtesy/SharingCourtesy',
      'pages/merchant/list': 'pagesA/merchant/merchant',
      note: 'pagesB/post/post',
      takeout: 'pagesA/selection/selection',
      secondhand: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease',
      activity: 'pagesA/news/SharingCourtesy/SharingCourtesy',
      merchant: 'pagesA/merchant/merchant',
      circle: 'pages/tabbar/containers/containers',
    };
    return aliases[clean] || clean;
  }

  private toMiniLink(path?: string) {
    const clean = this.normalizeMiniPath(path);
    if (!clean) return '';
    if (clean.startsWith('internal:') || clean.startsWith('miniapp:') || clean.startsWith('miniapp_half:') || clean.startsWith('img:') || clean.startsWith('http')) {
      return clean;
    }
    return `internal:${clean}`;
  }

  private toConfiguredMiniLink(item: any, fallback?: string) {
    const linkType = String(item?.linkType || item?.jumpType || '').trim();
    const appendQuery = (value: string) => {
      const query = String(item?.query || '').trim().replace(/^\?+/, '');
      if (!query) return value;
      return value.includes('?') ? `${value}&${query}` : `${value}?${query}`;
    };
    const path = appendQuery(String(item?.path || item?.page || item?.link || fallback || '').trim());
    if (linkType === 'none') return '';
    if (linkType === 'image') return `img:${path || item?.image || item?.imageUrl || item?.url || ''}`;
    if (linkType === 'webview') return String(path || '').trim();
    if (linkType === 'miniProgram' || linkType === 'miniapp') {
      const appId = item?.appId || item?.appid || '';
      return appId ? `miniapp:${appId}|${this.normalizeMiniPath(path)}` : '';
    }
    return this.toMiniLink(path);
  }

  private getHomeTabId(tab: any, index = 0) {
    if (tab?.id !== undefined && tab?.id !== null && tab?.id !== '') {
      const parsed = Number(tab.id);
      if (Number.isFinite(parsed)) return String(parsed);
    }
    const key = String(tab?.type || tab?.pageType || tab?.name || '').toLowerCase();
    const map: Record<string, string> = {
      note: '0',
      post: '0',
      '笔记': '0',
      takeout: '1',
      delivery: '1',
      merchant: '1',
      mall: '1',
      '外卖': '1',
      '商家': '1',
      secondhand: '2',
      second_hand: '2',
      '二手': '2',
      activity: '3',
      activities: '3',
      '活动': '3',
      rating: '4',
      vote: '4',
      photo_vote: '4',
      '评分': '4',
      punch: '5',
      checkin: '5',
      checkin_map: '5',
      '打卡': '5',
      '打卡地点': '5',
    };
    return map[key] || String(index);
  }

  private normalizeRegionTabs(tabs: any) {
    if (!Array.isArray(tabs)) return [];
    return tabs.map((tab, index) => ({
      ...tab,
      id: this.getHomeTabId(tab, index),
      enabled: tab?.enabled !== false,
      sortOrder: tab?.sortOrder ?? tab?.sort_order ?? index,
    }));
  }

  private toHomeContentItem(item: any, index = 0) {
    const type = item.module_type || item.type || 'menu';
    const image = item.image_url || item.image || item.icon || item.cover || '';
    const link = item.link_url || item.link || item.page || item.path || '';
    return {
      id: item.id || `content_${type}_${index}`,
      region_id: item.regionId || item.region_id || '',
      module_type: type,
      type,
      title: item.title || item.name || '',
      subtitle: item.subtitle || item.description || '',
      content: item.content || item.notice || '',
      image_url: image,
      image,
      icon: image,
      link_url: item.link_url || this.toMiniLink(link),
      link: item.link || this.toMiniLink(link),
      sort_order: item.sortOrder ?? item.sort_order ?? index,
      status: item.isShow === false ? 0 : 1,
      is_show: item.isShow !== false,
    };
  }

  private buildHomeContentFromRegion(region: any) {
    const items: any[] = [];
    const push = (item: any) => items.push(this.toHomeContentItem(item, items.length));

    if (this.toBool(region.showCarousel, true)) {
      const carouselImages = Array.isArray(region.carouselImages) ? region.carouselImages : [];
      carouselImages.forEach((entry: any, index: number) => {
        const image = typeof entry === 'string' ? entry : entry?.image || entry?.imageUrl || entry?.url || entry?.cover || '';
        if (!image) return;
        push({
          id: entry?.id || `carousel_${index}`,
          regionId: region.id,
          module_type: 'swiper',
          title: entry?.title || region.name || '',
          subtitle: entry?.subtitle || region.description || '',
          image_url: image,
          link_url: this.toConfiguredMiniLink(entry, entry?.link || entry?.path || ''),
          sortOrder: entry?.sortOrder ?? index,
        });
      });

      (region.banners || []).forEach((banner: any, index: number) => {
        if (!banner.image) return;
        push({
          id: banner.id,
          regionId: region.id,
          module_type: 'swiper',
          title: banner.title || region.name || '',
          image_url: banner.image,
          link_url: this.toConfiguredMiniLink(banner, banner.link || ''),
          sortOrder: banner.sortOrder ?? index,
        });
      });
    }

    if (this.toBool(region.showAnnouncement, true)) {
      (region.notices || []).forEach((notice: any, index: number) => {
        push({
          id: notice.id,
          regionId: region.id,
          module_type: 'notice',
          title: notice.title || notice.content || '公告通知',
          content: notice.content || notice.title || '',
          image_url: '/static/logo.jpg',
          link_url: '',
          sortOrder: notice.sortOrder ?? index,
        });
      });
    }

    if (this.toBool(region.showKingkong, true)) {
      const navConfig = Array.isArray(region.homeNavLayoutConfig) ? region.homeNavLayoutConfig : [];
      navConfig
        .filter((nav: any) => nav?.enabled !== false)
        .forEach((nav: any, index: number) => {
          push({
            id: nav.id || `nav_${index}`,
            regionId: region.id,
            module_type: 'menu',
            title: nav.name || nav.title || '入口',
            subtitle: nav.subtitle || '',
            image_url: nav.icon || nav.image || '/static/logo.jpg',
            link_url: this.toConfiguredMiniLink(nav, nav.link || nav.page || nav.path || ''),
            sortOrder: nav.sortOrder ?? index,
          });
        });

      (region.navs || []).forEach((nav: any, index: number) => {
        push({
          id: nav.id,
          regionId: region.id,
          module_type: 'menu',
          title: nav.name,
          image_url: nav.icon || '/static/logo.jpg',
          link_url: this.toConfiguredMiniLink(nav, nav.link || ''),
          sortOrder: nav.sortOrder ?? index,
        });
      });
    }

    return items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  private normalizeRegion(raw: any, includeDistance = false) {
    const settings = (raw.settings || {}) as Record<string, any>;
    const noteConfig = (settings.noteConfig || {}) as Record<string, any>;
    const circleConfig = (settings.circleConfig || {}) as Record<string, any>;
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
      region_tabs: this.normalizeRegionTabs(raw.regionTabs),
      home_leaderboard: raw.homeLeaderboard ?? { enabled: false, items: [] },
      message_icons: raw.messageIcons ?? {},
      message_navigation: raw.messageNavigation ?? { cards: [] },
      profile_layout_items: raw.profileLayoutItems ?? [],
      home_nav_layout_config: raw.homeNavLayoutConfig ?? {},
      note_list_style: noteConfig.note_list_style || null,
      note_config: noteConfig,
      circle_config: circleConfig,
      // 页面装修配置
      show_carousel: raw.showCarousel ?? true,
      show_announcement: raw.showAnnouncement ?? true,
      show_kingkong: raw.showKingkong ?? true,
      home_feature_style: raw.homeFeatureStyle || 'default',
      settings: {
        features: settings.features || null,
        share: settings.share || null,
        signin: settings.signin || null,
        robots: settings.robots || null,
        avatars: settings.avatars || null,
        emojis: settings.emojis || null,
        tabbar: settings.tabbar || null,
        noteConfig,
        circleConfig,
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
    const record = await this.prisma.regionTabBar.findUnique({ where: { regionId: id } });

    if (!record || !record.config) {
      return this.getDefaultTabbar(id);
    }

    const config = record.config as any;
    const list = Array.isArray(config.list)
      ? config.list
      : Array.isArray(config.tabs)
        ? config.tabs
        : [];

    const enabledTabs = list
      .filter((tab: any) => tab.enabled !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .slice(0, 5);

    const tabs = enabledTabs.map((tab: any, index: number) => {
      let pagePath = tab.pagePath || '';
      if (pagePath && !pagePath.startsWith('/')) {
        pagePath = '/' + pagePath;
      }

      return {
        name: tab.name || '',
        pagePath,
        action: tab.action || '',
        icons: {
          selected: tab.selectedIconPath || '/static/logo.jpg',
          unselected: tab.iconPath || '/static/logo.jpg',
        },
        colors: {
          selected: tab.selectedColor || config.selectedColor || '#1677ff',
          unselected: tab.color || config.color || '#8A8A8A',
        },
        style: {
          iconWidth: tab.width || 24,
          iconHeight: tab.height || 24,
          fontSize: tab.fontSize || 12,
        },
        hideText: !!tab.hideText,
        isAvatarMode: !!tab.avatarMode,
        styleType: tab.navType === 'bottom' ? 2 : 1,
        sortWeight: 0,
        index,
      };
    });

    if (tabs.length === 0) {
      return this.getDefaultTabbar(id);
    }

    const hasBottomNav = tabs.some((t: any) => t.styleType === 2);
    return {
      tabs,
      type: hasBottomNav ? 'bottom' : 'capsule',
      updateTime: Date.now(),
      ...(await this.getPublishConfig(id)),
    };
  }

  private async getDefaultTabbar(regionId: string) {
    const defaultTabs = [
      { name: '首页', pagePath: '/pages/tabbar/index/index', iconPath: '/static/tabbar/home.png', selectedIconPath: '/static/tabbar/home-active.png', sortOrder: 0 },
      { name: '圈子', pagePath: '/pages/tabbar/containers/containers', iconPath: '/static/tabbar/circle.png', selectedIconPath: '/static/tabbar/circle-active.png', sortOrder: 1 },
      { name: '发布', pagePath: '', action: 'publish', iconPath: '/static/tabbar/publish.png', selectedIconPath: '/static/tabbar/publish-active.png', sortOrder: 2 },
      { name: '消息', pagePath: '/pages/tabbar/news/news', iconPath: '/static/tabbar/message.png', selectedIconPath: '/static/tabbar/message-active.png', sortOrder: 3 },
      { name: '我的', pagePath: '/pages/tabbar/auth/PersonalHomepage', iconPath: '/static/tabbar/mine.png', selectedIconPath: '/static/tabbar/mine-active.png', sortOrder: 4 },
    ];

    const tabs = defaultTabs.map((tab, index) => ({
      name: tab.name,
      pagePath: tab.pagePath,
      action: tab.action || '',
      icons: {
        selected: tab.selectedIconPath,
        unselected: tab.iconPath,
      },
      colors: {
        selected: '#1677ff',
        unselected: '#8A8A8A',
      },
      style: {
        iconWidth: 24,
        iconHeight: 24,
        fontSize: 12,
      },
      hideText: false,
      isAvatarMode: tab.name === '我的',
      styleType: 2,
      sortWeight: 0,
      index,
    }));

    return {
      tabs,
      type: 'bottom',
      updateTime: Date.now(),
      ...(await this.getPublishConfig(regionId)),
    };
  }

  private async getPublishConfig(regionId: string) {
    const [noteSettings, secondHandSettings, errandConfig] = await Promise.all([
      this.prisma.noteSettings.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.secondHandRegionSetting.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.errandConfig.findUnique({ where: { regionId } }).catch(() => null),
    ]);

    const noteEnabled =
      !noteSettings ||
      noteSettings.allowTextNote ||
      noteSettings.allowImageNote ||
      noteSettings.allowVideoNote;

    return {
      noteSettings: {
        enableRegionPosting: noteEnabled,
        allowTextNote: noteSettings?.allowTextNote ?? true,
        allowImageNote: noteSettings?.allowImageNote ?? true,
        allowVideoNote: noteSettings?.allowVideoNote ?? true,
        contentDeclaration: '发布校园生活、经验和新鲜事',
      },
      secondHandConfig: {
        enabled: secondHandSettings?.enableSecondHand ?? false,
        noticeText: '发布你不再需要的物品',
      },
      errandServiceEnabled: errandConfig?.isOpen ?? false,
    };
  }

  async getSearchConfig(regionId: string) {
    return { hotKeywords: [], categories: [] };
  }

  async getShareSettings(regionId: string) {
    return this.prisma.shareSettings.findUnique({ where: { regionId } });
  }

  async getHomePageContent(query: any) {
    const { region_id } = query;
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.max(Number(query.limit || 20), 1);
    if (!region_id) {
      return { data: { items: [], total: 0, page, limit }, items: [] };
    }

    const [region, customItems] = await Promise.all([
      this.prisma.region.findUnique({
        where: { id: String(region_id) },
        include: {
          banners: { where: { isShow: true }, orderBy: { sortOrder: 'asc' } },
          notices: { where: { isShow: true }, orderBy: [{ isTop: 'desc' }, { createdAt: 'desc' }] },
          navs: { where: { isShow: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      this.prisma.regionContentItem.findMany({
        where: { regionId: String(region_id), isShow: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    if (!region) {
      return { data: { items: [], total: 0, page, limit }, items: [] };
    }

    const generatedItems = this.buildHomeContentFromRegion(region);
    const legacyCustomItems = customItems.map((item, index) =>
      this.toHomeContentItem(item, generatedItems.length + index),
    );
    const sourceItems = [...generatedItems, ...legacyCustomItems].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

    const start = (page - 1) * limit;
    const items = sourceItems.slice(start, start + limit);

    return {
      data: {
        items,
        total: sourceItems.length,
        page,
        limit,
      },
      items,
      total: sourceItems.length,
      page,
      limit,
    };
  }
}
