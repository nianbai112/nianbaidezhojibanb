import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class RegionService {
  constructor(private readonly prisma: PrismaService) {}

  private toBool(value: any, fallback = true) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value === '1' || value === 'true';
    return Boolean(value);
  }

  private toOptionalBool(value: any) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(text)) return false;
    if (['1', 'true', 'yes', 'on'].includes(text)) return true;
    return Boolean(value);
  }

  private toOptionalNumber(value: any) {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private setIfDefined(target: Record<string, any>, key: string, value: any) {
    if (value !== undefined) target[key] = value;
  }

  private isStackFlowColor(value: string) {
    const hex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    const channel = '[-+]?(?:\\d+|\\d*\\.\\d+)%?';
    const functional = new RegExp(`^(?:rgb|rgba|hsl|hsla)\\(\\s*${channel}(?:\\s*,\\s*${channel}){2,3}\\s*\\)$`, 'i');
    return hex.test(value) || functional.test(value);
  }

  private normalizeStackFlowStyle(source: any, base: any = {}) {
    const result: Record<string, any> = {};
    const fields: Array<[string, string]> = [
      ['cardBg', 'card_bg'],
      ['paperBg', 'paper_bg'],
      ['spineColor', 'spine_color'],
      ['quoteColor', 'quote_color'],
      ['mastheadColor', 'masthead_color'],
      ['accentColor', 'accent_color'],
      ['textColor', 'text_color'],
      ['subTextColor', 'sub_text_color'],
      ['sheetBorderColor', 'sheet_border_color'],
      ['badgeBg', 'badge_bg'],
    ];
    const apply = (value: any, rejectUnsafe: boolean) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      if (Object.prototype.hasOwnProperty.call(value, 'enabled')) {
        const enabled = this.toOptionalBool(value.enabled);
        if (enabled !== undefined) result.enabled = enabled;
      }
      fields.forEach(([camelKey, snakeKey]) => {
        const raw = value[camelKey] !== undefined ? value[camelKey] : value[snakeKey];
        if (raw === undefined || raw === null || raw === '') return;
        const color = String(raw).trim();
        if (!this.isStackFlowColor(color)) {
          if (rejectUnsafe) throw new BadRequestException(`叠纸流颜色格式无效: ${camelKey}`);
          return;
        }
        result[camelKey] = color;
      });
    };
    apply(base, false);
    apply(source, true);
    return result;
  }

  private isSwitchSupported(region: any) {
    return this.toBool(region?.regionSwitchSupported, true);
  }

  private normalizeMiniPath(path?: string) {
    const raw = String(path || '').trim();
    if (!raw || raw === 'custom') return '';
    if (raw.startsWith('internal:') || raw.startsWith('miniapp:') || raw.startsWith('miniapp_half:') || raw.startsWith('img:') || raw.startsWith('tel:') || raw.startsWith('http')) {
      return raw;
    }
    const clean = raw.replace(/^\/+/, '');
    const aliases: Record<string, string> = {
      'pages/note/list': 'pagesB/post/post',
      'pages/takeout/list': 'pagesA/merchant/merchant',
      'pagesA/selection/selection': 'pagesA/merchant/merchant',
      'pages/secondhand/list': 'pages/tabbar/index/index?tab=secondhand',
      'pages/activity/list': 'pagesA/selection/list/list?tabIndex=0',
      'pages/merchant/list': 'pagesA/merchant/merchant',
      note: 'pagesB/post/post',
      takeout: 'pagesA/merchant/merchant',
      secondhand: 'pages/tabbar/index/index?tab=secondhand',
      activity: 'pagesA/selection/list/list?tabIndex=0',
      merchant: 'pagesA/merchant/merchant',
      circle: 'pages/tabbar/containers/containers',
    };
    return aliases[clean] || clean;
  }

  private toMiniLink(path?: string) {
    const clean = this.normalizeMiniPath(path);
    if (!clean) return '';
    if (clean.startsWith('internal:') || clean.startsWith('miniapp:') || clean.startsWith('miniapp_half:') || clean.startsWith('img:') || clean.startsWith('tel:') || clean.startsWith('http')) {
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
    const path = String(item?.path || item?.page || item?.link || fallback || '').trim();
    const pathWithQuery = appendQuery(path);
    if (linkType === 'none') return '';
    if (linkType === 'image') return `img:${path || item?.image || item?.imageUrl || item?.url || ''}`;
    if (linkType === 'web' || linkType === 'webview') {
      return path.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase());
    }
    if (linkType === 'miniProgram' || linkType === 'miniapp') {
      const appId = item?.appId || item?.appid || '';
      return appId ? `miniapp:${appId}|${this.normalizeMiniPath(pathWithQuery)}` : '';
    }
    if (linkType === 'miniProgramHalf' || linkType === 'miniapp_half') {
      const appId = item?.appId || item?.appid || '';
      return appId ? `miniapp_half:${appId}|${this.normalizeMiniPath(pathWithQuery)}` : '';
    }
    if (linkType === 'tel') return path ? `tel:${path}` : '';
    return this.toMiniLink(pathWithQuery);
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
    const defaultIconMap: Record<string, string> = {
      note: '/static/logo.jpg',
      takeout: '/static/yw.png',
      secondhand: '/static/yhq.png',
      activity: '/static/tj.png',
      rating: '/static/v.png',
      checkin: '/static/icon-weizhi.png',
    };
    return tabs.map((tab, index) => ({
      ...tab,
      id: this.getHomeTabId(tab, index),
      icon: tab?.icon || tab?.iconUrl || defaultIconMap[String(tab?.type || '').toLowerCase()] || '/static/logo.jpg',
      image: tab?.image || tab?.imageUrl || tab?.icon || defaultIconMap[String(tab?.type || '').toLowerCase()] || '/static/logo.jpg',
      enabled: tab?.enabled !== false,
      sortOrder: tab?.sortOrder ?? tab?.sort_order ?? index,
    }));
  }

  private defaultHomeNavLayoutConfig() {
    return [
      { name: '笔记', subtitle: '', icon: '/static/logo.jpg', page: 'pagesB/post/post', path: 'pagesB/post/post', linkType: 'internal', appId: '', query: '', remark: '', enabled: true, sortOrder: 0 },
      { name: '外卖', subtitle: '', icon: '/static/yw.png', page: 'pagesA/merchant/merchant', path: 'pagesA/merchant/merchant', linkType: 'internal', appId: '', query: '', remark: '', enabled: true, sortOrder: 1 },
      { name: '二手', subtitle: '', icon: '/static/yhq.png', page: 'pages/tabbar/index/index?tab=secondhand', path: 'pages/tabbar/index/index?tab=secondhand', linkType: 'internal', appId: '', query: '', remark: '', enabled: true, sortOrder: 2 },
      { name: '活动', subtitle: '', icon: '/static/tj.png', page: 'pagesA/selection/list/list?tabIndex=0', path: 'pagesA/selection/list/list?tabIndex=0', linkType: 'internal', appId: '', query: '', remark: '', enabled: true, sortOrder: 3 },
    ];
  }

  private normalizeHomeNavLayoutConfig(value: any) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.items)) return value.items;
    return Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter((item) => item && typeof item === 'object');
  }

  private normalizeNavigationPermission(permission: any) {
    const value = String(permission ?? '').trim().toLowerCase();
    const aliases: Record<string, string> = {
      unlimited: 'unlimited',
      all: 'unlimited',
      public: 'unlimited',
      region_manager: 'region_manager',
      region_admin: 'region_manager',
      manager: 'region_manager',
      merchant: 'merchant',
      shop: 'merchant',
      merchant_owner: 'merchant_owner',
      shop_owner: 'merchant_owner',
      dorm_shop_owner: 'dorm_shop_owner',
      dormitory_shop_owner: 'dorm_shop_owner',
      dorm_merchant_owner: 'dorm_shop_owner',
      dorm_shop: 'dorm_shop_owner',
      '宿舍小店店主': 'dorm_shop_owner',
      circle_owner: 'circle_owner',
      circle_manager: 'circle_owner',
      circle_master: 'circle_owner',
      owner_circle: 'circle_owner',
      '圈主': 'circle_owner',
      '圈子管理员': 'circle_owner',
      '圈子管理': 'circle_owner',
      delivery_rider: 'delivery_rider',
      rider: 'delivery_rider',
      courier: 'delivery_rider',
      runner: 'delivery_rider',
      delivery: 'delivery_rider',
      takeout_rider: 'delivery_rider',
      takeaway_rider: 'delivery_rider',
      waimai_rider: 'delivery_rider',
      '外卖员': 'delivery_rider',
      '骑手': 'delivery_rider',
    };
    return aliases[value] || 'unlimited';
  }

  private normalizeProfileLayoutItems(items: any) {
    const normalizeProfileImage = (value: any) =>
      String(value || '').trim() === '/static/logo.jpg' ? '/static/logo.png' : value || '/static/logo.png';
    const defaultItems = [
      { id: 'orders', title: '我的订单', description: '订单、配送和售后', main_image: '/static/logo.png', path: 'pagesA/order/order', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 0 },
      { id: 'wallet', title: '我的钱包', description: '余额、提现和流水', main_image: '/static/logo.png', path: 'pagesA/withdraw/withdraw', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 1 },
      { id: 'share', title: '分享有礼', description: '邀请同学加入', main_image: '/static/logo.png', path: 'pagesA/news/SharingCourtesy/SharingCourtesy', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 2 },
      { id: 'merchant', title: '商家中心', description: '入驻与店铺管理', main_image: '/static/logo.png', path: 'pagesA/MerchantManagement/managerial', type: 'internal_jump', navigation_permission: 'merchant', enabled: true, sortOrder: 3 },
      { id: 'dorm_shop_owner', title: '宿舍小店', description: '商品、订单和营业设置', main_image: '/static/logo.png', path: '/pagesA/DormShopOwner/DormShopOwner', type: 'internal_jump', navigation_permission: 'dorm_shop_owner', enabled: true, sortOrder: 4 },
      { id: 'second_hand_manage', title: '我的闲置', description: '发布、下架和处理二手交易', main_image: '/static/logo.png', path: '/pagesC/SecondHand/MySecondHand/MySecondHand', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 5 },
      { id: 'circle_manage', title: '圈子管理', description: '管理我创建的圈子', main_image: '/static/logo.png', path: '/pagesB/circle-manage/circle-manage', type: 'internal_jump', navigation_permission: 'circle_owner', enabled: true, sortOrder: 6 },
      { id: 'settings', title: '账号设置', description: '资料、隐私和系统设置', main_image: '/static/logo.png', path: 'pages/auth/settings/settings', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 7 },
    ];
    const ensureRequiredItems = (sourceItems: any[]) => {
      const hasDormShopOwner = sourceItems.some((item: any) => {
        const path = String(item?.path || item?.url || item?.page || item?.link || item?.mini_program?.path || '').trim();
        return item?.id === 'dorm_shop_owner'
          || this.normalizeNavigationPermission(item?.navigation_permission || item?.navigationPermission || '') === 'dorm_shop_owner'
          || path.includes('DormShopOwner/DormShopOwner');
      });
      const hasCircleManage = sourceItems.some((item: any) => {
        const path = String(item?.path || item?.url || item?.page || item?.link || item?.mini_program?.path || '').trim();
        return item?.id === 'circle_manage'
          || this.normalizeNavigationPermission(item?.navigation_permission || item?.navigationPermission || '') === 'circle_owner'
          || path.includes('circle-manage');
      });
      const hasSecondHandManage = sourceItems.some((item: any) => {
        const path = String(item?.path || item?.url || item?.page || item?.link || item?.mini_program?.path || '').trim();
        return item?.id === 'second_hand_manage' || path.includes('SecondHand/MySecondHand/MySecondHand');
      });
      const requiredItems = [
        !hasDormShopOwner ? defaultItems.find((item) => item.id === 'dorm_shop_owner') : null,
        !hasSecondHandManage ? defaultItems.find((item) => item.id === 'second_hand_manage') : null,
        !hasCircleManage ? defaultItems.find((item) => item.id === 'circle_manage') : null,
      ].filter(Boolean);
      return requiredItems.length ? [...sourceItems, ...requiredItems] : sourceItems;
    };
    const mapItems = (sourceItems: any[]) => sourceItems
      .filter((item: any) => {
        if (!item || item.enabled === false) return false;
        const linkType = String(item.type || item.linkType || item.link_type || '').trim();
        const path = String(item.path || item.url || item.page || item.link || item.mini_program?.path || '').trim();
        return linkType === 'popup' || !!path;
      })
      .map((item: any, index: number) => {
        const linkType = String(item.type || item.linkType || item.link_type || '').trim();
        const path = String(item.path || item.url || item.page || item.link || '').trim();
        const query = String(item.query || '').trim().replace(/^\?+/, '');
        const fullPath = query
          ? path.includes('?')
            ? `${path}&${query}`
            : `${path}?${query}`
          : path;
        const appId = item.appId || item.appid || item.mini_program?.appid || '';
        const miniPath = item.mini_program?.path || fullPath || '';
        const type =
          linkType === 'external_jump' || linkType === 'miniProgram' || linkType === 'miniapp'
            ? 'external_jump'
            : linkType === 'web_page' || linkType === 'webview'
              ? 'web_page'
              : linkType === 'popup'
                ? 'popup'
                : 'internal_jump';

        return {
          ...item,
          id: item.id || `profile_${index}`,
          title: item.title || item.name || '功能入口',
          description: item.description || item.subtitle || '',
          main_image: normalizeProfileImage(item.main_image || item.mainImage || item.image || item.iconImage || item.icon),
          image: normalizeProfileImage(item.image || item.main_image || item.mainImage || item.iconImage || item.icon),
          type,
          url: type === 'web_page' ? (item.url || fullPath) : fullPath,
          mini_program: {
            ...(item.mini_program || {}),
            appid: appId,
            path: miniPath,
          },
          navigation_permission: this.normalizeNavigationPermission(item.navigation_permission || item.navigationPermission || 'unlimited'),
          enabled: item.enabled !== false,
          sortOrder: item.sortOrder ?? item.sort_order ?? index,
        };
      })
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const sourceItems = Array.isArray(items) && items.length ? ensureRequiredItems(items) : defaultItems;
    const normalized = mapItems(sourceItems);
    return normalized.length ? normalized : mapItems(defaultItems);
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
      mascot_image: item.mascot_image || item.mascotImage || image,
      search_placeholder: item.search_placeholder || item.searchPlaceholder || item.placeholder || '',
      placeholder: item.placeholder || item.search_placeholder || item.searchPlaceholder || '',
      link_url: item.link_url || this.toMiniLink(link),
      link: item.link || this.toMiniLink(link),
      sort_order: item.sortOrder ?? item.sort_order ?? index,
      status: item.isShow === false ? 0 : 1,
      is_show: item.isShow !== false,
    };
  }

  private isHomeHeroModule(item: any) {
    const type = String(item?.module_type || item?.type || '').toLowerCase();
    return type === 'hero' || type === 'home_hero' || type === 'campus_hero';
  }

  private buildHomeContentFromRegion(region: any) {
    const items: any[] = [];
    const push = (item: any) => items.push(this.toHomeContentItem(item, items.length));
    const carouselImages = Array.isArray(region.carouselImages) ? region.carouselImages : [];
    const heroEntry = carouselImages.find((entry: any) => this.isHomeHeroModule(entry));

    if (heroEntry && this.toBool(heroEntry.enabled ?? heroEntry.isShow, true)) {
      const heroImage = heroEntry.mascot_image || heroEntry.mascotImage || heroEntry.image || heroEntry.imageUrl || heroEntry.image_url || heroEntry.url || '';
      push({
        ...heroEntry,
        id: heroEntry.id || 'home_hero',
        regionId: region.id,
        module_type: 'hero',
        type: 'hero',
        image_url: heroImage,
        image: heroImage,
        sortOrder: -100,
      });
    }

    if (this.toBool(region.showCarousel, true)) {
      carouselImages.filter((entry: any) => !this.isHomeHeroModule(entry)).forEach((entry: any, index: number) => {
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
      const navConfig = this.normalizeHomeNavLayoutConfig(region.homeNavLayoutConfig);
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
    const stackFlowStyle = this.normalizeStackFlowStyle(settings.stack_flow_style || settings.stackFlowStyle || {});
    const managerUser = raw.managerUser || null;
    const managerId =
      raw.managerUserId ||
      managerUser?.id ||
      settings.operator?.managerUserId ||
      settings.operator?.manager_user_id ||
      settings.operator?.managerId ||
      settings.operator?.manager_id ||
      '';
    const managerNickname = managerUser?.nickname || raw.managerName || settings.operator?.managerName || '';
    const managerAvatar = managerUser?.avatar || settings.operator?.managerAvatar || '';
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
      manager_id: managerId,
      managerId,
      manager_user_id: managerId,
      managerUserId: managerId,
      manager_nickname: managerNickname,
      managerNickname,
      manager_avatar: managerAvatar,
      managerAvatar,
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
      region_switch_supported: raw.regionSwitchSupported ?? true,
      regionSwitchSupported: raw.regionSwitchSupported ?? true,
      region_switch_notice_required: true,
      region_switch_ad_unit_id: '',
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
      profile_layout_items: this.normalizeProfileLayoutItems(raw.profileLayoutItems),
      home_nav_layout_config: this.normalizeHomeNavLayoutConfig(raw.homeNavLayoutConfig).length ? this.normalizeHomeNavLayoutConfig(raw.homeNavLayoutConfig) : this.defaultHomeNavLayoutConfig(),
      note_list_style: noteConfig.note_list_style || null,
      note_config: noteConfig,
      circle_config: circleConfig,
      stack_flow_style: stackFlowStyle,
      stackFlowStyle,
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
        stack_flow_style: stackFlowStyle,
        operator: {
          ...(settings.operator || {}),
          managerName: raw.managerName || settings.operator?.managerName || '',
          contactPhone: raw.managerPhone || settings.operator?.contactPhone || '',
          managerWechat: raw.managerWechat || settings.operator?.managerWechat || '',
          managerUserId: managerId,
          managerId,
          managerNickname,
          managerAvatar,
        },
      },
      sort: raw.sortOrder ?? 0,
      sortOrder: raw.sortOrder ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
    return result;
  }

  async selectRegion(userId: string, regionId: string) {
    const targetRegionId = String(regionId || '').trim();
    if (!userId) {
      throw new BadRequestException('用户身份不能为空');
    }
    if (!targetRegionId) {
      throw new BadRequestException('区域不能为空');
    }

    const [user, targetRegion] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
      this.prisma.region.findUnique({ where: { id: targetRegionId } }),
    ]);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (!targetRegion || !targetRegion.isOpen) {
      throw new NotFoundException('区域不存在或未开放');
    }

    const currentRegionId = user.profile?.regionId || '';
    if (currentRegionId && currentRegionId !== targetRegion.id) {
      const currentRegion = await this.prisma.region.findUnique({ where: { id: currentRegionId } });
      if (currentRegion && !this.isSwitchSupported(currentRegion)) {
        throw new ForbiddenException('当前区域不允许用户自行切换，请联系管理员处理');
      }
    }

    await this.prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        regionId: targetRegion.id,
        region: targetRegion.name,
      },
      update: {
        regionId: targetRegion.id,
        region: targetRegion.name,
      },
    });

    return {
      success: true,
      region_id: targetRegion.id,
      regionId: targetRegion.id,
      region_name: targetRegion.name,
      regionName: targetRegion.name,
      regionSource: 'profile',
    };
  }

  async list() {
    const regions = await this.prisma.region.findMany({
      where: { isOpen: true },
      include: {
        managerUser: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
      },
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
        managerUser: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
      },
    });
    if (!region) throw new NotFoundException('区域不存在');
    return this.normalizeRegion(region);
  }

  async updateManagerSettings(id: string, userId: string, dto: any) {
    if (!userId) throw new BadRequestException('用户身份不能为空');
    const region = await this.prisma.region.findUnique({
      where: { id },
      include: {
        managerUser: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
      },
    });
    if (!region) throw new NotFoundException('区域不存在');
    if (region.managerUserId !== userId) {
      throw new ForbiddenException('无权修改该区域配置');
    }

    const data: Record<string, any> = {};
    this.setIfDefined(data, 'logo', dto.logo);
    this.setIfDefined(data, 'name', dto.name);
    this.setIfDefined(data, 'managerName', dto.manager_name ?? dto.managerName);
    this.setIfDefined(data, 'managerPhone', dto.manager_phone ?? dto.managerPhone);
    this.setIfDefined(data, 'description', dto.description);
    this.setIfDefined(data, 'cover', dto.background_url ?? dto.backgroundUrl ?? dto.cover);
    this.setIfDefined(data, 'isOpen', this.toOptionalBool(dto.status));
    this.setIfDefined(data, 'showCarousel', this.toOptionalBool(dto.show_carousel ?? dto.showCarousel));
    this.setIfDefined(data, 'showAnnouncement', this.toOptionalBool(dto.show_announcement ?? dto.showAnnouncement));
    this.setIfDefined(data, 'showKingkong', this.toOptionalBool(dto.show_kingkong ?? dto.showKingkong));
    this.setIfDefined(data, 'showHotList', this.toOptionalBool(dto.show_hot_list ?? dto.showHotList));
    this.setIfDefined(data, 'hotFeaturedDisplay', dto.hot_featured_display ?? dto.hotFeaturedDisplay);
    this.setIfDefined(data, 'homeFeatureStyle', dto.home_feature_style ?? dto.homeFeatureStyle);
    this.setIfDefined(data, 'homeNavLayout', dto.home_nav_layout ?? dto.homeNavLayout);
    this.setIfDefined(data, 'carouselImages', dto.carousel_images ?? dto.carouselImages);
    this.setIfDefined(data, 'regionTabs', dto.region_tabs ?? dto.regionTabs);
    this.setIfDefined(data, 'homeLeaderboard', dto.home_leaderboard ?? dto.homeLeaderboard);
    this.setIfDefined(data, 'homeNavLayoutConfig', dto.home_nav_layout_config ?? dto.homeNavLayoutConfig);
    this.setIfDefined(data, 'messagePageLayout', dto.message_page_layout ?? dto.messagePageLayout);
    this.setIfDefined(data, 'profilePageLayout', dto.profile_page_layout ?? dto.profilePageLayout);
    this.setIfDefined(data, 'privateMessageEnabled', this.toOptionalBool(dto.private_message_enabled ?? dto.privateMessageEnabled));
    this.setIfDefined(data, 'isHot', this.toOptionalBool(dto.is_hot ?? dto.isHot));
    this.setIfDefined(data, 'latitude', this.toOptionalNumber(dto.latitude));
    this.setIfDefined(data, 'longitude', this.toOptionalNumber(dto.longitude));
    const stackFlowInput = dto.stack_flow_style ?? dto.stackFlowStyle;
    if (stackFlowInput !== undefined) {
      const settings = region.settings && typeof region.settings === 'object' && !Array.isArray(region.settings)
        ? region.settings as Record<string, any>
        : {};
      data.settings = {
        ...settings,
        stack_flow_style: this.normalizeStackFlowStyle(
          stackFlowInput,
          settings.stack_flow_style || settings.stackFlowStyle || {},
        ),
      };
    }

    const updated = await this.prisma.region.update({
      where: { id },
      data,
      include: {
        managerUser: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
      },
    });
    return this.normalizeRegion(updated);
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
    const messageBadgeStyle = ['bubble', 'number', 'dot', 'none'].includes(config.messageBadgeStyle)
      ? config.messageBadgeStyle
      : 'bubble';
    const list = Array.isArray(config.list)
      ? config.list
      : Array.isArray(config.tabs)
        ? config.tabs
        : [];

    const enabledTabs = list
      .filter((tab: any) => tab.enabled !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .slice(0, 5);
    const configType = config.type === 'capsule' || config.type === 'bottom' ? config.type : '';
    const navType = configType || (enabledTabs.some((tab: any) => tab.navType === 'capsule')
        ? 'capsule'
        : 'bottom');
    const clampSize = (value: any, fallback: number, min: number, max: number) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, Math.round(number)));
    };

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
          iconWidth: clampSize(tab.width, 24, 16, 128),
          iconHeight: clampSize(tab.height, 24, 16, 128),
          fontSize: clampSize(tab.fontSize, 12, 8, 32),
        },
        hideText: !!tab.hideText,
        isAvatarMode: !!tab.avatarMode,
        styleType: navType === 'bottom' ? 2 : 1,
        sortWeight: 0,
        index,
      };
    });

    if (tabs.length === 0) {
      return this.getDefaultTabbar(id);
    }

    return {
      tabs,
      type: navType,
      messageBadgeStyle,
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
      messageBadgeStyle: 'bubble',
      updateTime: Date.now(),
      ...(await this.getPublishConfig(regionId)),
    };
  }

  private normalizePublishMenu(value: any) {
    const source = value && typeof value === 'object' ? value : {};
    const entries = source.entries && typeof source.entries === 'object' ? source.entries : {};
    const text = (input: any, fallback: string) => typeof input === 'string' && input.trim() ? input.trim() : fallback;
    const image = (input: any) => typeof input === 'string' ? input.trim() : '';
    const entry = (key: 'note' | 'secondhand' | 'errand', title: string, subtitle: string) => {
      const current = entries[key] && typeof entries[key] === 'object' ? entries[key] : {};
      return {
        enabled: current.enabled !== false,
        title: text(current.title, title),
        subtitle: text(current.subtitle, subtitle),
        image: image(current.image),
      };
    };

    return {
      title: text(source.title, '今天想发点什么？'),
      subtitle: text(source.subtitle, '选择你要发布的内容类型'),
      heroImage: image(source.heroImage),
      entries: {
        note: entry('note', '发笔记', '发布校园生活、经验和新鲜事'),
        secondhand: entry('secondhand', '出闲置', '发布你不再需要的物品'),
        errand: entry('errand', '跑腿任务', '发布帮取快递、代买等需求'),
      },
    };
  }

  private async getPublishConfig(regionId: string) {
    const [noteSettings, secondHandSettings, errandConfig, region] = await Promise.all([
      this.prisma.noteSettings.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.secondHandRegionSetting.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.errandConfig.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.region.findUnique({ where: { id: regionId }, select: { settings: true } }).catch(() => null),
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
        enabled: secondHandSettings?.enableSecondHand ?? true,
        noticeText: '发布你不再需要的物品',
      },
      errandServiceEnabled: errandConfig?.isOpen ?? false,
      publishMenu: this.normalizePublishMenu((region?.settings as any)?.publishMenu),
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
