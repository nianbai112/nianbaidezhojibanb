import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class OperationService {
  constructor(private readonly prisma: PrismaService) {}

  private getNoteSettingConfigKey(regionId: string) {
    return `content.note_settings.${regionId}`;
  }

  private getNoteSettingDefaults(regionId = "") {
    return {
      regionId,
      enable_region_posting: 1,
      min_length: 1,
      max_length: 5000,
      enable_note_title: 0,
      title_min_length: 0,
      title_max_length: 50,
      publish_interval_seconds: 0,
      allow_images: 1,
      max_images_per_note: 9,
      allow_download_image: 0,
      allow_videos: 1,
      allow_audio: 1,
      allow_pure_text_notes: 1,
      image_compression_ratio: 0.8,
      enable_qrcode_filter: 0,
      qrcode_replace_image_url: "",
      qrcode_whitelist_user_ids: [],
      enable_topics: 1,
      max_topics_per_note: 3,
      allow_anonymous_notes: 0,
      anonymous_default_name: "匿名用户",
      enable_note_location: 0,
      enable_note_group: 0,
      enable_note_top: 0,
      enable_co_create_note: 0,
      enable_vote: 0,
      note_approval_type: "manual",
      require_phone_before_publish: 0,
      require_student_auth_before_publish: 0,
      daily_publish_limit: 10,
      default_note_prompt: "",
      content_declaration: "发布校园生活、经验和新鲜事",
      allow_comments: 1,
      max_comments: 100,
      comment_length_limit: 500,
      allow_anonymous_comments: 0,
      allow_author_pin_comment: 0,
      allow_manager_delete_comment: 1,
      comment_approval_type: "manual",
      random_comment_enabled: 0,
      enable_ads: 0,
      card_ad_content: "",
      waterfall_ad_content: "",
      note_list_style: "waterfall",
      note_sort_strategy: "latest",
      allow_edit: 1,
      editable_hours: 24,
      allow_delete: 1,
      deletable_hours: 72,
      manager_can_edit_note: 1,
      manager_can_delete_note: 1,
      show_view_count: 1,
      view_count_mode: "unlimited",
      enable_report: 1,
      allow_friend_share: 1,
      enable_share_poster: 0,
      enable_comment_qrcode_filter: 0,
      enable_squat: 1,
    };
  }

  private normalizeNoteSettingPayload(payload: any, regionId: string) {
    const defaults = this.getNoteSettingDefaults(regionId);
    const source = { ...(payload || {}) };
    if (source.allowTextNote !== undefined) source.allow_pure_text_notes = source.allowTextNote ? 1 : 0;
    if (source.allowImageNote !== undefined) source.allow_images = source.allowImageNote ? 1 : 0;
    if (source.allowVideoNote !== undefined) source.allow_videos = source.allowVideoNote ? 1 : 0;
    const aliasPairs: Array<[string, string]> = [
      ["allow_image_download", "allow_download_image"],
      ["note_publish_interval_seconds", "publish_interval_seconds"],
      ["max_notes_per_day", "daily_publish_limit"],
      ["enable_note_qrcode_filter", "enable_qrcode_filter"],
      ["blocked_image_replacement_url", "qrcode_replace_image_url"],
      ["force_bind_phone", "require_phone_before_publish"],
      ["force_student_auth", "require_student_auth_before_publish"],
      ["enable_random_comment", "random_comment_enabled"],
      ["edit_time_limit", "editable_hours"],
      ["delete_time_limit", "deletable_hours"],
      ["allow_manager_edit", "manager_can_edit_note"],
      ["allow_manager_delete_note", "manager_can_delete_note"],
      ["note_sorting_strategy", "note_sort_strategy"],
    ];
    for (const [alias, key] of aliasPairs) {
      if (source[key] === undefined && source[alias] !== undefined) source[key] = source[alias];
    }
    const merged: any = { ...defaults, ...source, regionId };
    for (const key of [
      "enable_region_posting", "enable_note_title", "allow_images", "allow_download_image", "allow_videos",
      "allow_audio", "allow_pure_text_notes", "enable_qrcode_filter", "enable_topics", "allow_anonymous_notes",
      "enable_note_location", "enable_note_group", "enable_note_top", "enable_co_create_note", "enable_vote",
      "require_phone_before_publish", "require_student_auth_before_publish", "allow_comments",
      "allow_anonymous_comments", "allow_author_pin_comment", "allow_manager_delete_comment", "random_comment_enabled",
      "enable_ads", "allow_edit", "allow_delete", "manager_can_edit_note", "manager_can_delete_note",
      "show_view_count", "enable_report", "allow_friend_share", "enable_share_poster", "enable_comment_qrcode_filter", "enable_squat",
    ]) {
      merged[key] = merged[key] ? 1 : 0;
    }
    const numericKeys = [
      "min_length",
      "max_length",
      "title_min_length",
      "title_max_length",
      "publish_interval_seconds",
      "max_images_per_note",
      "max_topics_per_note",
      "daily_publish_limit",
      "max_comments",
      "comment_length_limit",
      "editable_hours",
      "deletable_hours",
    ];
    for (const key of numericKeys) {
      const n = Number(merged[key]);
      merged[key] = Number.isFinite(n) ? n : defaults[key as keyof typeof defaults];
    }
    const ratio = Number(merged.image_compression_ratio);
    merged.image_compression_ratio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0.1), 1) : 0.8;
    if (typeof merged.qrcode_whitelist_user_ids === "string") {
      merged.qrcode_whitelist_user_ids = merged.qrcode_whitelist_user_ids
        .split(/[,\n]/)
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
    return {
      ...merged,
      allow_image_download: !!merged.allow_download_image,
      note_publish_interval_seconds: merged.publish_interval_seconds,
      max_notes_per_day: merged.daily_publish_limit,
      enable_note_qrcode_filter: !!merged.enable_qrcode_filter,
      blocked_image_replacement_url: merged.qrcode_replace_image_url,
      force_bind_phone: !!merged.require_phone_before_publish,
      force_student_auth: !!merged.require_student_auth_before_publish,
      enable_random_comment: !!merged.random_comment_enabled,
      edit_time_limit: merged.editable_hours,
      delete_time_limit: merged.deletable_hours,
      allow_manager_edit: !!merged.manager_can_edit_note,
      allow_manager_delete_note: !!merged.manager_can_delete_note,
      note_sorting_strategy: merged.note_sort_strategy,
      allowTextNote: !!merged.allow_pure_text_notes,
      allowImageNote: !!merged.allow_images,
      allowVideoNote: !!merged.allow_videos,
    };
  }

  // ========== 优惠券 ==========
  async getAvailableCoupons(userId: string, query: any) {
    const { region_id, module: moduleType, page = 1, limit = 10 } = query;
    return this.prisma.coupon.findMany({ where: { status: 'active' }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async claimCoupon(id: string, userId: string) {
    return this.prisma.couponReceive.create({ data: { couponId: id, userId } });
  }

  async getMyCoupons(userId: string, query: any) {
    const { status = 'unused', page = 1, limit = 10 } = query;
    return this.prisma.couponReceive.findMany({ where: { userId, status }, include: { coupon: true }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async redeemCoupon(userId: string, dto: any) {
    const { code } = dto;
    const coupon = await this.prisma.coupon.findFirst({ where: { name: code, status: 'active' } });
    if (!coupon) throw new BadRequestException('优惠券不存在或已失效');
    const received = await this.prisma.couponReceive.findFirst({ where: { couponId: coupon.id, userId } });
    if (received) throw new BadRequestException('已领取过该优惠券');
    return this.prisma.couponReceive.create({ data: { couponId: coupon.id, userId } });
  }

  // ========== 二手 ==========
  async getSecondHandByArea(areaId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    return this.prisma.secondHand.findMany({ where: { regionId: areaId, status: 'ON_SALE' }, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  async createSecondHand(userId: string, dto: any) {
    return this.prisma.secondHand.create({ data: { userId, ...dto } });
  }

  async getSecondHandDetail(id: string) {
    return this.prisma.secondHand.findUnique({ where: { id } });
  }

  async createSecondHandOrder(userId: string, dto: any) {
    return this.prisma.secondHandOrder.create({ data: { buyerId: userId, ...dto, orderNo: `SH${Date.now()}` } });
  }

  // ========== 漂流瓶 ==========
  async getDriftBottleConfig(regionId: string) {
    return { enabled: true, maxDailyThrows: 10, maxDailyPicks: 10 };
  }

  async createDriftBottle(userId: string, dto: any) {
    return this.prisma.driftBottle.create({ data: { userId, ...dto } });
  }

  async pickDriftBottle(userId: string, dto: any) {
    const count = await this.prisma.driftBottle.count({ where: { userId: { not: userId } } });
    if (count === 0) throw new NotFoundException('暂时没有漂流瓶');
    const skip = Math.floor(Math.random() * count);
    const bottle = await this.prisma.driftBottle.findFirst({ where: { userId: { not: userId } }, skip });
    if (!bottle) throw new NotFoundException('暂时没有漂流瓶');
    await this.prisma.driftBottle.update({ where: { id: bottle.id }, data: { pickCount: { increment: 1 } } });
    return bottle;
  }

  async getMyBottles(userId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.driftBottle.findMany({ where: { userId }, skip: (page - 1) * page_size, take: Number(page_size), orderBy: { createdAt: 'desc' } });
  }

  async getMyPickups(userId: string, query: any) {
    const { page = 1, page_size = 10 } = query;
    return this.prisma.driftBottle.findMany({
      where: { pickCount: { gt: 0 } },
      skip: (page - 1) * page_size,
      take: Number(page_size),
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDriftBottle(bottleId: string, userId: string, dto: any) {
    return this.prisma.driftBottle.update({ where: { id: bottleId }, data: dto });
  }

  async getDriftBottlePosters(limit: number) {
    return this.prisma.driftBottle.findMany({ take: Number(limit), orderBy: { pickCount: 'desc' } });
  }

  // ========== 签到 ==========
  async getSigninConfig(regionId: string) {
    return this.prisma.punchInConfig.findUnique({ where: { regionId } });
  }

  async getSigninStatus(regionId: string, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const record = await this.prisma.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } });
    return { isSigned: !!record, continuousDays: record ? 1 : 0 };
  }

  async signin(regionId: string, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const exists = await this.prisma.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } });
    if (exists) throw new BadRequestException('今日已签到');
    return this.prisma.punchInRecord.create({ data: { userId, regionId, date: today, rewardValue: 1 } });
  }

  async makeupSignin(regionId: string, userId: string, dto: any) {
    return this.prisma.punchInRecord.create({ data: { userId, regionId, date: dto.date, isMakeup: true } });
  }

  async getSigninRewards(regionId: string, userId: string, query: any) {
    return this.prisma.punchInRecord.findMany({ where: { userId, regionId }, orderBy: { createdAt: 'desc' } });
  }

  // ========== 打卡 ==========
  async getPunchInConfig(regionId: string) {
    return this.prisma.punchInConfig.findUnique({ where: { regionId } });
  }

  async getPunchInStatus(regionId: string, userId: string) {
    return this.getSigninStatus(regionId, userId);
  }

  async punchInCheckIn(userId: string, dto: any) {
    return this.signin(dto.region_id, userId);
  }

  async getPunchInLocations(query: any) {
    const { region_id } = query;
    return this.prisma.punchInLocation.findMany({ where: { regionId: region_id, status: 'PUBLISHED' } });
  }

  async getPunchInLocationDetail(locationId: string) {
    return this.prisma.punchInLocation.findUnique({ where: { id: locationId } });
  }

  async updatePunchInLocation(locationId: string, dto: any) {
    return this.prisma.punchInLocation.update({
      where: { id: locationId },
      data: {
        name: dto.name,
        description: dto.description || dto.desc,
        address: dto.address,
        latitude: dto.latitude === undefined ? undefined : Number(dto.latitude),
        longitude: dto.longitude === undefined ? undefined : Number(dto.longitude),
        coverImage: dto.coverImage || dto.cover || dto.cover_url,
        status: dto.status,
      },
    });
  }

  async getPunchInComments(locationId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.comment.findMany({
      where: { postId: locationId },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPunchInComment(userId: string, dto: any) {
    return this.prisma.comment.create({
      data: {
        userId,
        postId: dto.location_id,
        content: dto.content,
      },
    });
  }

  async getWishlist(userId: string) {
    return this.prisma.punchInWishlist.findMany({ where: { userId } });
  }

  async addWishlist(locationId: string, userId: string, dto: any) {
    return this.prisma.punchInWishlist.create({ data: { userId, locationId, content: dto.content } });
  }

  async addWishlistFromBody(userId: string, dto: any) {
    const locationId = dto.locationId || dto.location_id;
    if (!locationId) throw new BadRequestException('缺少打卡点ID');
    return this.addWishlist(String(locationId), userId, dto);
  }

  async removeWishlist(locationId: string, userId: string) {
    await this.prisma.punchInWishlist.deleteMany({ where: { userId, locationId } });
    return { success: true };
  }

  // ========== 评分 ==========
  async getRatingCategories(regionId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.ratingCategory.findMany({ where: { regionId }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async getRatingCategoryDetail(categoryId: string) {
    return this.prisma.ratingCategory.findUnique({ where: { id: categoryId } });
  }

  async getRatingItems(categoryId: string, query: any) {
    const { page = 1, limit = 10, search, sort = 'hot' } = query;
    return this.prisma.ratingItem.findMany({ where: { categoryId }, skip: (page - 1) * limit, take: Number(limit), orderBy: { avgScore: 'desc' } });
  }

  async getRatingItemDetail(itemId: string) {
    return this.prisma.ratingItem.findUnique({ where: { id: itemId }, include: { ratings: true } });
  }

  async getRatingItemDynamics(itemId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.userRating.findMany({ where: { itemId }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } });
  }

  async submitRating(userId: string, dto: any) {
    return this.prisma.userRating.create({ data: { userId, itemId: dto.item_id, score: dto.score, content: dto.content, images: dto.images } });
  }

  async createRatingItem(userId: string, dto: any) {
    const categoryId = dto.categoryId || dto.category_id;
    const name = dto.name || dto.title;
    if (!categoryId) throw new BadRequestException('缺少评分分类ID');
    if (!name) throw new BadRequestException('缺少评分对象名称');
    return this.prisma.ratingItem.create({
      data: {
        categoryId,
        regionId: dto.regionId || dto.region_id,
        name,
        cover: dto.cover || dto.image || dto.image_url,
        description: dto.description || dto.desc,
        status: dto.status || 'enabled',
      },
    });
  }

  async getRatingReplies(query: any) {
    const { rating_id, page = 1, limit = 10 } = query;
    return this.prisma.ratingReply.findMany({
      where: rating_id ? { ratingId: rating_id } : {},
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRatingReply(userId: string, dto: any) {
    const ratingId = dto.ratingId || dto.rating_id;
    if (!ratingId) throw new BadRequestException('缺少评分ID');
    if (!dto.content) throw new BadRequestException('回复内容不能为空');
    return this.prisma.ratingReply.create({
      data: {
        ratingId,
        userId,
        content: dto.content,
        status: dto.status || 'approved',
      },
    });
  }

  // ========== 网盘 ==========
  async getNetDiskCategories(query: any) {
    return this.prisma.netDiskCategory.findMany();
  }

  async getNetDiskResources(query: any) {
    return this.prisma.netDiskResource.findMany();
  }

  async getNetDiskResourceDetail(id: string) {
    return this.prisma.netDiskResource.findUnique({ where: { id } });
  }

  async getNetDiskComments(query: any) {
    return this.prisma.netDiskComment.findMany();
  }

  async createNetDiskComment(userId: string, dto: any) {
    return this.prisma.netDiskComment.create({ data: { userId, resourceId: dto.resource_id, content: dto.content } });
  }

  async favoriteNetDisk(resourceId: string, userId: string) {
    return this.prisma.netDiskFavorite.upsert({ where: { userId_resourceId: { userId, resourceId } }, create: { userId, resourceId }, update: {} });
  }

  async unfavoriteNetDisk(resourceId: string, userId: string) {
    await this.prisma.netDiskFavorite.deleteMany({ where: { userId, resourceId } });
    return { success: true };
  }

  async getNetDiskFavorites(userId: string, query: any) {
    return this.prisma.netDiskFavorite.findMany({ where: { userId } });
  }

  async reportNetDisk(userId: string, dto: any) {
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'netdisk',
        targetId: dto.resource_id,
        reason: dto.reason,
        status: 'pending',
      },
    });
  }

  // ========== 贴纸 ==========
  async getStickerCategories() {
    return this.prisma.stickerCategory.findMany();
  }

  async getMyStickers(userId: string, query: any) {
    return this.prisma.sticker.findMany({ where: { userId } });
  }

  async getSharedStickers(query: any) {
    return this.prisma.sticker.findMany({ where: { isShared: true } });
  }

  async uploadSticker(userId: string, dto: any) {
    return this.prisma.sticker.create({ data: { userId, ...dto } });
  }

  // ========== 分享 ==========
  async getShareSettings(regionId: string) {
    return this.prisma.shareSettings.findUnique({ where: { regionId } });
  }

  async beInvited(userId: string, dto: any) {
    return this.prisma.shareInvite.create({ data: { inviterId: dto.inviter_id, inviteeId: userId } });
  }

  async getInviteRecords(userId: string) {
    return this.prisma.shareInvite.findMany({ where: { inviterId: userId } });
  }

  // ========== 匿名身份 ==========
  async getRandomAnonymous() {
    const count = await this.prisma.anonymousIdentity.count();
    if (!count) return null;
    const skip = Math.floor(Math.random() * count);
    return this.prisma.anonymousIdentity.findFirst({ skip });
  }

  // ========== 排行榜 ==========
  async getRankings(query: any) {
    const { type = 'user', page = 1, limit = 20 } = query;
    if (type === 'user') {
      const users = await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Number(limit),
        select: { id: true, nickname: true, avatar: true },
      });
      return { list: users, total: await this.prisma.user.count() };
    }
    if (type === 'post') {
      const posts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { likeCount: 'desc' },
        skip: (page - 1) * limit,
        take: Number(limit),
        select: { id: true, title: true, content: true, likeCount: true, userId: true },
      });
      return { list: posts, total: await this.prisma.post.count({ where: { status: 'PUBLISHED' } }) };
    }
    return { list: [], total: 0 };
  }

  // ========== 微信文章 ==========
  async getWechatArticleImages(url: string) {
    const article = await this.prisma.wechatArticle.findFirst({ where: { url } });
    if (article?.images && Array.isArray(article.images)) {
      return { images: article.images };
    }
    return { images: [] };
  }

  // ========== 通讯录 ==========
  async getContacts(query: any) {
    return this.prisma.contact.findMany({ where: { isPublic: true } });
  }

  async getContactCategories(regionId: string) {
    return this.prisma.contactCategory.findMany({ where: { regionId } });
  }

  async getContactDetail(id: string) {
    return this.prisma.contact.findUnique({ where: { id } });
  }

  async createContact(userId: string, dto: any) {
    return this.prisma.contact.create({ data: dto });
  }

  async updateContact(id: string, userId: string, dto: any) {
    return this.prisma.contact.update({ where: { id }, data: dto });
  }

  async deleteContact(id: string, userId: string) {
    await this.prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  async getMyContacts(userId: string, query: any) {
    const { region_id } = query;
    if (region_id) {
      const region = await this.prisma.region.findUnique({
        where: { id: region_id },
        select: { contactsRequireStudentAuth: true },
      });
      if (region && region.contactsRequireStudentAuth) {
        const studentVerify = await this.prisma.studentVerify.findUnique({
          where: { userId },
          select: { status: true },
        });
        if (!studentVerify || studentVerify.status !== 'APPROVED') {
          throw new ForbiddenException('当前区域通讯录需要学生认证，请先完成学生认证');
        }
      }
    }
    return this.prisma.contact.findMany();
  }

  // ========== 富文本内容 ==========
  async getRichTextContents(query: any) {
    const { region_id, page = 1, limit = 10 } = query;
    return this.prisma.richTextContent.findMany({ where: { regionId: region_id, isShow: true }, skip: (page - 1) * limit, take: Number(limit) });
  }

  async getRichTextContent(id: string) {
    return this.prisma.richTextContent.findUnique({ where: { id } });
  }

  async getRegionContentTypes(regionId: string) {
    return this.prisma.richTextContent.groupBy({ by: ['type'], where: { regionId } });
  }

  // ========== 用户引导 ==========
  async getUserGuidancePages(regionId: string) {
    return this.prisma.userGuidancePage.findMany({ where: { regionId, isShow: true } });
  }

  async saveUserGuidanceInfo(userId: string, dto: any) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: { privacyLevel: dto.step || 0 },
      create: { userId, privacyLevel: dto.step || 0 },
    });
  }

  // ========== 笔记设置 ==========
  async getNoteSettings(regionId: string) {
    if (!regionId) {
      return { success: false, message: '区域ID不能为空', data: this.getNoteSettingDefaults() };
    }
    const [settings, config, region] = await Promise.all([
      this.prisma.noteSettings.findUnique({ where: { regionId } }).catch(() => null),
      this.prisma.config.findUnique({ where: { key: this.getNoteSettingConfigKey(regionId) } }).catch(() => null),
      this.prisma.region.findUnique({ where: { id: regionId }, select: { settings: true } }).catch(() => null),
    ]);
    const regionSettings = (region?.settings || {}) as Record<string, any>;
    const data = this.normalizeNoteSettingPayload({
      ...((config?.value || regionSettings.noteConfig || {}) as Record<string, any>),
      allowTextNote: settings?.allowTextNote,
      allowImageNote: settings?.allowImageNote,
      allowVideoNote: settings?.allowVideoNote,
    }, regionId);
    return { success: true, data };
  }

  // ========== 用户标签 ==========
  async getUserTags(regionId: string) {
    return this.prisma.userTag.findMany({ where: { userId: regionId } });
  }

  async updateUserTagRelation(userId: string, dto: any) {
    const { tagIds } = dto;
    if (Array.isArray(tagIds)) {
      await this.prisma.userTag.deleteMany({ where: { userId } });
      for (const tagId of tagIds) {
        const tag = await this.prisma.userTag.findUnique({ where: { id: tagId } });
        if (tag) {
          await this.prisma.userTag.create({
            data: { userId, name: tag.name, color: tag.color },
          });
        }
      }
    }
    return { success: true };
  }

  // ========== 区域自定义页面 ==========
  async getRegionCustomPages(regionId: string, query: any) {
    return this.prisma.regionCustomPage.findMany({ where: { regionId, isShow: true } });
  }

  // ========== 交友 ==========
  async getDatingConfig(regionId: string) {
    return this.prisma.datingConfig.findUnique({ where: { regionId } });
  }

  async getDatingProfile(userId: string) {
    return this.prisma.datingProfile.findUnique({ where: { userId } });
  }

  async createOrUpdateDatingProfile(userId: string, dto: any) {
    return this.prisma.datingProfile.upsert({
      where: { userId },
      update: {
        photos: dto.photos,
        bio: dto.bio || dto.description,
        tags: dto.tags,
        isOpen: dto.isOpen ?? dto.is_open,
        auditStatus: 'pending',
      },
      create: {
        userId,
        photos: dto.photos,
        bio: dto.bio || dto.description,
        tags: dto.tags,
        isOpen: dto.isOpen ?? dto.is_open ?? true,
        auditStatus: 'pending',
      },
    });
  }

  async getDatingProfileList(query: any) {
    return this.prisma.datingProfile.findMany();
  }

  async datingMatchAction(userId: string, dto: any) {
    const { targetId, action } = dto;
    return this.prisma.match.create({
      data: { userId, targetId, status: action === 'like' ? 'MATCHED' : 'REJECTED', matchType: 'interest' },
    });
  }

  async getDatingPackages(query: any) {
    return this.prisma.datingPackage.findMany();
  }

  async createDatingOrder(userId: string, dto: any) {
    return this.prisma.datingOrder.create({ data: { userId, packageId: dto.package_id, amount: dto.amount, orderNo: `DAT${Date.now()}` } });
  }

  // ========== 团购 ==========
  async getGroupBuyPackages(query: any) {
    return this.prisma.groupBuyPackage.findMany({ where: { status: 'active' } });
  }

  async createGroupBuyOrder(userId: string, dto: any) {
    return this.prisma.groupBuyOrder.create({ data: { userId, packageId: dto.package_id, amount: dto.amount, orderNo: `GB${Date.now()}` } });
  }

  async getGroupBuyOrder(orderSn: string) {
    return this.prisma.groupBuyOrder.findUnique({ where: { orderNo: orderSn } });
  }

  // ========== 社区 ==========
  async getCommunityDetail(communityId: string) {
    return this.prisma.community.findUnique({ where: { id: communityId } });
  }

  async createCommunityPayment(userId: string, dto: any) {
    return this.prisma.communityPayment.create({ data: { userId, communityId: dto.community_id, amount: dto.amount } });
  }

  // ========== 用户头衔 ==========
  async getUserTitles(query: any) {
    return this.prisma.userTitle.findMany();
  }

  async claimTitle(titleId: string, userId: string) {
    return this.prisma.userTitleRecord.upsert({ where: { userId_titleId: { userId, titleId } }, create: { userId, titleId }, update: {} });
  }

  async wearTitle(titleId: string, userId: string) {
    await this.prisma.userTitleRecord.updateMany({ where: { userId }, data: { isWearing: false } });
    return this.prisma.userTitleRecord.update({ where: { userId_titleId: { userId, titleId } }, data: { isWearing: true } });
  }

  async unwearTitle(userId: string) {
    await this.prisma.userTitleRecord.updateMany({ where: { userId }, data: { isWearing: false } });
    return { success: true };
  }

  async getUserTitlesById(userId: string) {
    return this.prisma.userTitleRecord.findMany({ where: { userId }, include: { title: true } });
  }

  async getCurrentTitle(userId: string) {
    return this.prisma.userTitleRecord.findFirst({ where: { userId, isWearing: true }, include: { title: true } });
  }

  async useRedeemCode(userId: string, dto: any) {
    const { code } = dto;
    const redeemCode = await this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
    if (!redeemCode) throw new BadRequestException('兑换码不存在');
    if (redeemCode.usedBy) throw new BadRequestException('兑换码已被使用');
    if (redeemCode.expireAt && new Date(redeemCode.expireAt) < new Date()) throw new BadRequestException('兑换码已过期');
    await this.prisma.userTitleRedeemCode.update({
      where: { id: redeemCode.id },
      data: { usedBy: userId, usedAt: new Date() },
    });
    await this.prisma.userTitleRecord.create({
      data: { userId, titleId: redeemCode.titleId },
    });
    return { success: true };
  }

  async getRedeemCodeInfo(code: string) {
    return this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
  }

  // ========== AI ==========
  async getAIConfig() {
    const config = await this.prisma.config.findUnique({ where: { key: 'ai_config' } });
    const raw = (config?.value as Record<string, any>) || {};
    const { apiKey, ...safe } = raw;
    return { ...safe, enabled: raw.enabled ?? false, hasApiKey: !!apiKey };
  }

  async generateAIComments(dto: any) {
    const { postId, contentType, regionId, count = 5, tone, persona } = dto;

    const config = await this.prisma.config.findUnique({ where: { key: 'ai_config' } });
    const aiConfig = (config?.value as Record<string, any>) || {};

    if (!aiConfig.enabled || !aiConfig.apiKey) {
      return {
        success: false,
        error: '请先在 AI运营中心 / AI配置 中配置模型（需填写 apiKey 并启用）',
        comments: [],
      };
    }

    const botAccounts = await this.prisma.botAccount.findMany({
      where: {
        status: 'active',
        ...(regionId ? { regionId } : {}),
      },
      take: 1,
    });
    const botAccount = botAccounts[0];
    if (!botAccount) {
      return {
        success: false,
        error: regionId ? '当前区域暂无可用机器人账号，请先在 AI运营中心 / 机器人管理 中创建并启用机器人' : '暂无可用机器人账号，请先在 AI运营中心 / 机器人管理 中创建并启用机器人',
        comments: [],
      };
    }

    const task = await this.prisma.botPostTask.create({
      data: {
        type: 'comment_generate',
        title: `AI评论生成 - ${postId || contentType || '通用'}`,
        content: JSON.stringify({ postId, contentType, regionId, count, tone, persona }),
        botId: botAccount.id,
        regionId: regionId || null,
        status: 'running',
      },
    });

    try {
      const provider = aiConfig.provider || 'openai';
      const baseURL = aiConfig.baseURL || 'https://api.openai.com/v1';
      const model = aiConfig.model || 'gpt-3.5-turbo';
      const temperature = aiConfig.temperature ?? 0.8;
      const maxTokens = aiConfig.maxTokens ?? 500;

      let postContext = '';
      if (postId) {
        const post = await this.prisma.post.findUnique({
          where: { id: postId },
          select: { title: true, content: true },
        });
        if (post) postContext = `帖子标题: ${post.title || ''}\n帖子内容: ${(post.content || '').slice(0, 500)}`;
      }

      const systemPrompt = aiConfig.prompt || '你是一个校园社区的活跃用户，负责生成自然、真实的评论。';
      const userPrompt = `请为以下内容生成 ${count} 条${tone || '友好'}风格的评论。\n${postContext}\n要求：每条评论独立一行，内容真实自然，像真人写的，不要带序号。`;

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`AI API 调用失败 (${response.status}): ${errText.slice(0, 200)}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';
      const comments = content.split('\n').map((c: string) => c.trim()).filter((c: string) => c.length > 0);

      const botUserId = botAccount.userId;

      const savedComments: any[] = [];
      if (postId && comments.length > 0) {
        for (const commentText of comments) {
          try {
            const comment = await this.prisma.comment.create({
              data: {
                postId,
                userId: botUserId || 'system',
                content: commentText,
                status: 'active',
                auditStatus: 'approved',
              },
            });
            savedComments.push(comment);
          } catch (e: any) {
            this.prisma.botActionLog.create({
              data: {
                botId: botAccount.id,
                action: 'comment_error',
                targetType: 'comment',
                targetId: postId,
                detail: { error: e.message, content: commentText },
              },
            }).catch(() => {});
          }
        }
      }

      await this.prisma.botPostTask.update({
        where: { id: task.id },
        data: {
          status: 'completed',
        },
      });

      await this.prisma.botActionLog.create({
        data: {
          botId: botAccount.id,
          action: 'generate_comments',
          targetType: 'post',
          targetId: postId || 'general',
          detail: {
            taskId: task.id,
            generated: comments.length,
            saved: savedComments.length,
            provider,
            model,
          },
        },
      }).catch(() => {});

      return {
        success: true,
        taskId: task.id,
        comments: savedComments.length > 0 ? savedComments : comments,
        generated: comments.length,
        saved: savedComments.length,
      };
    } catch (error: any) {
      const errorMsg = error?.message || 'AI评论生成失败';

      await this.prisma.botPostTask.update({
        where: { id: task.id },
        data: { status: 'failed' },
      }).catch(() => {});

      await this.prisma.botActionLog.create({
        data: {
          botId: botAccount.id,
          action: 'generate_comments_error',
          targetType: 'task',
          targetId: task.id,
          detail: { error: errorMsg },
        },
      }).catch(() => {});

      return { success: false, error: errorMsg, taskId: task.id, comments: [] };
    }
  }
}
