import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { InteractionPermissionService } from '../../common/services/interaction-permission.service';
import { GrowthService } from '../growth/growth.service';
import { UserSessionRevocationService } from '../websocket/user-session-revocation.service';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
import { IpGeoService } from '../ip-geo/ip-geo.service';
import { PaymentService } from '../payment/payment.service';
import {
  UpdateProfileDto, UpdateSettingsDto, StudentVerifyDto, ListQueryDto,
} from './dto/user.dto';
import { Gender, RoleType, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class UserService {
  private readonly profileCacheTtl = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifyService: NotifyService,
    private readonly userAccess: UserAccessPolicyService,
    private readonly interactionPermission: InteractionPermissionService,
    private readonly growthService: GrowthService,
    private readonly userSessionRevocation: UserSessionRevocationService,
    private readonly wsNative: WsNativeGateway,
    private readonly ipGeo: IpGeoService,
    private readonly paymentService: PaymentService,
  ) {}

  private profileCacheKey(userId: string, regionId?: string, viewerId?: string) {
    return `user:profile:v2:${userId}:${regionId || 'all'}:${viewerId || 'self'}`;
  }

  private async clearProfileCache(userId: string) {
    await Promise.all([
      this.redis.delPattern(`user:profile:${userId}:*`).catch(() => undefined),
      this.redis.delPattern(`user:profile:v2:${userId}:*`).catch(() => undefined),
    ]);
  }

  private async withSelfUnbanUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const wrapped = await this.redis.withLock(
      `self-unban:user:${userId}`,
      60,
      async () => ({ value: await task() }),
    );
    if (!wrapped) throw new BadRequestException('解封状态正在处理，请稍后重试');
    return wrapped.value;
  }

  private formatPublicUser(user: any) {
    const publicUid = user?.publicUid || user?.public_uid || user?.displayUid || user?.uid || null;
    return {
      ...user,
      uid: publicUid,
      public_uid: publicUid,
      publicUid,
      legacy_uid: user?.uid || null,
      internal_uid: user?.uid || null,
    };
  }

  private async ensurePublicUid(user: any) {
    if (!user?.id) return user;
    if (user.publicUid) return user;
    for (let i = 0; i < 8; i += 1) {
      const publicUid = crypto.randomInt(10000000, 100000000);
      try {
        return await (this.prisma.user as any).update({
          where: { id: user.id },
          data: { publicUid },
          include: { profile: true, settings: true, studentVerify: true, wallet: true },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
      }
    }
    const fallbackUid = 10000000 + (Math.abs(Number(user.uid || 0) * 7919) % 90000000);
    return (this.prisma.user as any).update({
      where: { id: user.id },
      data: { publicUid: fallbackUid },
      include: { profile: true, settings: true, studentVerify: true, wallet: true },
    });
  }

  private toMiniGender(gender?: Gender | string | null) {
    if (gender === Gender.MALE || gender === 'MALE' || gender === 'male' || gender === '1') return 1;
    if (gender === Gender.FEMALE || gender === 'FEMALE' || gender === 'female' || gender === '2') return 2;
    return 0;
  }

  private toPositiveInt(value: any, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
  }

  private publicAssetUrl(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:|wxfile:|cloud:|data:|blob:)/i.test(raw)) return raw;

    const normalized = raw.startsWith('uploads/') ? `/${raw}` : raw;
    if (!normalized.startsWith('/uploads/')) return normalized;

    const base =
      process.env.PUBLIC_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.APP_URL ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000');

    return base ? `${base.replace(/\/+$/, '')}${normalized}` : normalized;
  }

  private async getUserProfileStats(userId: string, viewerId?: string) {
    const canCompareFollow = !!viewerId && viewerId !== userId;
    const [followingCount, followerCount, postLikes, commentLikes, following, followedBy] = await Promise.all([
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.post.aggregate({
        where: { userId, deletedAt: null },
        _sum: { likeCount: true },
      }),
      this.prisma.comment.aggregate({
        where: { userId, deletedAt: null, status: { not: 'deleted' } },
        _sum: { likeCount: true },
      }),
      canCompareFollow
        ? this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId!, followingId: userId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      canCompareFollow
        ? this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: userId, followingId: viewerId! } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    const totalLikeCount = Number(postLikes._sum.likeCount || 0) + Number(commentLikes._sum.likeCount || 0);
    const isFollowing = !!following;
    const isFollowingMe = !!followedBy;
    return {
      followingCount,
      followerCount,
      totalLikeCount,
      isFollowing,
      isFollowingMe,
      isMutual: isFollowing && isFollowingMe,
      isSelf: !viewerId || viewerId === userId,
    };
  }

  private async getFollowRelationSets(viewerId: string | undefined, userIds: string[]) {
    const ids = Array.from(new Set(userIds.filter((id) => id && id !== viewerId)));
    const viewerFollowingIds = new Set<string>();
    const followingViewerIds = new Set<string>();
    if (!viewerId || ids.length === 0) return { viewerFollowingIds, followingViewerIds };

    const relations = await this.prisma.follow.findMany({
      where: {
        OR: [
          { followerId: viewerId, followingId: { in: ids } },
          { followerId: { in: ids }, followingId: viewerId },
        ],
      },
      select: { followerId: true, followingId: true },
    });
    relations.forEach((relation) => {
      if (relation.followerId === viewerId) viewerFollowingIds.add(relation.followingId);
      if (relation.followingId === viewerId) followingViewerIds.add(relation.followerId);
    });
    return { viewerFollowingIds, followingViewerIds };
  }

  private serializeFollowListUser(user: any, relationSets: { viewerFollowingIds: Set<string>; followingViewerIds: Set<string> }) {
    const notesCount = Number(user?._count?.posts || 0);
    const fansCount = Number(user?._count?.followers || 0);
    const isFollowing = relationSets.viewerFollowingIds.has(user.id);
    const isFollowedBy = relationSets.followingViewerIds.has(user.id);
    return {
      user_id: user.id,
      userId: user.id,
      nickname: user.nickname || '灵萌用户',
      avatar: user.avatar || '',
      bio: user.profile?.bio || '',
      notes_count: notesCount,
      notesCount,
      post_count: notesCount,
      postCount: notesCount,
      fans_count: fansCount,
      fansCount,
      follower_count: fansCount,
      followerCount: fansCount,
      is_following: isFollowing,
      is_followed: isFollowing,
      followed: isFollowing,
      is_followed_by: isFollowedBy,
      is_following_me: isFollowedBy,
      is_mutual: isFollowing && isFollowedBy,
    };
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
            path: item.mini_program?.path || fullPath,
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

  async getProfile(userId: string, regionId?: string, viewerId?: string) {
    const cacheKey = this.profileCacheKey(userId, regionId, viewerId || userId);
    const cached = await this.redis.getJson<any>(cacheKey).catch(() => null);
    if (cached) return cached;

    let user: any = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true, studentVerify: true, wallet: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    user = this.formatPublicUser(await this.ensurePublicUid(user));
    const latestLocation = await this.ipGeo.visibleLocation({
      ip: user.lastLoginIp || '',
      country: user.lastLoginCountry || '',
      province: user.lastLoginProvince || '',
      city: user.lastLoginCity || '',
      district: user.lastLoginDistrict || '',
      latitude: null,
      longitude: null,
      adcode: '',
      provider: 'aliyun-market-lundear',
    });

    const rider = await this.prisma.regionRider.findUnique({
      where: { userId },
      select: { id: true, userId: true, regionId: true, verifyStatus: true, status: true },
    });
    const isApprovedDeliveryRider =
      !!rider && rider.verifyStatus === 'approved' && (!regionId || rider.regionId === regionId);
    const dormShop = await this.prisma.merchant.findFirst({
      where: {
        userId,
        businessType: 'dorm_shop',
        status: { in: ['approved', 'closed'] },
        ...(regionId ? { regionId } : {}),
      },
      select: { id: true, regionId: true, status: true, name: true },
      orderBy: { createdAt: 'desc' },
    });
    const isDormShopOwner = !!dormShop;
    const [directManagedRegion, roleManagedRegion, managedCircles] = await Promise.all([
      this.prisma.region.findFirst({
        where: regionId ? { id: regionId, managerUserId: userId } : { managerUserId: userId },
        select: { id: true, name: true },
      }),
      this.prisma.userRole.findFirst({
        where: {
          userId,
          ...(regionId ? { regionId } : {}),
          role: { type: RoleType.REGION_ADMIN },
        },
        select: { regionId: true, region: { select: { id: true, name: true } } },
      }),
      this.prisma.circle.findMany({
        where: {
          status: { not: 'dissolved' },
          ...(regionId ? { regionId } : {}),
          members: {
            some: {
              userId,
              role: 'OWNER',
              status: { in: ['active', 'muted'] },
            },
          },
        },
        select: {
          id: true,
          name: true,
          icon: true,
          cover: true,
          regionId: true,
          status: true,
          auditStatus: true,
          memberCount: true,
          postCount: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);
    const managerRegionId = directManagedRegion?.id || roleManagedRegion?.regionId || null;
    const managerRegionName = directManagedRegion?.name || roleManagedRegion?.region?.name || '';
    const isRegionManager = !!managerRegionId;
    const circleManageList = managedCircles.map((circle) => ({
      id: circle.id,
      circle_id: circle.id,
      circleId: circle.id,
      name: circle.name,
      logo: circle.icon || circle.cover || '/static/logo.jpg',
      icon: circle.icon || circle.cover || '/static/logo.jpg',
      cover: circle.cover || circle.icon || '/static/logo.jpg',
      region_id: circle.regionId,
      regionId: circle.regionId,
      status: circle.status,
      audit_status: circle.auditStatus,
      auditStatus: circle.auditStatus,
      member_count: circle.memberCount,
      memberCount: circle.memberCount,
      post_count: circle.postCount,
      postCount: circle.postCount,
    }));
    const isCircleOwner = circleManageList.length > 0;
    const primaryManagedCircleId = circleManageList[0]?.id || null;
    const miniGender = this.toMiniGender(user.profile?.gender);
    const titleRegionId = String(regionId || '').trim();
    const titleWhere: any = { isEnabled: true, type: 'title' };
    if (titleRegionId) {
      titleWhere.OR = [{ regionId: titleRegionId }, { regionId: null }];
    } else {
      titleWhere.regionId = null;
    }
    const [stats, activeMembership, currentTitleRecords, growthSummary] = await Promise.all([
      this.getUserProfileStats(userId, viewerId),
      this.prisma.userMembership.findFirst({
        where: { userId, status: 'active', expiredAt: { gt: new Date() } },
        orderBy: [{ level: 'desc' }, { expiredAt: 'desc' }],
        select: { id: true, planName: true, level: true, expiredAt: true },
      }),
      this.prisma.userTitleRecord.findMany({
        where: { userId, isWearing: true, title: titleWhere },
        include: { title: true },
        orderBy: [{ claimedAt: 'desc' }],
        take: titleRegionId ? 5 : 1,
      }),
      this.growthService.getUserGrowthSummary(userId, regionId).catch(() => null),
    ]);
    const isMember = !!activeMembership;
    const currentTitle = titleRegionId
      ? (currentTitleRecords.find((record: any) => record?.title?.regionId === titleRegionId)
        || currentTitleRecords.find((record: any) => !record?.title?.regionId)
        || currentTitleRecords[0])
      : currentTitleRecords[0];
    const wearingTitle = currentTitle?.title || null;
    const titleImageUrl = wearingTitle?.image || wearingTitle?.icon || '';
    const badgeList: any[] = [];
    const isVerifiedMember = isMember && user.studentVerify?.status === 'APPROVED';
    const privacySettings = this.formatPrivacySettings(user.settings);
    const interactionSettings = privacySettings.interaction_settings;
    const followSettings = privacySettings.follow_settings;
    const contactSettings = privacySettings.contact_settings;
    const growthLevel = growthSummary?.currentLevel || null;
    const nextGrowthLevel = growthSummary?.nextLevel || null;
    const userWithPermissions = {
      ...user,
      name: user.nickname || '',
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      mobile: user.phone || '',
      latest_location: latestLocation ? {
        country: latestLocation.country,
        province: latestLocation.province,
        city: latestLocation.city,
        district: latestLocation.district,
        source: user.lastLoginLocationSource || '',
        located_at: user.lastLoginLocatedAt || null,
      } : null,
      gender: miniGender,
      gender_text: user.profile?.gender || Gender.UNKNOWN,
      birthday: user.profile?.birthday,
      bio: user.profile?.bio || '',
      university: user.studentVerify?.schoolName || user.profile?.school || '',
      school: user.studentVerify?.schoolName || user.profile?.school || '',
      major: user.studentVerify?.major || user.profile?.major || '',
      grade: user.studentVerify?.grade || user.profile?.grade || '',
      wechat: user.profile?.wechat || '',
      qq: user.profile?.qq || '',
      email: user.profile?.email || '',
      student_verified: user.studentVerify?.status === 'APPROVED',
      student_verification_status: user.studentVerify?.status?.toLowerCase() || 'none',
      student_verification_reason: user.studentVerify?.remark || '',
      is_member: isMember,
      isMember,
      member_badge: isMember ? (activeMembership?.planName || '会员') : '',
      memberBadge: isMember ? (activeMembership?.planName || '会员') : '',
      current_title: wearingTitle
        ? {
            id: wearingTitle.id,
            name: wearingTitle.name,
            icon: wearingTitle.icon || '',
            image: wearingTitle.image || '',
            image_url: titleImageUrl,
            background_color: wearingTitle.backgroundColor || '',
            text_color: wearingTitle.textColor || '',
            border_color: wearingTitle.borderColor || '',
          }
        : null,
      currentTitle: wearingTitle,
      title_image_url: titleImageUrl,
      titleImageUrl,
      badges: badgeList,
      user_badges: badgeList,
      growth_summary: growthSummary,
      growthSummary,
      user_growth: growthSummary,
      userGrowth: growthSummary,
      online_signin_api_version: 1,
      onlineSigninApiVersion: 1,
      user_level: growthLevel,
      userLevel: growthLevel,
      next_user_level: nextGrowthLevel,
      nextUserLevel: nextGrowthLevel,
      level_number: growthLevel?.levelNumber || 0,
      levelNumber: growthLevel?.levelNumber || 0,
      level_name: growthLevel?.levelName || '',
      levelName: growthLevel?.levelName || '',
      current_exp: growthSummary?.currentExp || 0,
      currentExp: growthSummary?.currentExp || 0,
      exp_to_next_level: growthSummary?.expToNextLevel || 0,
      expToNextLevel: growthSummary?.expToNextLevel || 0,
      level_progress: growthSummary?.progress || 0,
      levelProgress: growthSummary?.progress || 0,
      level_icon: growthLevel?.levelIcon || '',
      levelIcon: growthLevel?.levelIcon || '',
      level_badge_image: growthLevel?.levelBadgeImage || '',
      levelBadgeImage: growthLevel?.levelBadgeImage || '',
      member_level: activeMembership?.level || 0,
      memberLevel: activeMembership?.level || 0,
      member_expired_at: activeMembership?.expiredAt || null,
      memberExpiredAt: activeMembership?.expiredAt || null,
      identity_level: isVerifiedMember ? 'verified_member' : isMember ? 'member' : user.studentVerify?.status === 'APPROVED' ? 'verified' : 'normal',
      identityLevel: isVerifiedMember ? 'verified_member' : isMember ? 'member' : user.studentVerify?.status === 'APPROVED' ? 'verified' : 'normal',
      following_count: stats.followingCount,
      followingCount: stats.followingCount,
      follow_count: stats.followingCount,
      followCount: stats.followingCount,
      follower_count: stats.followerCount,
      followerCount: stats.followerCount,
      fans_count: stats.followerCount,
      fansCount: stats.followerCount,
      total_like_count: stats.totalLikeCount,
      totalLikeCount: stats.totalLikeCount,
      like_count: stats.totalLikeCount,
      likeCount: stats.totalLikeCount,
      is_following: stats.isFollowing,
      isFollowing: stats.isFollowing,
      is_followed: stats.isFollowing,
      followed: stats.isFollowing,
      is_following_me: stats.isFollowingMe,
      isFollowingMe: stats.isFollowingMe,
      is_followed_by: stats.isFollowingMe,
      is_mutual: stats.isMutual,
      isMutual: stats.isMutual,
      is_self: stats.isSelf,
      isSelf: stats.isSelf,
      privacy_settings: privacySettings,
      privacy_level: privacySettings.privacy_level,
      privacyLevel: privacySettings.privacyLevel,
      allow_follow: privacySettings.allow_follow,
      allowFollow: privacySettings.allowFollow,
      allow_comment: privacySettings.allow_comment,
      allowComment: privacySettings.allowComment,
      allow_message: privacySettings.allow_message,
      allowMessage: privacySettings.allowMessage,
      like_list_visible: interactionSettings.like_list_visible,
      message_permission: interactionSettings.message_permission,
      allow_search: interactionSettings.allow_search,
      show_joined_circles: interactionSettings.show_joined_circles ? 1 : 0,
      following_list_visible: followSettings.following_list_visible,
      followers_list_visible: followSettings.followers_list_visible,
      wechat_permission: contactSettings.wechat.permission,
      wechat_price: String(contactSettings.wechat.price ?? '0.00'),
      phone_permission: contactSettings.phone.permission,
      phone_price: String(contactSettings.phone.price ?? '0.00'),
      is_rider: isApprovedDeliveryRider,
      is_delivery_rider: isApprovedDeliveryRider,
      is_region_manager: isRegionManager,
      isRegionManager,
      manager_region_id: managerRegionId,
      managerRegionId: managerRegionId,
      manager_region_name: managerRegionName,
      managerRegionName: managerRegionName,
      is_dorm_shop_owner: isDormShopOwner,
      is_circle_owner: isCircleOwner,
      isCircleOwner,
      managed_circle_count: circleManageList.length,
      managedCircleCount: circleManageList.length,
      managed_circles: circleManageList,
      managedCircles: circleManageList,
      primary_managed_circle_id: primaryManagedCircleId,
      primaryManagedCircleId,
      dorm_shop_merchant_id: dormShop?.id || null,
      dorm_shop_region_id: dormShop?.regionId || null,
      dorm_shop_status: dormShop?.status || null,
      rider_region_id: rider?.regionId || null,
      rider_verify_status: rider?.verifyStatus || null,
      rider_status: rider?.status || null,
      rider: rider
        ? {
            id: rider.id,
            user_id: rider.userId,
            region_id: rider.regionId,
            verify_status: rider.verifyStatus,
            status: rider.status,
          }
        : null,
      profile_permissions: {
        is_rider: isApprovedDeliveryRider,
        is_delivery_rider: isApprovedDeliveryRider,
        is_region_manager: isRegionManager,
        is_circle_owner: isCircleOwner,
        circle_owner: isCircleOwner,
        managed_circle_count: circleManageList.length,
        managed_circles: circleManageList,
        primary_managed_circle_id: primaryManagedCircleId,
        manager_region_id: managerRegionId,
        manager_region_name: managerRegionName,
        is_dorm_shop_owner: isDormShopOwner,
        dorm_shop_merchant_id: dormShop?.id || null,
        dorm_shop_region_id: dormShop?.regionId || null,
        dorm_shop_status: dormShop?.status || null,
        rider_region_id: rider?.regionId || null,
        rider_verify_status: rider?.verifyStatus || null,
        rider_status: rider?.status || null,
      },
    };

    // AUD-P1-015: 非本人查看时去除联系方式字段，防止手机/微信/QQ/邮箱泄露
    const isSelf = !viewerId || viewerId === userId;
    if (!isSelf && userWithPermissions) {
      (userWithPermissions as any).mobile = '';
      (userWithPermissions as any).phone = '';
      (userWithPermissions as any).wechat = '';
      (userWithPermissions as any).qq = '';
      (userWithPermissions as any).email = '';
      (userWithPermissions as any).wechat_permission = 3; // 禁止
      (userWithPermissions as any).phone_permission = 3;
      (userWithPermissions as any).latest_location = null;
    }

    if (!regionId) {
      await this.redis.setJson(cacheKey, userWithPermissions, this.profileCacheTtl).catch(() => undefined);
      return userWithPermissions;
    }

    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: {
        profilePageLayout: true,
        profileLayoutItems: true,
      },
    });

    const result = {
      ...userWithPermissions,
      profile_page_layout: region?.profilePageLayout || 'default',
      profile_layout_items: this.normalizeProfileLayoutItems(region?.profileLayoutItems),
    };
    await this.redis.setJson(cacheKey, result, this.profileCacheTtl).catch(() => undefined);
    return result;
  }

  private serializeCityAgentApplication(application: any) {
    if (!application) return null;
    return {
      id: application.id,
      user_id: application.userId,
      userId: application.userId,
      region_id: application.regionId,
      regionId: application.regionId,
      region_name: application.region?.name || '',
      regionName: application.region?.name || '',
      real_name: application.realName,
      realName: application.realName,
      phone: application.phone,
      company_name: application.companyName || '',
      companyName: application.companyName || '',
      reason: application.reason || '',
      status: application.status,
      reject_reason: application.rejectReason || '',
      rejectReason: application.rejectReason || '',
      approved_at: application.approvedAt,
      approvedAt: application.approvedAt,
      created_at: application.createdAt,
      createdAt: application.createdAt,
      updated_at: application.updatedAt,
      updatedAt: application.updatedAt,
      region: application.region
        ? {
            id: application.region.id,
            name: application.region.name,
            address: application.region.address || '',
            logo: application.region.logo || '',
            is_open: application.region.isOpen,
            isOpen: application.region.isOpen,
          }
        : null,
    };
  }

  private serializeCityAgent(agent: any) {
    if (!agent) return null;
    return {
      id: agent.id,
      user_id: agent.userId,
      userId: agent.userId,
      region_id: agent.regionId,
      regionId: agent.regionId,
      region_name: agent.region?.name || '',
      regionName: agent.region?.name || '',
      real_name: agent.realName,
      realName: agent.realName,
      phone: agent.phone,
      commission_rate: Number(agent.commissionRate || 0),
      commissionRate: Number(agent.commissionRate || 0),
      total_commission: Number(agent.totalCommission || 0),
      totalCommission: Number(agent.totalCommission || 0),
      settled_amount: Number(agent.settledAmount || 0),
      settledAmount: Number(agent.settledAmount || 0),
      pending_amount: Number(agent.pendingAmount || 0),
      pendingAmount: Number(agent.pendingAmount || 0),
      status: agent.status,
      created_at: agent.createdAt,
      createdAt: agent.createdAt,
      updated_at: agent.updatedAt,
      updatedAt: agent.updatedAt,
    };
  }

  async getCityAgentApplication(userId: string, regionId?: string) {
    const normalizedRegionId = String(regionId || '').trim();
    const where: any = { userId };
    if (normalizedRegionId) where.regionId = normalizedRegionId;

    const [application, agent] = await Promise.all([
      this.prisma.cityAgentApplication.findFirst({
        where,
        include: {
          region: { select: { id: true, name: true, address: true, logo: true, isOpen: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cityAgent.findUnique({
        where: { userId },
        include: {
          region: { select: { id: true, name: true, address: true, logo: true, isOpen: true } },
        },
      }),
    ]);

    return {
      application: this.serializeCityAgentApplication(application),
      agent: this.serializeCityAgent(agent),
      is_city_agent: agent?.status === 'active',
      isCityAgent: agent?.status === 'active',
    };
  }

  async submitCityAgentApplication(userId: string, dto: any) {
    const regionId = String(dto?.regionId ?? dto?.region_id ?? '').trim();
    const realName = String(dto?.realName ?? dto?.real_name ?? dto?.name ?? '').trim();
    const phone = String(dto?.phone ?? dto?.mobile ?? '').trim();
    const companyName = String(dto?.companyName ?? dto?.company_name ?? '').trim();
    const rawReason = String(dto?.reason ?? dto?.intro ?? dto?.description ?? '').trim();
    const wechat = String(dto?.wechat ?? dto?.wechat_account ?? '').trim();
    const reason = [rawReason, wechat ? `微信：${wechat}` : ''].filter(Boolean).join('\n');

    if (!regionId) throw new BadRequestException('请选择申请区域');
    if (!realName) throw new BadRequestException('请填写真实姓名');
    if (!phone) throw new BadRequestException('请填写联系电话');
    if (!/^1[3-9]\d{9}$|^[0-9+\-\s]{6,20}$/.test(phone)) {
      throw new BadRequestException('联系电话格式不正确');
    }
    if (!reason || reason.length < 8) {
      throw new BadRequestException('请填写不少于8个字的合作说明');
    }

    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, name: true, address: true, logo: true, isOpen: true },
    });
    if (!region) throw new BadRequestException('申请区域不存在');

    const existingAgent = await this.prisma.cityAgent.findUnique({ where: { userId } });
    if (existingAgent && existingAgent.status !== 'closed') {
      throw new BadRequestException('您已经是区域合作负责人，无需重复申请');
    }

    const latest = await this.prisma.cityAgentApplication.findFirst({
      where: { userId, regionId },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.status === 'approved') {
      throw new BadRequestException('该区域合作申请已通过，无需重复提交');
    }

    const payload = {
      realName,
      phone,
      companyName: companyName || null,
      reason,
      status: 'pending',
      rejectReason: null,
      approvedAt: null,
    };
    const application = latest
      ? await this.prisma.cityAgentApplication.update({
          where: { id: latest.id },
          data: payload,
          include: { region: { select: { id: true, name: true, address: true, logo: true, isOpen: true } } },
        })
      : await this.prisma.cityAgentApplication.create({
          data: { ...payload, userId, regionId },
          include: { region: { select: { id: true, name: true, address: true, logo: true, isOpen: true } } },
        });

    return {
      application: this.serializeCityAgentApplication(application),
      message: latest ? '申请已更新，等待平台审核' : '申请已提交，等待平台审核',
    };
  }

  async getNicknameAvatar(userId: string) {
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: {
        id: true,
        uid: true,
        publicUid: true,
        nickname: true,
        avatar: true,
        phone: true,
        profile: { select: { gender: true } },
        studentVerify: { select: { status: true } },
      },
    });
    if (!user) return null;
    const publicUser = this.formatPublicUser(await this.ensurePublicUid(user));
    return {
      id: user.id,
      uid: publicUser.uid,
      public_uid: publicUser.public_uid,
      publicUid: publicUser.publicUid,
      legacy_uid: publicUser.legacy_uid,
      name: user.nickname || '',
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      phone: user.phone || '',
      mobile: user.phone || '',
      gender: this.toMiniGender(user.profile?.gender),
      gender_text: user.profile?.gender || Gender.UNKNOWN,
      student_verified: user.studentVerify?.status === 'APPROVED',
      student_verification_status: user.studentVerify?.status?.toLowerCase() || 'none',
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.userAccess.assertCanInteract(userId, 'profile', '修改资料');
    const normalizedGender = this.normalizeGender(dto.gender ?? dto.riderGender);
    const phone = dto.mobile ?? dto.phone;
    const wechat = dto.wechat_account ?? dto.wechatAccount;
    const birthday = this.normalizeBirthday(dto.birthday);

    const userData: Record<string, any> = {};
    if (dto.nickname !== undefined) userData.nickname = dto.nickname;
    if (dto.avatar !== undefined) userData.avatar = dto.avatar;
    if (phone !== undefined) userData.phone = phone;

    const profileData: Record<string, any> = {};
    if (normalizedGender !== undefined) profileData.gender = normalizedGender;
    if (dto.bio !== undefined) profileData.bio = dto.bio;
    if (dto.school !== undefined) profileData.school = dto.school;
    if (dto.major !== undefined) profileData.major = dto.major;
    if (dto.grade !== undefined) profileData.grade = dto.grade;
    if (dto.dormitory !== undefined) profileData.dormitory = dto.dormitory;
    if (dto.email !== undefined) profileData.email = dto.email;
    if (wechat !== undefined) profileData.wechat = wechat;
    if (birthday !== undefined) profileData.birthday = birthday;

    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userData,
      });
    }
    if (Object.keys(profileData).length > 0) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        update: profileData,
        create: { userId, ...profileData },
      });
    }
    await this.clearProfileCache(userId);
    return this.getProfile(userId);
  }

  private normalizeGender(value: unknown): Gender | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === Gender.MALE || value === 'MALE' || value === 1 || value === '1' || value === 'male') {
      return Gender.MALE;
    }
    if (value === Gender.FEMALE || value === 'FEMALE' || value === 2 || value === '2' || value === 'female') {
      return Gender.FEMALE;
    }
    if (value === Gender.UNKNOWN || value === 'UNKNOWN' || value === 0 || value === '0' || value === 'unknown') {
      return Gender.UNKNOWN;
    }
    throw new BadRequestException('性别参数不合法');
  }

  private normalizeBirthday(value?: string): Date | undefined {
    if (value === undefined || value === '') return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('生日格式不合法');
    return date;
  }

  private normalizeMessagePermission(value: any, allowMessage?: boolean) {
    if (allowMessage === false && (value === undefined || value === null || value === '')) return 4;
    const labels: Record<string, number> = {
      all: 0,
      everyone: 0,
      '所有人': 0,
      followers: 1,
      fans: 1,
      '关注我的': 1,
      following: 2,
      '我关注的': 2,
      mutual: 3,
      '互相关注': 3,
      none: 4,
      disabled: 4,
      '禁止': 4,
    };
    if (typeof value === 'string' && labels[value.trim()] !== undefined) return labels[value.trim()];
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(Math.floor(parsed), 0), 4);
  }

  private messagePermissionText(value: any) {
    return ['所有人', '关注我的', '我关注的', '互相关注', '禁止'][this.normalizeMessagePermission(value)] || '关注我的';
  }

  private normalizeInteractionPermission(value: any, fallback = 0) {
    return this.interactionPermission.normalizePermission(value, fallback);
  }

  private interactionPermissionText(value: any) {
    return this.interactionPermission.permissionText(value);
  }

  private visibilityValue(value: any, fallback: boolean) {
    return value === undefined || value === null ? fallback : value !== false;
  }

  private visibilityFlag(value: any, fallback: boolean) {
    return this.visibilityValue(value, fallback) ? 1 : 0;
  }

  private formatPrivacySettings(settings: any) {
    const privacyLevel = Number(settings?.privacyLevel ?? 0);
    const messagePermission = this.normalizeMessagePermission(settings?.messagePermission, settings?.allowMessage);
    const commentPermission = settings?.allowComment === false ? 4 : this.normalizeInteractionPermission(settings?.commentPermission, 0);
    const replyPermission = this.normalizeInteractionPermission(settings?.replyPermission, 0);
    const mentionPermission = this.normalizeInteractionPermission(settings?.mentionPermission, 0);
    const coCreatePermission = this.normalizeInteractionPermission(settings?.coCreatePermission, 0);
    const legacyPublicVisible = privacyLevel <= 1;
    const legacySearchVisible = privacyLevel < 3;
    return {
      id: settings?.id || '',
      user_id: settings?.userId || '',
      privacy_level: privacyLevel,
      privacyLevel,
      allow_follow: settings?.allowFollow !== false,
      allowFollow: settings?.allowFollow !== false,
      allow_comment: settings?.allowComment !== false,
      allowComment: settings?.allowComment !== false,
      allow_message: messagePermission !== 4,
      allowMessage: messagePermission !== 4,
      message_permission: messagePermission,
      messagePermission,
      message_permission_text: this.messagePermissionText(messagePermission),
      comment_permission: commentPermission,
      commentPermission,
      comment_permission_text: this.interactionPermissionText(commentPermission),
      reply_permission: replyPermission,
      replyPermission,
      reply_permission_text: this.interactionPermissionText(replyPermission),
      mention_permission: mentionPermission,
      mentionPermission,
      mention_permission_text: this.interactionPermissionText(mentionPermission),
      co_create_permission: coCreatePermission,
      coCreatePermission,
      co_create_permission_text: this.interactionPermissionText(coCreatePermission),
      show_online_status: settings?.showOnlineStatus !== false,
      showOnlineStatus: settings?.showOnlineStatus !== false,
      interaction_settings: {
        like_list_visible: this.visibilityFlag(settings?.likeListVisible, legacyPublicVisible),
        allow_comment: settings?.allowComment !== false,
        comment_permission: commentPermission,
        comment_permission_text: this.interactionPermissionText(commentPermission),
        reply_permission: replyPermission,
        reply_permission_text: this.interactionPermissionText(replyPermission),
        mention_permission: mentionPermission,
        mention_permission_text: this.interactionPermissionText(mentionPermission),
        co_create_permission: coCreatePermission,
        co_create_permission_text: this.interactionPermissionText(coCreatePermission),
        allow_message: messagePermission !== 4,
        message_permission: messagePermission,
        message_permission_text: this.messagePermissionText(messagePermission),
        allow_search: this.visibilityFlag(settings?.allowSearch, legacySearchVisible),
        show_joined_circles: this.visibilityValue(settings?.showJoinedCircles, legacySearchVisible),
      },
      follow_settings: {
        allow_follow: settings?.allowFollow !== false,
        following_list_visible: this.visibilityFlag(settings?.followingListVisible, legacyPublicVisible),
        followers_list_visible: this.visibilityFlag(settings?.followersListVisible, legacyPublicVisible),
      },
      contact_settings: {
        wechat: { permission: privacyLevel >= 2 ? 3 : 0, price: 0 },
        phone: { permission: privacyLevel >= 3 ? 3 : 0, price: 0 },
      },
      notification_settings: {
        like: settings?.notifyLike !== false,
        comment: settings?.notifyComment !== false,
        follow: settings?.notifyFollow !== false,
        squat: settings?.notifySquat !== false,
        system: settings?.notifySystem !== false,
        order: settings?.notifyOrder !== false,
      },
      language: settings?.language || 'zh-CN',
      updated_at: settings?.updatedAt,
      raw: settings || null,
    };
  }

  private normalizePrivacySettingsDto(dto: any) {
    const data: Record<string, any> = {};
    const pickBool = (...values: any[]) => {
      for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
        if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
      }
      return undefined;
    };
    const privacyLevel = dto.privacyLevel ?? dto.privacy_level;
    if (privacyLevel !== undefined) {
      const parsed = Number(privacyLevel);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3) throw new BadRequestException('隐私等级参数不合法');
      data.privacyLevel = Math.floor(parsed);
    }
    const allowFollow = pickBool(dto.allowFollow, dto.allow_follow, dto.follow_settings?.allow_follow);
    const allowComment = pickBool(dto.allowComment, dto.allow_comment, dto.interaction_settings?.allow_comment);
    const likeListVisible = pickBool(dto.likeListVisible, dto.like_list_visible, dto.interaction_settings?.like_list_visible);
    const allowSearch = pickBool(dto.allowSearch, dto.allow_search, dto.interaction_settings?.allow_search);
    const showJoinedCircles = pickBool(dto.showJoinedCircles, dto.show_joined_circles, dto.interaction_settings?.show_joined_circles);
    const followingListVisible = pickBool(
      dto.followingListVisible,
      dto.following_list_visible,
      dto.follow_settings?.following_list_visible,
    );
    const followersListVisible = pickBool(
      dto.followersListVisible,
      dto.followers_list_visible,
      dto.follow_settings?.followers_list_visible,
    );
    const messagePermissionInput =
      dto.messagePermission ??
      dto.message_permission ??
      dto.interaction_settings?.message_permission;
    const commentPermissionInput =
      dto.commentPermission ??
      dto.comment_permission ??
      dto.interaction_settings?.comment_permission;
    const replyPermissionInput =
      dto.replyPermission ??
      dto.reply_permission ??
      dto.interaction_settings?.reply_permission;
    const mentionPermissionInput =
      dto.mentionPermission ??
      dto.mention_permission ??
      dto.interaction_settings?.mention_permission;
    const coCreatePermissionInput =
      dto.coCreatePermission ??
      dto.co_create_permission ??
      dto.coCreate_permission ??
      dto.interaction_settings?.co_create_permission ??
      dto.interaction_settings?.coCreatePermission;
    const allowMessage = pickBool(
      dto.allowMessage,
      dto.allow_message,
      dto.interaction_settings?.allow_message,
      dto.interaction_settings?.message_permission === 4 || dto.interaction_settings?.message_permission === '4' ? false : undefined,
      dto.interaction_settings?.message_permission === 'none' ? false : undefined,
    );
    const showOnlineStatus = pickBool(dto.showOnlineStatus, dto.show_online_status);
    if (allowFollow !== undefined) data.allowFollow = allowFollow;
    if (allowComment !== undefined) data.allowComment = allowComment;
    if (commentPermissionInput !== undefined && commentPermissionInput !== null && commentPermissionInput !== '') {
      const commentPermission = this.normalizeInteractionPermission(commentPermissionInput, 0);
      data.commentPermission = commentPermission;
      data.allowComment = commentPermission !== 4;
    }
    if (replyPermissionInput !== undefined && replyPermissionInput !== null && replyPermissionInput !== '') {
      data.replyPermission = this.normalizeInteractionPermission(replyPermissionInput, 0);
    }
    if (mentionPermissionInput !== undefined && mentionPermissionInput !== null && mentionPermissionInput !== '') {
      data.mentionPermission = this.normalizeInteractionPermission(mentionPermissionInput, 0);
    }
    if (coCreatePermissionInput !== undefined && coCreatePermissionInput !== null && coCreatePermissionInput !== '') {
      data.coCreatePermission = this.normalizeInteractionPermission(coCreatePermissionInput, 0);
    }
    if (likeListVisible !== undefined) data.likeListVisible = likeListVisible;
    if (allowSearch !== undefined) data.allowSearch = allowSearch;
    if (showJoinedCircles !== undefined) data.showJoinedCircles = showJoinedCircles;
    if (followingListVisible !== undefined) data.followingListVisible = followingListVisible;
    if (followersListVisible !== undefined) data.followersListVisible = followersListVisible;
    if (messagePermissionInput !== undefined && messagePermissionInput !== null && messagePermissionInput !== '') {
      const messagePermission = this.normalizeMessagePermission(messagePermissionInput);
      data.messagePermission = messagePermission;
      data.allowMessage = messagePermission !== 4;
    } else if (allowMessage !== undefined) {
      data.allowMessage = allowMessage;
      if (allowMessage === false) data.messagePermission = 4;
    }
    if (showOnlineStatus !== undefined) data.showOnlineStatus = showOnlineStatus;
    const notifications = dto.notification_settings || dto.notifications || {};
    const notifyLike = pickBool(dto.notifyLike, dto.notify_like, notifications.like);
    const notifyComment = pickBool(dto.notifyComment, dto.notify_comment, notifications.comment);
    const notifyFollow = pickBool(dto.notifyFollow, dto.notify_follow, notifications.follow);
    const notifySquat = pickBool(dto.notifySquat, dto.notify_squat, notifications.squat);
    const notifySystem = pickBool(dto.notifySystem, dto.notify_system, notifications.system);
    const notifyOrder = pickBool(dto.notifyOrder, dto.notify_order, notifications.order);
    if (notifyLike !== undefined) data.notifyLike = notifyLike;
    if (notifyComment !== undefined) data.notifyComment = notifyComment;
    if (notifyFollow !== undefined) data.notifyFollow = notifyFollow;
    if (notifySquat !== undefined) data.notifySquat = notifySquat;
    if (notifySystem !== undefined) data.notifySystem = notifySystem;
    if (notifyOrder !== undefined) data.notifyOrder = notifyOrder;
    if (dto.language !== undefined) data.language = String(dto.language || 'zh-CN').trim() || 'zh-CN';
    return data;
  }

  private hiddenFollowListResult(type: 'following' | 'followers', page: number, limit: number) {
    const message = type === 'following' ? '该用户已隐藏关注列表' : '该用户已隐藏粉丝列表';
    return {
      success: true,
      hidden: true,
      privacy_hidden: true,
      type,
      message,
      list: [],
      data: [],
      total: 0,
      page,
      limit,
      pageSize: limit,
    };
  }

  private async canViewFollowList(targetId: string, viewerId: string | undefined, type: 'following' | 'followers') {
    if (!viewerId || String(viewerId) !== String(targetId)) {
      const target = await this.prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          settings: {
            select: {
              privacyLevel: true,
              followingListVisible: true,
              followersListVisible: true,
            },
          },
        },
      });
      if (!target) throw new NotFoundException('用户不存在');
      if (viewerId) await this.userAccess.assertNoBlockBetween(viewerId, targetId, '查看关注粉丝列表');
      const privacyLevel = Number(target.settings?.privacyLevel ?? 0);
      const legacyVisible = privacyLevel <= 1;
      const visible =
        type === 'following'
          ? this.visibilityValue(target.settings?.followingListVisible, legacyVisible)
          : this.visibilityValue(target.settings?.followersListVisible, legacyVisible);
      return visible;
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('用户不存在');
    return true;
  }

  async getPrivacySettings(userId: string) {
    await this.userAccess.assertActiveUser(userId, '查看隐私设置');
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return this.formatPrivacySettings(settings);
  }

  async updatePrivacySettings(userId: string, dto: any) {
    await this.userAccess.assertCanInteract(userId, 'profile', '修改隐私设置');
    const data = this.normalizePrivacySettingsDto(dto || {});
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    await this.clearProfileCache(userId);
    if (Object.prototype.hasOwnProperty.call(data, 'showOnlineStatus')) {
      this.wsNative.publishUserPresence(userId).catch(() => undefined);
    }
    return this.formatPrivacySettings(settings);
  }

  async getBalanceDetails(userId: string, query: ListQueryDto) {
    const page = this.toPositiveInt((query as any).page, 1);
    const pageSize = this.toPositiveInt((query as any).pageSize || (query as any).limit, 20);
    const where = { userId };

    const [wallet, balanceLogs, balanceLogTotal, withdrawals, withdrawalTotal] = await Promise.all([
      this.prisma.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      this.prisma.walletTransaction.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
      this.prisma.withdraw.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.withdraw.count({ where }),
    ]);

    return {
      current_balance: Number(wallet.balance || 0),
      freeze_balance: Number(wallet.freeze || 0),
      withdraw_config: {
        min_withdraw: 0.3,
        max_withdraw: 2000,
        withdraw_fee: 0,
      },
      balance_logs: {
        records: balanceLogs.map((item) => ({
          id: item.id,
          type: item.type,
          amount: Number(item.amount || 0),
          balance: Number(item.balance || 0),
          channel: item.channel,
          remark: item.description || '',
          status: item.status,
          created_at: item.createdAt,
        })),
        pagination: {
          total: balanceLogTotal,
          page,
          pageSize,
        },
      },
      withdrawals: {
        records: withdrawals.map((item) => ({
          id: item.id,
          type: 'WITHDRAW',
          amount: Number(item.amount || 0),
          channel: item.channel,
          account: item.account,
          real_name: item.realName,
          remark: item.status === 'PENDING' ? '提现申请审核中' : '提现记录',
          status: item.status,
          fail_reason: item.failReason,
          transfer_no: item.transferNo,
          processed_at: item.processedAt,
          created_at: item.createdAt,
        })),
        pagination: {
          total: withdrawalTotal,
          page,
          pageSize,
        },
      },
    };
  }

  async applyWithdraw(userId: string, dto: any) {
    return this.prisma.withdraw.create({ data: { userId, ...dto } });
  }

  async getPendingWithdrawTotal(userId: string) {
    const result = await this.prisma.withdraw.aggregate({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amount: true },
    });
    return { pendingTotal: result._sum.amount || 0 };
  }

  async getBanStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, muteEndAt: true, muteReason: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const now = new Date();
    const isBanned = user.status === UserStatus.BANNED;
    const isMuted = !!user.muteEndAt && user.muteEndAt > now;
    const latestBan = isBanned
      ? await this.prisma.auditLog.findFirst({
          where: { userId, module: 'user', action: 'BAN' },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const detail = latestBan?.detail && typeof latestBan.detail === 'object'
      ? latestBan.detail as Record<string, any>
      : {};
    const banReason = String(detail.reason || '违反社区规范').trim();
    const muteEndAt = user.muteEndAt?.toISOString() || null;

    return {
      user_id: userId,
      userId,
      status: user.status,
      is_banned: isBanned,
      isBanned,
      is_muted: isMuted,
      isMuted,
      ban_info: isBanned
        ? {
            reason: banReason,
            is_permanent: true,
            start_time: latestBan?.createdAt || null,
            end_time: null,
            end_time_text: '',
          }
        : null,
      mute_info: isMuted
        ? {
            reason: user.muteReason || '违反社区规范',
            is_permanent: false,
            end_time: muteEndAt,
            end_time_text: user.muteEndAt?.toLocaleString('zh-CN', { hour12: false }) || '',
          }
        : null,
      can_post: !isBanned && !isMuted && user.status === UserStatus.ACTIVE,
      can_comment: !isBanned && !isMuted && user.status === UserStatus.ACTIVE,
      check_time: now.toISOString(),
    };
  }

  async payUnban(userId: string) {
    return this.withSelfUnbanUserLock(userId, () => this.payUnbanLocked(userId));
  }

  private async payUnbanLocked(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, banVersion: true, openid: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status !== UserStatus.BANNED) {
      throw new BadRequestException('当前账号未被封禁，无需申请解封');
    }
    if (!user.openid) throw new BadRequestException('当前账号未绑定微信，无法发起支付');

    const config = await this.getSelfUnbanConfig(userId);
    if (!config.enabled && config.request_status !== 'pending_review') {
      throw new BadRequestException(config.reason || '当前区域暂未开放自助解封');
    }
    if (config.request_status === 'pending_review') {
      return {
        request_id: config.request_id,
        status: 'pending_review',
        message: '解封申请已付款，等待后台审核',
      };
    }
    const regionId = String(config.region_id || '').trim();
    if (!regionId) throw new BadRequestException('未设置所属区域，无法申请解封');

    let request = await this.prisma.selfUnbanRequest.findFirst({
      where: { userId, status: 'pending_payment', banVersion: user.banVersion },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) {
      const requestNo = `UNBAN${Date.now()}${crypto.randomInt(1000, 10000)}`;
      try {
        request = await this.prisma.selfUnbanRequest.create({
          data: {
            requestNo,
            activeKey: userId,
            userId,
            banVersion: user.banVersion,
            regionId,
            amount: config.fee,
            status: 'pending_payment',
            banReason: config.ban_reason || undefined,
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        request = await this.prisma.selfUnbanRequest.findFirst({
          where: { activeKey: userId, banVersion: user.banVersion },
          orderBy: { createdAt: 'desc' },
        });
        if (!request || request.status !== 'pending_payment') {
          throw new BadRequestException('已有解封申请正在处理，请刷新状态');
        }
      }
    }

    if (Number(request.banVersion) !== Number(user.banVersion)) {
      throw new BadRequestException('封禁状态已变化，请刷新后重试');
    }

    const payment = await this.paymentService.wxUnifiedOrder({
      bizType: 'self_unban',
      bizId: request.id,
      orderNo: request.requestNo,
      amount: Number(request.amount),
      description: `账号解封申请-${config.region_name || '校小伴'}`,
      openid: user.openid,
      userId,
    });

    // 微信预支付单生成期间可能发生再次封禁或人工解封。
    // 在将支付参数交给小程序前再校验一次，避免用户支付已失效申请。
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, banVersion: true },
    });
    if (
      currentUser?.status !== UserStatus.BANNED
      || Number(currentUser.banVersion) !== Number(request.banVersion)
    ) {
      await this.prisma.selfUnbanRequest.updateMany({
        where: { id: request.id, status: 'pending_payment', banVersion: request.banVersion },
        data: {
          status: 'cancelled',
          activeKey: null,
          adminNote: '封禁状态已变化，未下发支付参数',
        },
      });
      throw new BadRequestException('封禁状态已变化，请刷新后重试');
    }
    await this.prisma.selfUnbanRequest.update({
      where: { id: request.id },
      data: { paymentNo: payment.paymentNo },
    });

    return {
      ...payment,
      request_id: request.id,
      request_no: request.requestNo,
      status: 'pending_payment',
    };
  }

  async getSelfUnbanConfig(userId?: string) {
    // AUD-P1-180: 从用户所在区域读取真实 selfUnbanFee，不再固定返回 0。
    if (!userId) {
      return { enabled: false, fee: 0, reason: '请先登录' };
    }

    try {
      const [user, profile, foundRequest] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { status: true, banVersion: true },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: { regionId: true },
        }),
        this.prisma.selfUnbanRequest.findFirst({
          where: {
            userId,
            status: { in: ['pending_payment', 'pending_review', 'rejecting', 'refunding', 'refund_failed'] },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      let activeRequest = foundRequest;
      if (
        activeRequest?.status === 'pending_payment'
        && Number(activeRequest.banVersion) !== Number(user?.banVersion)
      ) {
        await this.prisma.selfUnbanRequest.updateMany({
          where: {
            id: activeRequest.id,
            status: 'pending_payment',
            banVersion: activeRequest.banVersion,
          },
          data: {
            status: 'cancelled',
            activeKey: null,
            adminNote: '已取消上一次封禁周期的未付款申请',
          },
        });
        activeRequest = null;
      }
      if (!profile?.regionId) {
        return { enabled: false, fee: 0, reason: '未设置所属区域' };
      }

      // 读区域自助解封费用
      const region = await this.prisma.region.findUnique({
        where: { id: profile.regionId },
        select: { id: true, name: true, selfUnbanFee: true },
      });

      const configuredFee = region?.selfUnbanFee ? Number(region.selfUnbanFee) : 0;
      // 未支付申请采用创建时的价格快照，确保页面展示金额与微信下单金额一致。
      const pendingRequestFee = activeRequest?.status === 'pending_payment'
        ? Number(activeRequest.amount || 0)
        : 0;
      const fee = pendingRequestFee > 0 ? pendingRequestFee : configuredFee;
      const isBanned = user?.status === UserStatus.BANNED;
      const waitingReview = activeRequest?.status === 'pending_review';
      const canResumePayment = !activeRequest || activeRequest.status === 'pending_payment';
      const enabled = isBanned && fee > 0 && canResumePayment;
      const banStatus = isBanned ? await this.getBanStatus(userId) : null;

      return {
        enabled,
        fee,
        user_id: userId,
        region_id: profile.regionId,
        region_name: region?.name || '',
        request_id: activeRequest?.id || null,
        request_status: activeRequest?.status || null,
        ban_reason: banStatus?.ban_info?.reason || '',
        reason: enabled
          ? undefined
          : waitingReview
            ? '已付款，等待后台审核'
            : activeRequest?.status === 'refund_failed'
              ? '退款失败，请联系客服处理'
              : ['rejecting', 'refunding'].includes(String(activeRequest?.status || ''))
                ? '退款处理中，请稍后再试'
            : !isBanned
              ? '当前账号未被封禁'
              : '当前区域暂未开放自助解封',
      };
    } catch {
      return { enabled: false, fee: 0, reason: '配置读取失败' };
    }
  }

  /**
   * AUD-P1-181: 用户自助注销账号。
   * 校验无未完订单/提现/余额后，置 DELETED + deletedAt + 清除 refresh token。
   */
  async cancelAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 'DELETED') throw new BadRequestException('账号已注销');

    // 检查未完订单（普通订单/商城/跑腿/二手）
    const [pendingShopOrder, pendingMallOrder, pendingErrandOrder, pendingSecondHandOrder] =
      await Promise.all([
        this.prisma.order.findFirst({
          where: { userId, status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } },
          select: { id: true },
        }),
        this.prisma.mallOrder.findFirst({
          where: { userId, status: { notIn: ['completed', 'cancelled', 'refunded'] } },
          select: { id: true },
        }),
        this.prisma.errandOrder.findFirst({
          where: { userId, status: { notIn: ['completed', 'cancelled'] } },
          select: { id: true },
        }),
        this.prisma.secondHandOrder.findFirst({
          where: { buyerId: userId, status: { notIn: ['completed', 'cancelled', 'refunded'] } },
          select: { id: true },
        }).catch(() => null),
      ]);

    const blockers: string[] = [];
    if (pendingShopOrder) blockers.push('有未完成的宿舍小店订单');
    if (pendingMallOrder) blockers.push('有未完成的商城订单');
    if (pendingErrandOrder) blockers.push('有未完成的跑腿订单');
    if (pendingSecondHandOrder) blockers.push('有未完成的二手交易订单');

    // 检查提现
    const pendingWithdraw = await this.prisma.withdraw.findFirst({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    if (pendingWithdraw) blockers.push('有处理中的提现申请');

    // 检查钱包余额
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    if (wallet && Number(wallet.balance) > 0) {
      blockers.push(`钱包余额 ${Number(wallet.balance).toFixed(2)} 元未提现`);
    }

    if (blockers.length > 0) {
      throw new BadRequestException({
        message: '存在未完成的业务，无法注销账号',
        blockers,
      });
    }

    // 执行注销：置 DELETED + deletedAt + 清除 refresh token
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED' as any,
          deletedAt: now,
          // AUD-P1-181: 注销时脱敏可公开资料
          nickname: '已注销用户',
          avatar: null,
          phone: null,
        },
      });
      // AUD-P1-181: 脱敏用户档案资料
      await tx.userProfile.updateMany({
        where: { userId },
        data: {
          bio: null,
          wechat: null,
          qq: null,
          email: null,
          realName: null,
          idCard: null,
          school: null,
          major: null,
          grade: null,
          dormitory: null,
          birthday: null,
        },
      });
    });

    // 注销后撤销 refresh 和两类实时连接。
    await this.userSessionRevocation.revoke(userId);

    return { success: true, message: '账号已注销', deletedAt: now.toISOString() };
  }

  async studentVerify(userId: string, dto: StudentVerifyDto) {
    const data = this.normalizeStudentVerifyDto(dto);
    const exists = await this.prisma.studentVerify.findUnique({ where: { userId } });
    if (exists && exists.status === 'APPROVED') throw new BadRequestException('已认证');

    // 验证学校ID（如果传了的话）
    let schoolRecord: any = null;
    if (data.schoolId) {
      schoolRecord = await this.prisma.school.findUnique({ where: { id: data.schoolId } });
      if (!schoolRecord) throw new BadRequestException('学校不存在');
      if (!schoolRecord.isEnabled) throw new BadRequestException('学校已停用');
      // 用学校库的名称覆盖，保持一致性
      data.schoolName = schoolRecord.name;
    }

    const record = exists
      ? await this.prisma.studentVerify.update({ where: { userId }, data: { ...data, status: 'PENDING' } })
      : await this.prisma.studentVerify.create({ data: { userId, ...data } });

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        school: data.schoolName,
        ...(data.major && { major: data.major }),
        ...(data.grade && { grade: data.grade }),
      },
      create: {
        userId,
        school: data.schoolName,
        major: data.major,
        grade: data.grade,
      },
    });

    await this.clearProfileCache(userId);
    return { success: true, data: this.toMiniStudentVerify(record) };
  }

  async getStudentVerifyInfo(userId: string) {
    const record = await this.prisma.studentVerify.findUnique({
      where: { userId },
      include: { school: { select: { id: true, name: true, shortName: true } } },
    });
    if (!record) return { data: null };
    const result: any = this.toMiniStudentVerify(record);
    // 如果有学校记录，补充学校信息
    if ((record as any).school) {
      result.school_name = (record as any).school.name;
      result.school_short_name = (record as any).school.shortName || '';
    }
    return { data: result };
  }

  async getUniversities(name: string, page: number, size: number) {
    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(size) || 20, 1), 100);
    const keyword = String(name || '').trim().toLowerCase();
    const schoolWhere: any = { isEnabled: true };
    if (keyword) {
      schoolWhere.OR = [
        { name: { contains: keyword } },
        { shortName: { contains: keyword } },
        { province: { contains: keyword } },
        { city: { contains: keyword } },
        { campusName: { contains: keyword } },
      ];
    }
    const [schools, dbTotal, enabledTotal] = await Promise.all([
      this.prisma.school.findMany({
        where: schoolWhere,
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }).catch(() => []),
      this.prisma.school.count({ where: schoolWhere }).catch(() => 0),
      this.prisma.school.count({ where: { isEnabled: true } }).catch(() => 0),
    ]);
    if (enabledTotal > 0) {
      return {
        data: schools.map((school: any, index) => ({
          id: school.id,
          school_id: school.id,
          name: school.name,
          short_name: school.shortName || '',
          type: school.type,
          province: school.province || '',
          city: school.city || '',
          district: school.district || '',
          campus_name: school.campusName || '',
          学校名称: school.name,
          学校标识码: school.id,
          所在地: [school.province, school.city].filter(Boolean).join('') || school.address || '',
          办学层次: school.type,
          序号: (currentPage - 1) * pageSize + index + 1,
        })),
        total: dbTotal,
        page: currentPage,
        size: pageSize,
      };
    }
    const filtered = this.universities.filter((school) => {
      if (!keyword) return true;
      return [
        school.学校名称,
        school.所在地,
        school.主管部门,
        school.办学层次,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
    });
    const start = (currentPage - 1) * pageSize;
    return {
      data: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page: currentPage,
      size: pageSize,
    };
  }

  private normalizeStudentVerifyDto(dto: StudentVerifyDto) {
    const realName = String(dto.realName || dto.name || '').trim();
    const studentId = String(dto.studentId || dto.student_id || '').trim();
    const schoolName = String(dto.schoolName || dto.university || '').trim();
    const schoolId = String(dto.schoolId || dto.school_id || '').trim() || null;
    const cardImage = String(dto.cardImage || dto.photo_url || '').trim();
    const major = dto.major?.trim();
    const grade = dto.grade?.trim();

    if (!realName) throw new BadRequestException('请输入姓名');
    if (!studentId) throw new BadRequestException('请输入学号');
    if (!schoolName) throw new BadRequestException('请选择学校');
    if (!cardImage) throw new BadRequestException('请上传学生证照片');

    return { realName, studentId, schoolName, schoolId, major, grade, cardImage };
  }

  private toMiniStudentVerify(record: any) {
    return {
      id: record.id,
      student_id: record.studentId,
      name: record.realName,
      university: record.schoolName,
      school_id: record.schoolId || '',
      schoolId: record.schoolId || '',
      major: record.major || '',
      grade: record.grade || '',
      photo_url: record.cardImage || '',
      verification_status: record.status?.toLowerCase() || 'none',
      rejection_reason: record.remark || '',
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      verified_at: record.verifiedAt,
    };
  }

  private readonly universities = [
    { 序号: 1, 学校名称: '清华大学', 学校标识码: '4111010003', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 2, 学校名称: '北京大学', 学校标识码: '4111010001', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 3, 学校名称: '中国人民大学', 学校标识码: '4111010002', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 4, 学校名称: '北京航空航天大学', 学校标识码: '4111010006', 主管部门: '工业和信息化部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 5, 学校名称: '北京理工大学', 学校标识码: '4111010007', 主管部门: '工业和信息化部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 6, 学校名称: '中国农业大学', 学校标识码: '4111010019', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 7, 学校名称: '北京师范大学', 学校标识码: '4111010027', 主管部门: '教育部', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 8, 学校名称: '中央民族大学', 学校标识码: '4111010052', 主管部门: '国家民委', 所在地: '北京市', 办学层次: '本科' },
    { 序号: 9, 学校名称: '南开大学', 学校标识码: '4112010055', 主管部门: '教育部', 所在地: '天津市', 办学层次: '本科' },
    { 序号: 10, 学校名称: '天津大学', 学校标识码: '4112010056', 主管部门: '教育部', 所在地: '天津市', 办学层次: '本科' },
    { 序号: 11, 学校名称: '复旦大学', 学校标识码: '4131010246', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 12, 学校名称: '同济大学', 学校标识码: '4131010247', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 13, 学校名称: '上海交通大学', 学校标识码: '4131010248', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 14, 学校名称: '华东师范大学', 学校标识码: '4131010269', 主管部门: '教育部', 所在地: '上海市', 办学层次: '本科' },
    { 序号: 15, 学校名称: '南京大学', 学校标识码: '4132010284', 主管部门: '教育部', 所在地: '南京市', 办学层次: '本科' },
    { 序号: 16, 学校名称: '东南大学', 学校标识码: '4132010286', 主管部门: '教育部', 所在地: '南京市', 办学层次: '本科' },
    { 序号: 17, 学校名称: '浙江大学', 学校标识码: '4133010335', 主管部门: '教育部', 所在地: '杭州市', 办学层次: '本科' },
    { 序号: 18, 学校名称: '中国科学技术大学', 学校标识码: '4134010358', 主管部门: '中国科学院', 所在地: '合肥市', 办学层次: '本科' },
    { 序号: 19, 学校名称: '厦门大学', 学校标识码: '4135010384', 主管部门: '教育部', 所在地: '厦门市', 办学层次: '本科' },
    { 序号: 20, 学校名称: '山东大学', 学校标识码: '4137010422', 主管部门: '教育部', 所在地: '济南市', 办学层次: '本科' },
    { 序号: 21, 学校名称: '中国海洋大学', 学校标识码: '4137010423', 主管部门: '教育部', 所在地: '青岛市', 办学层次: '本科' },
    { 序号: 22, 学校名称: '武汉大学', 学校标识码: '4142010486', 主管部门: '教育部', 所在地: '武汉市', 办学层次: '本科' },
    { 序号: 23, 学校名称: '华中科技大学', 学校标识码: '4142010487', 主管部门: '教育部', 所在地: '武汉市', 办学层次: '本科' },
    { 序号: 24, 学校名称: '中南大学', 学校标识码: '4143010533', 主管部门: '教育部', 所在地: '长沙市', 办学层次: '本科' },
    { 序号: 25, 学校名称: '中山大学', 学校标识码: '4144010558', 主管部门: '教育部', 所在地: '广州市', 办学层次: '本科' },
    { 序号: 26, 学校名称: '华南理工大学', 学校标识码: '4144010561', 主管部门: '教育部', 所在地: '广州市', 办学层次: '本科' },
    { 序号: 27, 学校名称: '四川大学', 学校标识码: '4151010610', 主管部门: '教育部', 所在地: '成都市', 办学层次: '本科' },
    { 序号: 28, 学校名称: '电子科技大学', 学校标识码: '4151010614', 主管部门: '教育部', 所在地: '成都市', 办学层次: '本科' },
    { 序号: 29, 学校名称: '重庆大学', 学校标识码: '4150010611', 主管部门: '教育部', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 30, 学校名称: '西南大学', 学校标识码: '4150010635', 主管部门: '教育部', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 31, 学校名称: '重庆邮电大学', 学校标识码: '4150010617', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 32, 学校名称: '重庆交通大学', 学校标识码: '4150010618', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 33, 学校名称: '重庆医科大学', 学校标识码: '4150010631', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 34, 学校名称: '重庆师范大学', 学校标识码: '4150010637', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 35, 学校名称: '重庆工商大学', 学校标识码: '4150011799', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 36, 学校名称: '西南政法大学', 学校标识码: '4150010652', 主管部门: '重庆市', 所在地: '重庆市', 办学层次: '本科' },
    { 序号: 37, 学校名称: '西安交通大学', 学校标识码: '4161010698', 主管部门: '教育部', 所在地: '西安市', 办学层次: '本科' },
    { 序号: 38, 学校名称: '西北工业大学', 学校标识码: '4161010699', 主管部门: '工业和信息化部', 所在地: '西安市', 办学层次: '本科' },
    { 序号: 39, 学校名称: '兰州大学', 学校标识码: '4162010730', 主管部门: '教育部', 所在地: '兰州市', 办学层次: '本科' },
    { 序号: 40, 学校名称: '哈尔滨工业大学', 学校标识码: '4123010213', 主管部门: '工业和信息化部', 所在地: '哈尔滨市', 办学层次: '本科' },
  ];

  async followUser(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException('不能关注自己');
    await this.userAccess.assertCanInteract(userId, 'follow', '关注用户');
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '关注用户');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true },
    });
    if (!target || target.status === UserStatus.DELETED) throw new NotFoundException('用户不存在');
    if (target.status !== UserStatus.ACTIVE) throw new BadRequestException('该用户当前不可关注');
    await this.userAccess.assertNoBlockBetween(userId, targetId, '关注');
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetId } },
    });
    if (existing) return { success: true, followed: true, changed: false };
    await this.prisma.follow.create({ data: { followerId: userId, followingId: targetId } });
    await Promise.all([this.clearProfileCache(userId), this.clearProfileCache(targetId)]);

    // 发送关注通知
    try {
      const follower = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true, profile: { select: { regionId: true } } },
      });
      await this.notifyService.createAndDispatchInteraction({
        userId: targetId,
        regionId: follower?.profile?.regionId || undefined,
        type: 'FOLLOW',
        scene: 'user_follow',
        title: '你有新粉丝',
        content: `${follower?.nickname || '用户'} 关注了你`,
        data: { fromUserId: userId },
        linkType: 'user',
        linkValue: userId,
        channelMask: { inApp: true, websocket: true },
      });
    } catch {}

    return { success: true, followed: true, changed: true };
  }

  async unfollowUser(userId: string, targetId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '取消关注');
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followingId: targetId } });
    await Promise.all([this.clearProfileCache(userId), this.clearProfileCache(targetId)]);
    return { success: true };
  }

  async getFollowers(query: any, userId?: string) {
    const { user_id } = query;
    const page = this.toPositiveInt(query.page, 1);
    const limit = this.toPositiveInt(query.limit ?? query.pageSize, 20);
    const targetId = user_id || userId;
    if (!targetId) throw new BadRequestException('缺少用户ID');
    const canView = await this.canViewFollowList(targetId, userId, 'followers');
    if (!canView) return this.hiddenFollowListResult('followers', page, limit);
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: targetId },
        include: {
          follower: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
              profile: { select: { bio: true } },
              _count: { select: { posts: true, followers: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followingId: targetId } }),
    ]);
    const relationSets = await this.getFollowRelationSets(userId, list.map((item) => item.followerId));
    const data = list.map((item) => {
      const user = this.serializeFollowListUser(item.follower, relationSets);
      return {
        ...user,
        id: item.id,
        follow_id: item.id,
        follower_id: user.user_id,
        followerId: user.user_id,
        follower: user,
        created_at: item.createdAt,
        createdAt: item.createdAt,
      };
    });
    return { success: true, list: data, data, total, page, limit, pageSize: limit };
  }

  async getFollowings(query: any, userId?: string) {
    const { user_id } = query;
    const page = this.toPositiveInt(query.page, 1);
    const limit = this.toPositiveInt(query.limit ?? query.pageSize, 20);
    const targetId = user_id || userId;
    if (!targetId) throw new BadRequestException('缺少用户ID');
    const canView = await this.canViewFollowList(targetId, userId, 'following');
    if (!canView) return this.hiddenFollowListResult('following', page, limit);
    const [list, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: targetId },
        include: {
          following: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
              profile: { select: { bio: true } },
              _count: { select: { posts: true, followers: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followerId: targetId } }),
    ]);
    const relationSets = await this.getFollowRelationSets(userId, list.map((item) => item.followingId));
    const data = list.map((item) => {
      const user = this.serializeFollowListUser(item.following, relationSets);
      return {
        ...user,
        id: item.id,
        follow_id: item.id,
        following_id: user.user_id,
        followingId: user.user_id,
        following: user,
        created_at: item.createdAt,
        createdAt: item.createdAt,
      };
    });
    return { success: true, list: data, data, total, page, limit, pageSize: limit };
  }

  async searchMentionUsers(query: any, userId: string) {
    const keyword = String(query.keyword || query.q || '').trim();
    const limit = Math.min(this.toPositiveInt(query.limit ?? query.pageSize, 20), 50);
    if (!keyword) return { success: true, list: [], data: [], total: 0, limit };
    const numericKeyword = /^\d+$/.test(keyword) ? Number(keyword) : null;
    const where: any = {
      id: { not: userId },
      deletedAt: null,
      status: UserStatus.ACTIVE,
      OR: [
        { nickname: { contains: keyword } },
        ...(numericKeyword !== null ? [{ uid: numericKeyword }, { publicUid: numericKeyword }] : []),
      ],
    };
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        uid: true,
        publicUid: true,
        nickname: true,
        avatar: true,
        profile: { select: { bio: true } },
        _count: { select: { posts: true, followers: true } },
      },
      take: limit,
      orderBy: [{ createdAt: 'desc' }],
    });
    const allowedMentionIds = await this.interactionPermission.filterAllowedTargets(
      userId,
      users.map((item) => item.id),
      'mentionPermission',
    );
    const visibleUsers = users.filter((item) => allowedMentionIds.has(item.id));
    const relationSets = await this.getFollowRelationSets(userId, visibleUsers.map((item) => item.id));
    const list = visibleUsers.map((user) => {
      const formatted = this.serializeFollowListUser(user, relationSets);
      return {
        ...formatted,
        user_id: formatted.user_id,
        mention_user_id: formatted.user_id,
        display_text: `@${formatted.nickname || '用户'}`,
      };
    });
    return { success: true, list, data: list, total: list.length, limit };
  }

  async getUserViews(userId: string, query: ListQueryDto) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const where = { userId };

    const [histories, total] = await Promise.all([
      this.prisma.browseHistory.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: order },
      }),
      this.prisma.browseHistory.count({ where }),
    ]);

    const postIds = [...new Set(histories
      .filter((item) => item.targetType === 'post' && item.targetId)
      .map((item) => item.targetId))];
    const posts = postIds.length
      ? await this.prisma.post.findMany({
          where: { id: { in: postIds }, deletedAt: null },
          include: { media: { orderBy: { sortOrder: 'asc' } } },
        })
      : [];
    const postMap = new Map(posts.map((post) => [post.id, post]));

    const views = histories.map((item) => {
      const post = item.targetType === 'post' ? postMap.get(item.targetId) : null;
      const media = Array.isArray(post?.media) ? post.media : [];
      const images = media
        .filter((mediaItem: any) => String(mediaItem.type || '').toUpperCase() === 'IMAGE')
        .map((mediaItem: any) => this.publicAssetUrl(mediaItem.url))
        .filter(Boolean);
      const firstVideo = media.find((mediaItem: any) => String(mediaItem.type || '').toUpperCase() === 'VIDEO');
      const firstAudio = media.find((mediaItem: any) => String(mediaItem.type || '').toUpperCase() === 'AUDIO');
      const cover = this.publicAssetUrl(
        item.image ||
        images[0] ||
        firstVideo?.thumb ||
        firstAudio?.thumb ||
        ''
      );
      const type = images.length
        ? 'image'
        : firstVideo
          ? 'video'
          : firstAudio
            ? 'audio'
            : 'text';
      const title = item.title || post?.title || post?.content?.slice(0, 40) || '笔记';

      return {
        id: item.id,
        view_id: item.id,
        target_id: item.targetId,
        targetId: item.targetId,
        target_type: item.targetType,
        targetType: item.targetType,
        post_id: item.targetType === 'post' ? item.targetId : '',
        postId: item.targetType === 'post' ? item.targetId : '',
        title,
        content: post?.content || '',
        type,
        images,
        cover_url: cover,
        coverUrl: cover,
        image: cover,
        view_time: item.createdAt,
        viewed_at: item.createdAt,
        created_at: item.createdAt,
        createdAt: item.createdAt,
      };
    });

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    return {
      success: true,
      views,
      data: views,
      list: views,
      pagination: { page, pageSize, total, totalPages },
      total,
      page,
      pageSize,
    };
  }

  async clearUserViews(userId: string) {
    await this.prisma.browseHistory.deleteMany({ where: { userId } });
    return { success: true };
  }

  async getRegionTestimonials(regionId: string) {
    return this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { id: true, nickname: true, avatar: true },
    });
  }
}
