import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { PaymentService } from '../payment/payment.service';
import { MembershipService } from '../membership/membership.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { GrowthService } from '../growth/growth.service';

@Injectable()
export class OperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly paymentService: PaymentService,
    private readonly membershipService: MembershipService,
    private readonly growthService: GrowthService,
    private readonly userAccess: UserAccessPolicyService,
  ) {}

  private getNoteSettingConfigKey(regionId: string) {
    return `content.note_settings.${regionId}`;
  }

  private publicUploadUrl(value: any) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^(https?:)?\/\//i.test(text) || /^data:/i.test(text)) return text;
    if (text.startsWith('/api/uploads/')) return text;
    if (text.startsWith('api/uploads/')) return `/${text}`;
    if (text.startsWith('/uploads/')) return `/api${text}`;
    if (text.startsWith('uploads/')) return `/api/${text}`;
    return text;
  }

  private normalizeRegionScope(value: any) {
    const text = String(value || '').trim();
    return text && text !== '__global__' ? text : null;
  }

  private async getMemberGrant(userId: string, benefitKey: string) {
    const benefits = await this.membershipService.getUserBenefits(userId).catch(() => null);
    return (benefits?.list || []).find((item: any) => item.benefitKey === benefitKey);
  }

  private async hasMemberBenefit(userId: string, benefitKey: string) {
    return !!(await this.getMemberGrant(userId, benefitKey));
  }

  private async getMemberNumericBenefit(userId: string, benefitKey: string) {
    const grant = await this.getMemberGrant(userId, benefitKey);
    return Math.max(0, Number(grant?.amount || 0));
  }

  private readonly agreementDefaults = [
    { type: 'TERMS_OF_SERVICE', title: '用户协议', scene: 'login', isRequired: true },
    { type: 'PRIVACY_POLICY', title: '隐私政策', scene: 'login', isRequired: true },
    { type: 'CONTENT_RULES', title: '社区内容规范', scene: 'post', isRequired: true },
    { type: 'PAYMENT_RULES', title: '支付与退款规则', scene: 'payment', isRequired: true },
    { type: 'PINNING_SERVICE', title: '付费置顶服务说明', scene: 'paid_pinning', isRequired: true },
    { type: 'DORM_SHOP_RULES', title: '宿舍小店经营规范', scene: 'dorm_shop', isRequired: true },
    { type: 'RIDER_RULES', title: '骑手服务规范', scene: 'rider', isRequired: true },
    { type: 'MERCHANT_RULES', title: '商家入驻与经营规范', scene: 'merchant', isRequired: true },
    { type: 'REGION_AGENT_RULES', title: '区域合作入驻规则', scene: 'city_agent', isRequired: true },
  ];

  private normalizeAgreementType(type: any) {
    const aliasMap: Record<string, string> = {
      SERVICE: 'TERMS_OF_SERVICE',
      USER: 'TERMS_OF_SERVICE',
      TERMS: 'TERMS_OF_SERVICE',
      PRIVACY: 'PRIVACY_POLICY',
      CONTENT: 'CONTENT_RULES',
      POST: 'CONTENT_RULES',
      PAYMENT: 'PAYMENT_RULES',
      PAY: 'PAYMENT_RULES',
      PINNING: 'PINNING_SERVICE',
      PAID_PINNING: 'PINNING_SERVICE',
      DORM_SHOP: 'DORM_SHOP_RULES',
      DORMSHOP: 'DORM_SHOP_RULES',
      RIDER: 'RIDER_RULES',
      MERCHANT: 'MERCHANT_RULES',
      CITY_AGENT: 'REGION_AGENT_RULES',
      REGION_AGENT: 'REGION_AGENT_RULES',
    };
    const raw = String(type || '').trim().replace(/[-\s]+/g, '_').toUpperCase();
    const normalized = aliasMap[raw] || raw;
    const hit = this.agreementDefaults.find((item) => item.type === normalized);
    if (!hit) throw new NotFoundException('协议不存在');
    return hit;
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
      enable_qrcode_filter: 1,
      qrcode_replace_image_url: "",
      qrcode_whitelist_user_ids: [],
      enable_ai_qrcode_fallback: 1,
      ai_review_failure_to_manual: 1,
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
      max_comments: 0,
      comment_length_limit: 500,
      allow_anonymous_comments: 0,
      allow_author_pin_comment: 0,
      allow_manager_delete_comment: 1,
      comment_approval_type: "none",
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
      enable_comment_qrcode_filter: 1,
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
      "enable_ai_qrcode_fallback",
      "ai_review_failure_to_manual",
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
  private formatUserCoupon(receive: any) {
    const coupon = receive?.coupon || receive;
    const value = Number(coupon?.value || 0);
    const minAmount = Number(coupon?.minAmount || 0);
    const businessScope = String(coupon?.businessScope || 'all').toLowerCase();
    const modules = businessScope === 'all'
      ? ['takeout', 'shop', 'mall', 'errand', 'activity', 'membership']
      : businessScope === 'shop'
        ? ['takeout', 'shop']
        : [businessScope];
    return {
      id: receive?.coupon ? receive.id : coupon.id,
      receive_id: receive?.coupon ? receive.id : null,
      coupon_id: coupon.id,
      title: coupon.name,
      coupon_name: coupon.name,
      name: coupon.name,
      type: coupon.type,
      amount: value,
      discount_amount: value,
      min_order_amount: minAmount,
      minAmount,
      valid_from: coupon.startAt,
      valid_to: coupon.endAt,
      startAt: coupon.startAt,
      endAt: coupon.endAt,
      status: receive?.status || coupon.status,
      user_coupon_status: receive?.status || coupon.status,
      coupon_status: coupon.status,
      description: coupon.description,
      region_id: coupon.regionId,
      regionId: coupon.regionId,
      merchant_id: coupon.merchantId,
      merchantId: coupon.merchantId,
      business_scope: businessScope,
      businessScope,
      is_universal: !coupon.merchantId,
      applicable_modules: modules,
      coupon,
    };
  }

  private formatAvailableCoupon(coupon: any, userClaimedCount = 0, userDailyClaimedCount = 0) {
    const base = this.formatUserCoupon(coupon);
    const totalCount = Number(coupon?.totalCount || 0);
    const receivedCount = Number(coupon?.receivedCount || 0);
    const limitPerUser = Number(coupon?.limitPerUser || 1);
    const remaining = Math.max(0, totalCount - receivedCount);
    const now = new Date();
    const started = !coupon?.startAt || now >= coupon.startAt;
    const notEnded = !coupon?.endAt || now <= coupon.endAt;
    const active = coupon?.status === 'active';
    const canClaim = active && started && notEnded && remaining > 0 && userClaimedCount < limitPerUser;
    return {
      ...base,
      id: coupon.id,
      receive_id: null,
      claim_start: coupon.startAt,
      claim_end: coupon.endAt,
      start_time: coupon.startAt,
      end_time: coupon.endAt,
      total_quantity: totalCount,
      remaining_quantity: remaining,
      max_per_user: limitPerUser,
      daily_limit_per_user: 0,
      user_claimed_count: userClaimedCount,
      user_daily_claimed_count: userDailyClaimedCount,
      is_claimed: userClaimedCount > 0,
      can_claim: canClaim,
      coupon_status: canClaim ? '可领取' : userClaimedCount >= limitPerUser ? '已领取' : base.coupon_status,
    };
  }

  async getAvailableCoupons(userId: string, query: any) {
    const { region_id, module: moduleType, page = 1, limit = 10 } = query;
    const regionId = String(region_id || query?.regionId || '').trim();
    if (!regionId) {
      return {
        list: [],
        total: 0,
        page: Number(page),
        pageSize: Number(limit),
        pagination: {
          total: 0,
          current_page: Number(page),
          per_page: Number(limit),
          total_pages: 1,
        },
      };
    }
    const where: any = {
      status: 'pending',
      endAt: { gte: new Date() },
    };
    where.OR = [{ regionId: null }, { regionId }];
    const scopeMap: Record<string, string[]> = {
      errand: ['all', 'errand'],
      running: ['all', 'errand'],
      shop: ['all', 'shop'],
      takeout: ['all', 'shop'],
      takeaway: ['all', 'shop'],
      mall: ['all', 'mall'],
      activity: ['all', 'activity'],
      membership: ['all', 'membership'],
    };
    const scopes = scopeMap[String(moduleType || '').toLowerCase()];
    if (scopes?.length) where.businessScope = { in: scopes };
    if (moduleType === 'mall') where.merchantId = null;
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    const couponIds = rows.map((coupon) => coupon.id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [claimGroups, dailyGroups] = couponIds.length
      ? await Promise.all([
          this.prisma.couponReceive.groupBy({
            by: ['couponId'],
            where: { userId, couponId: { in: couponIds } },
            _count: { _all: true },
          }),
          this.prisma.couponReceive.groupBy({
            by: ['couponId'],
            where: { userId, couponId: { in: couponIds }, createdAt: { gte: todayStart } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const claimedMap = new Map((claimGroups as any[]).map((item) => [item.couponId, item._count?._all || 0]));
    const dailyClaimedMap = new Map((dailyGroups as any[]).map((item) => [item.couponId, item._count?._all || 0]));
    return {
      list: rows.map((coupon) => this.formatAvailableCoupon(coupon, claimedMap.get(coupon.id) || 0, dailyClaimedMap.get(coupon.id) || 0)),
      total,
      page: Number(page),
      pageSize: Number(limit),
      pagination: {
        total,
        current_page: Number(page),
        per_page: Number(limit),
        total_pages: Math.max(1, Math.ceil(total / Number(limit || 10))),
      },
    };
  }

  async claimCoupon(id: string, userId: string, dto: any = {}) {
    const regionId = String(dto?.region_id || dto?.regionId || '').trim();
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '领取优惠券');
    return this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { id } });
      if (!coupon || coupon.status !== 'active') throw new BadRequestException('优惠券不存在或已失效');
      if (coupon.regionId && !regionId) throw new BadRequestException('请先选择区域');
      if (coupon.regionId && coupon.regionId !== regionId) throw new BadRequestException('优惠券不属于当前区域');
      const now = new Date();
      if (coupon.startAt && now < coupon.startAt) throw new BadRequestException('优惠券领取未开始');
      if (coupon.endAt && now > coupon.endAt) throw new BadRequestException('优惠券已过期');
      if (coupon.receivedCount >= coupon.totalCount) throw new BadRequestException('优惠券已领完');
      const owned = await tx.couponReceive.count({ where: { couponId: id, userId } });
      if (owned >= coupon.limitPerUser) throw new BadRequestException('已达到领取上限');
      const receive = await tx.couponReceive.create({ data: { couponId: id, userId }, include: { coupon: true } });
      await tx.coupon.update({ where: { id }, data: { receivedCount: { increment: 1 } } });
      return this.formatUserCoupon(receive);
    });
  }

  async getMyCoupons(userId: string, query: any) {
    const { status = 'unused', module: moduleType, page = 1, limit = 10 } = query;
    const where: any = { userId };
    if (status) where.status = status;
    const couponWhere: any = {};
    const scopeMap: Record<string, string[]> = {
      errand: ['all', 'errand'],
      running: ['all', 'errand'],
      shop: ['all', 'shop'],
      takeout: ['all', 'shop'],
      takeaway: ['all', 'shop'],
      mall: ['all', 'mall'],
      activity: ['all', 'activity'],
      membership: ['all', 'membership'],
    };
    const scopes = scopeMap[String(moduleType || '').toLowerCase()];
    if (scopes?.length) couponWhere.businessScope = { in: scopes };
    if (moduleType === 'mall') couponWhere.merchantId = null;
    const [rows, total] = await Promise.all([
      this.prisma.couponReceive.findMany({
        where: Object.keys(couponWhere).length ? { ...where, coupon: couponWhere } : where,
        include: { coupon: true },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.couponReceive.count({
        where: Object.keys(couponWhere).length ? { ...where, coupon: couponWhere } : where,
      }),
    ]);
    return {
      list: rows.map((receive) => this.formatUserCoupon(receive)),
      total,
      page: Number(page),
      pageSize: Number(limit),
      pagination: {
        total,
        current_page: Number(page),
        per_page: Number(limit),
        total_pages: Math.max(1, Math.ceil(total / Number(limit || 10))),
      },
    };
  }

  async redeemCoupon(userId: string, dto: any, ip = '') {
    const code = String(dto?.code || '').trim().toUpperCase();
    const regionId = String(dto?.region_id || dto?.regionId || '').trim();
    if (!code) throw new BadRequestException('请输入兑换码');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '兑换卡券');
    return this.prisma.$transaction(async (tx) => {
      const redeemCode = await tx.couponRedeemCode.findUnique({
        where: { code },
        include: { coupon: true },
      });
      if (!redeemCode || redeemCode.status !== 'active') throw new BadRequestException('兑换码不存在或已失效');
      const now = new Date();
      if (redeemCode.startAt && now < redeemCode.startAt) throw new BadRequestException('兑换码尚未生效');
      if (redeemCode.endAt && now > redeemCode.endAt) throw new BadRequestException('兑换码已过期');
      if (redeemCode.regionId && !regionId) throw new BadRequestException('请先选择区域');
      if (redeemCode.regionId && redeemCode.regionId !== regionId) throw new BadRequestException('兑换码不属于当前区域');
      if (redeemCode.usedCount >= redeemCode.totalLimit) throw new BadRequestException('兑换码已被使用完');
      const userRedeemedCount = await tx.couponRedeemRecord.count({ where: { redeemCodeId: redeemCode.id, userId } });
      if (userRedeemedCount >= redeemCode.perUserLimit) throw new BadRequestException('您已兑换过该兑换码');

      const coupon = redeemCode.coupon;
      if (!coupon || coupon.status !== 'active') throw new BadRequestException('优惠券不存在或已失效');
      if (coupon.regionId && !regionId) throw new BadRequestException('请先选择区域');
      if (coupon.regionId && coupon.regionId !== regionId) throw new BadRequestException('优惠券不属于当前区域');
      if (coupon.startAt && now < coupon.startAt) throw new BadRequestException('优惠券领取未开始');
      if (coupon.endAt && now > coupon.endAt) throw new BadRequestException('优惠券已过期');
      if (coupon.receivedCount >= coupon.totalCount) throw new BadRequestException('优惠券已领完');
      const owned = await tx.couponReceive.count({ where: { couponId: coupon.id, userId } });
      if (owned >= coupon.limitPerUser) throw new BadRequestException('已达到领取上限');

      const receive = await tx.couponReceive.create({ data: { couponId: coupon.id, userId }, include: { coupon: true } });
      await tx.coupon.update({ where: { id: coupon.id }, data: { receivedCount: { increment: 1 } } });
      await tx.couponRedeemCode.update({ where: { id: redeemCode.id }, data: { usedCount: { increment: 1 } } });
      await tx.couponRedeemRecord.create({
        data: {
          redeemCodeId: redeemCode.id,
          couponId: coupon.id,
          userId,
          receiveId: receive.id,
          ip: String(ip || '').slice(0, 120) || null,
        },
      });
      return this.formatUserCoupon(receive);
    });
  }

  async getRuntimePopups(query: any) {
    const regionId = String(query?.region_id || query?.regionId || '').trim();
    if (!regionId) {
      return { list: [], popup: null };
    }
    const now = new Date();
    const where: any = {
      position: 'popup',
      status: 1,
      regionId,
      AND: [
        { OR: [{ startTime: null }, { startTime: { lte: now } }] },
        { OR: [{ endTime: null }, { endTime: { gte: now } }] },
      ],
    };
    const rows = await this.prisma.advertisement.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(Number(query?.limit || 3), 1), 10),
    });
    const list = rows.map((item: any) => {
      const image = this.publicUploadUrl(item.image);
      return {
        id: item.id,
        title: item.name,
        name: item.name,
        image,
        image_url: image,
        link_type: item.linkType || 'none',
        linkType: item.linkType || 'none',
        link_value: item.linkValue || '',
        linkValue: item.linkValue || '',
        region_id: item.regionId || '',
        priority: item.priority || 0,
        start_time: item.startTime,
        end_time: item.endTime,
      };
    });
    return { list, popup: list[0] || null };
  }

  async trackRuntimePopup(id: string, dto: any = {}) {
    const popupId = String(id || dto?.id || '').trim();
    if (!popupId) throw new BadRequestException('弹窗ID不能为空');
    const action = String(dto?.action || dto?.type || 'view').trim().toLowerCase();
    const data = action === 'click'
      ? { clickCount: { increment: 1 } }
      : { viewCount: { increment: 1 } };
    await this.prisma.advertisement.update({ where: { id: popupId }, data }).catch(() => null);
    return { success: true };
  }

  // ========== 二手 ==========
  private getSecondHandRegionDefaults(regionId = '') {
    return {
      regionId,
      enableSecondHand: true,
      maxListings: null as number | null,
      requirePhone: false,
      requireAudit: false,
      enableOnlinePayment: false,
      enableAfterSale: false,
      enablePlatformGuarantee: false,
      enableAutoRecommend: false,
    };
  }

  private mergeSecondHandRegionSetting(setting: any, regionId = '') {
    const defaults = this.getSecondHandRegionDefaults(regionId);
    const source = setting || {};
    return {
      ...defaults,
      ...source,
      regionId: source.regionId || regionId,
      enableSecondHand: source.enableSecondHand ?? defaults.enableSecondHand,
      maxListings: source.maxListings ?? defaults.maxListings,
      requirePhone: source.requirePhone ?? defaults.requirePhone,
      requireAudit: source.requireAudit ?? defaults.requireAudit,
      enableOnlinePayment: source.enableOnlinePayment ?? defaults.enableOnlinePayment,
      enableAfterSale: source.enableAfterSale ?? defaults.enableAfterSale,
      enablePlatformGuarantee: source.enablePlatformGuarantee ?? defaults.enablePlatformGuarantee,
      enableAutoRecommend: source.enableAutoRecommend ?? defaults.enableAutoRecommend,
    };
  }

  private async loadSecondHandRegionSetting(regionId?: string | null) {
    const normalizedRegionId = String(regionId || '').trim();
    if (!normalizedRegionId) return this.getSecondHandRegionDefaults();
    const setting = await this.prisma.secondHandRegionSetting.findUnique({ where: { regionId: normalizedRegionId } });
    return this.mergeSecondHandRegionSetting(setting, normalizedRegionId);
  }

  private getPaging(query: any) {
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query?.pageSize || query?.limit || 10)));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private textValue(value: any, fallback = '') {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || fallback;
  }

  private moneyValue(value: any, fallback = 0) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : fallback;
  }

  private nullableMoneyValue(value: any) {
    if (value === undefined || value === null || value === '') return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount;
  }

  private jsonArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object' && Array.isArray(value.list)) return value.list.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
        if (parsed && Array.isArray(parsed.list)) return parsed.list.filter(Boolean);
      } catch {
        return value ? [value] : [];
      }
    }
    return [];
  }

  private jsonObject(value: any) {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return typeof value === 'object' ? value : null;
  }

  private requiresSecondHandLocation(deliveryType: string) {
    return ['校内交易', '买家自提'].includes(String(deliveryType || '').trim());
  }

  private hasSecondHandLocation(location: any) {
    const data = this.jsonObject(location);
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0;
  }

  private normalizeSecondHandStatusText(status: string) {
    const map: Record<string, string> = {
      PENDING: '待审核',
      ON_SALE: '在售',
      SOLD: '已售出',
      OFFLINE: '已下架',
      REJECTED: '未通过',
    };
    return map[status] || status || '未知';
  }

  private normalizeSecondHandOrderStatusText(status: string) {
    const map: Record<string, string> = {
      contacting: '沟通中',
      pending_pay: '待支付',
      paid: '已支付',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
      refunding: '退款中',
      refunded: '已退款',
    };
    return map[status] || status || '未知';
  }

  private async detectSecondHandPublishRisk(payload: { title?: string; description?: string; images?: any[] }) {
    const text = `${payload.title || ''} ${payload.description || ''}`;
    const reasons: string[] = [];
    if (/1[3-9]\d{9}|微信|vx|v信|QQ|qq|二维码|扫码|加我|私加|私聊详谈/i.test(text)) {
      reasons.push('内容疑似包含联系方式、二维码或站外引流');
    }
    if (!payload.images?.length) reasons.push('未上传商品图片');
    try {
      const words = await this.prisma.sensitiveWord.findMany({
        where: { status: 1 },
        select: { word: true, category: true, level: true },
        take: 1000,
      });
      const hits = words
        .filter((item) => item.word && text.includes(item.word))
        .slice(0, 5)
        .map((item) => item.word);
      if (hits.length) reasons.push(`命中敏感词：${hits.join('、')}`);
    } catch {
      // 风险词检查失败不阻断发布，避免配置表异常导致用户完全不能发布。
    }
    return {
      hasRisk: reasons.length > 0,
      reason: reasons.join('；'),
    };
  }

  private async writeSecondHandAuditRecord(item: any, status: string, reason = '', reviewerId?: string | null) {
    try {
      await this.prisma.auditRecord.create({
        data: {
          targetType: 'second_hand',
          targetId: item.id,
          targetTitle: item.title || item.description || '二手商品',
          submitterId: item.userId || null,
          reviewerId: reviewerId || null,
          status: status === 'ON_SALE' || status === 'SOLD' ? 'approved' : status === 'PENDING' ? 'pending' : 'rejected',
          reason: reason || this.normalizeSecondHandStatusText(status),
          reviewedAt: status === 'PENDING' ? null : new Date(),
        },
      });
    } catch {
      // 审核记录是运营辅助信息，不能影响用户主流程。
    }
  }

  private async syncSecondHandToFeed(item: any, images: string[], setting: any) {
    try {
      const location = this.jsonObject(item.location);
      const content = [
        `【二手闲置】${item.description || item.title}`,
        `价格：¥${this.moneyValue(item.price).toFixed(2)}`,
        `交易方式：${item.deliveryType || '线下交易'}`,
      ].join('\n');
      await this.prisma.post.create({
        data: {
          userId: item.userId,
          regionId: item.regionId,
          type: images.length ? 'IMAGE' as any : 'TEXT' as any,
          status: item.status === 'ON_SALE' ? 'PUBLISHED' as any : 'PENDING' as any,
          title: item.title,
          content,
          location: location?.name || location?.address || null,
          latitude: location?.latitude ? Number(location.latitude) : null,
          longitude: location?.longitude ? Number(location.longitude) : null,
          auditStatus: item.status === 'ON_SALE' ? 'approved' : 'pending',
          auditReason: item.status === 'ON_SALE' ? '二手闲置同步动态' : (item.auditReason || '二手闲置待审核'),
          media: images.length
            ? { createMany: { data: images.map((url, index) => ({ type: 'IMAGE' as any, url, sortOrder: index })) } }
            : undefined,
        },
      });
    } catch {
      // 同步动态失败不回滚闲置发布，后台仍可通过商品本体管理。
    }
  }

  private mapSecondHandProduct(item: any, setting?: any) {
    const currentSetting = this.mergeSecondHandRegionSetting(setting, item?.regionId || '');
    const images = this.jsonArray(item?.images);
    const tags = this.jsonArray(item?.tags);
    const location = this.jsonObject(item?.location) || { latitude: 0, longitude: 0 };
    const price = this.moneyValue(item?.price);
    const originPrice = item?.originPrice === undefined || item?.originPrice === null ? null : this.moneyValue(item.originPrice);
    const user = item?.user || {};
    return {
      ...item,
      images,
      tags,
      location,
      price,
      originPrice,
      originalPrice: originPrice,
      currentPrice: price,
      current_price: price,
      original_price: originPrice,
      freight: this.moneyValue(item?.freight),
      deliveryType: item?.deliveryType || '线下交易',
      delivery_type: item?.deliveryType || '线下交易',
      sellerId: item?.userId,
      seller_id: item?.userId,
      user_id: item?.userId,
      nickname: user.nickname || '匿名用户',
      avatar: user.avatar || '/static/logo.jpg',
      uid: user.uid,
      region_name: item?.region?.name || '',
      view_count: item?.viewCount || 0,
      wantCount: item?.wantCount || 0,
      want_count: item?.wantCount || 0,
      isSold: item?.status === 'SOLD',
      is_sold: item?.status === 'SOLD',
      status_text: this.normalizeSecondHandStatusText(item?.status),
      audit_reason: item?.auditReason || '',
      enableOnlinePayment: !!currentSetting.enableOnlinePayment,
      enable_online_payment: !!currentSetting.enableOnlinePayment,
      enableAfterSale: !!currentSetting.enableAfterSale,
      enable_after_sale: !!currentSetting.enableAfterSale,
      enablePlatformGuarantee: !!currentSetting.enablePlatformGuarantee,
      enable_platform_guarantee: !!currentSetting.enablePlatformGuarantee,
    };
  }

  async getSecondHandByArea(areaId: string, query: any) {
    const regionId = this.textValue(areaId);
    const setting = await this.loadSecondHandRegionSetting(regionId);
    const { page, pageSize, skip } = this.getPaging(query);
    if (!setting.enableSecondHand) {
      return { data: [], list: [], total: 0, page, pageSize, config: setting };
    }
    const where: any = { regionId, status: 'ON_SALE' };
    const [rows, total] = await Promise.all([
      this.prisma.secondHand.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ wantCount: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true } },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.secondHand.count({ where }),
    ]);
    const list = rows.map((item) => this.mapSecondHandProduct(item, setting));
    return { data: list, list, total, page, pageSize, config: setting };
  }

  async createSecondHand(userId: string, dto: any) {
    const regionId = this.textValue(dto?.regionId || dto?.region_id || dto?.area_id || dto?.areaId);
    if (!regionId) throw new BadRequestException('请选择发布区域');
    const region = await this.prisma.region.findUnique({ where: { id: regionId }, select: { id: true } });
    if (!region) throw new BadRequestException('发布区域不存在');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '发布二手闲置');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true } });
    if (!user) throw new BadRequestException('用户不存在');

    const setting = await this.loadSecondHandRegionSetting(regionId);
    if (!setting.enableSecondHand) throw new ForbiddenException('当前区域暂未开放二手交易');
    if (setting.requirePhone && !user.phone) throw new BadRequestException('发布二手闲置前需要先绑定手机号');

    const memberPublishExtra = await this.getMemberNumericBenefit(userId, 'second_hand_publish_limit');
    if (setting.maxListings) {
      const maxListings = Number(setting.maxListings) + memberPublishExtra;
      const activeCount = await this.prisma.secondHand.count({
        where: { userId, regionId, status: { in: ['PENDING', 'ON_SALE'] as any } },
      });
      if (activeCount >= maxListings) {
        throw new BadRequestException(`当前区域最多可发布 ${maxListings} 个在架闲置`);
      }
    }

    const description = this.textValue(dto?.description || dto?.content);
    if (!description) throw new BadRequestException('请填写商品描述');
    const images = this.jsonArray(dto?.images);
    if (!images.length) throw new BadRequestException('请至少上传一张商品图片');
    const price = this.moneyValue(dto?.price ?? dto?.current_price ?? dto?.currentPrice);
    if (price <= 0) throw new BadRequestException('商品价格必须大于 0');
    const title = this.textValue(dto?.title, description.slice(0, 24) || '二手闲置');
    const originPriceInput = dto?.originPrice ?? dto?.original_price ?? dto?.originalPrice;
    const originPrice = this.nullableMoneyValue(originPriceInput);
    const deliveryType = this.textValue(dto?.deliveryType || dto?.delivery_type || dto?.delivery, '校内交易');
    const location = this.jsonObject(dto?.location);
    if (this.requiresSecondHandLocation(deliveryType) && !this.hasSecondHandLocation(location)) {
      throw new BadRequestException(`${deliveryType}需要选择交易位置`);
    }
    const risk = await this.detectSecondHandPublishRisk({ title, description, images });
    const hasAuditPriority = await this.hasMemberBenefit(userId, 'content_audit_priority');
    const status = setting.requireAudit || risk.hasRisk ? 'PENDING' : 'ON_SALE';
    const auditReason = risk.hasRisk ? risk.reason : setting.requireAudit ? '等待后台审核' : null;

    const item = await this.prisma.secondHand.create({
      data: {
        userId,
        regionId,
        title,
        description,
        images,
        price,
        originPrice,
        category: this.textValue(dto?.category, '闲置'),
        condition: this.textValue(dto?.condition, 'good'),
        status: status as any,
        auditReason,
        deliveryType,
        tags: this.jsonArray(dto?.tags),
        location,
        freight: deliveryType === '运费到付' ? this.moneyValue(dto?.freight) : 0,
        wantCount: (await this.hasMemberBenefit(userId, 'second_hand_exposure_boost')) ? 1 : 0,
      },
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true } },
        region: { select: { id: true, name: true } },
      },
    });
    if (status === 'PENDING') {
      await this.writeSecondHandAuditRecord(item, status, hasAuditPriority ? '会员优先审核：' + (auditReason || '等待后台审核') : auditReason || '等待后台审核');
    }
    if (dto?.sync_to_feed || dto?.syncToFeed) {
      await this.syncSecondHandToFeed(item, images, setting);
    }
    const mapped = this.mapSecondHandProduct(item, setting);
    return {
      success: true,
      message: status === 'PENDING' ? '发布成功，等待后台审核' : '发布成功',
      data: mapped,
      ...mapped,
    };
  }

  async getSecondHandDetail(id: string, userId?: string) {
    const item = await this.prisma.secondHand.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true } },
        region: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('商品不存在');

    // AUD-P1-153: 非在售商品仅允许商品本人查看，其他用户无法通过 ID 打开待审/驳回/下架商品
    if (item.status !== 'ON_SALE' && item.userId !== userId) {
      throw new NotFoundException('商品不存在');
    }

    if (item.status === 'ON_SALE') {
      await this.prisma.secondHand.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => null);
      item.viewCount += 1;
    }
    const setting = await this.loadSecondHandRegionSetting(item.regionId);
    return this.mapSecondHandProduct(item, setting);
  }

  async createSecondHandOrder(userId: string, dto: any) {
    const productId = this.textValue(dto?.productId || dto?.product_id);
    if (!productId) throw new BadRequestException('缺少商品ID');
    const product = await this.prisma.secondHand.findUnique({
      where: { id: productId },
      include: { user: { select: { id: true, nickname: true } } },
    });
    if (!product) throw new NotFoundException('商品不存在');
    if (product.status !== 'ON_SALE') throw new BadRequestException('该商品当前不能交易');
    if (product.userId === userId) throw new BadRequestException('不能购买自己发布的商品');
    await this.userAccess.assertStudentProtectedAction(userId, product.regionId, '购买二手闲置');

    const setting = await this.loadSecondHandRegionSetting(product.regionId);
    if (!setting.enableSecondHand) throw new ForbiddenException('当前区域暂未开放二手交易');

    const activeOrder = await this.prisma.secondHandOrder.findFirst({
      where: {
        buyerId: userId,
        productId,
        status: { in: ['contacting', 'pending_pay', 'paid', 'shipped'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    // AUD-P1-157: pending_pay 状态的旧单支付未初始化成功，取消后允许重新下单
    if (activeOrder) {
      if (activeOrder.status === 'pending_pay') {
        // 支付从未成功初始化，取消旧单，让后续逻辑创建新单
        await this.prisma.secondHandOrder.update({
          where: { id: activeOrder.id },
          data: { status: 'cancelled' },
        });
      } else {
        return {
          success: true,
          message: activeOrder.status === 'contacting'
            ? '已记录过购买意向，可继续私信卖家沟通'
            : '已有进行中的交易，请到我的闲置查看',
          contactRequired: activeOrder.status === 'contacting',
          paymentInfo: null,
          order: activeOrder,
          duplicated: true,
        };
      }
    }

    const allowOnlinePayment = !!setting.enableOnlinePayment && product.deliveryType === '包邮';
    const status = allowOnlinePayment ? 'pending_pay' : 'contacting';
    const order = await this.prisma.secondHandOrder.create({
      data: {
        orderNo: `SH${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        buyerId: userId,
        userId,
        sellerId: product.userId,
        productId,
        price: product.price,
        status,
        shippingAddress: this.jsonObject(dto?.shippingAddress || dto?.shipping_address),
        remark: this.textValue(dto?.remark),
      },
    });

    await this.prisma.secondHand.update({
      where: { id: productId },
      data: { wantCount: { increment: 1 } },
    }).catch(() => null);

    if (!allowOnlinePayment) {
      return {
        success: true,
        message: product.deliveryType === '包邮'
          ? '已记录购买意向，可继续私信卖家沟通'
          : '已记录交易意向，请与卖家确认交易安排',
        contactRequired: true,
        paymentInfo: null,
        order,
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { openid: true } });
    if (!user?.openid) throw new BadRequestException('用户未绑定微信，无法发起支付');
    const paymentInfo = await this.paymentService.wxUnifiedOrder({
      bizType: 'second_hand',
      bizId: order.id,
      orderNo: order.orderNo,
      amount: Number(order.price),
      description: `二手闲置 ${product.title}`,
      openid: user.openid,
      userId,
    });
    return {
      success: true,
      message: '订单已创建，请完成支付',
      contactRequired: false,
      paymentInfo,
      order,
    };
  }

  async getMySecondHandProducts(userId: string, query: any) {
    const { page, pageSize, skip } = this.getPaging(query);
    const status = this.textValue(query?.status);
    const where: any = { userId };
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.secondHand.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true } },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.secondHand.count({ where }),
    ]);
    const productIds = rows.map((item) => item.id);
    const orders = productIds.length
      ? await this.prisma.secondHandOrder.groupBy({
          by: ['productId'],
          where: { productId: { in: productIds } },
          _count: { _all: true },
        })
      : [];
    const orderMap = new Map(orders.map((item) => [item.productId, item._count._all]));
    const list = rows.map((item) => ({
      ...this.mapSecondHandProduct(item),
      order_count: orderMap.get(item.id) || 0,
      orderCount: orderMap.get(item.id) || 0,
    }));
    return { list, data: list, total, page, pageSize };
  }

  async updateMySecondHandProduct(id: string, userId: string, dto: any) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    if (item.userId !== userId) throw new ForbiddenException('只能修改自己发布的闲置');
    if (item.status === 'SOLD') throw new BadRequestException('已售出的商品不能修改');
    await this.userAccess.assertStudentProtectedAction(userId, item.regionId, '修改二手闲置');

    const setting = await this.loadSecondHandRegionSetting(item.regionId);
    const description = dto?.description !== undefined ? this.textValue(dto.description || dto.content) : item.description || '';
    if (!description) throw new BadRequestException('请填写商品描述');
    const images = dto?.images !== undefined ? this.jsonArray(dto.images) : this.jsonArray(item.images);
    if (!images.length) throw new BadRequestException('请至少上传一张商品图片');
    const title = dto?.title !== undefined ? this.textValue(dto.title, description.slice(0, 24) || item.title) : item.title;
    const price = dto?.price !== undefined || dto?.current_price !== undefined || dto?.currentPrice !== undefined
      ? this.moneyValue(dto?.price ?? dto?.current_price ?? dto?.currentPrice)
      : this.moneyValue(item.price);
    if (price <= 0) throw new BadRequestException('商品价格必须大于 0');
    const originPriceInput = dto?.originPrice ?? dto?.original_price ?? dto?.originalPrice;
    const originPrice = originPriceInput !== undefined ? this.nullableMoneyValue(originPriceInput) : item.originPrice;
    const deliveryType = dto?.deliveryType !== undefined || dto?.delivery_type !== undefined
      ? this.textValue(dto?.deliveryType || dto?.delivery_type || dto?.delivery, item.deliveryType)
      : item.deliveryType;
    const location = dto?.location !== undefined ? this.jsonObject(dto.location) : item.location;
    if (this.requiresSecondHandLocation(deliveryType) && !this.hasSecondHandLocation(location)) {
      throw new BadRequestException(`${deliveryType}需要选择交易位置`);
    }
    const risk = await this.detectSecondHandPublishRisk({ title, description, images });
    const status = setting.requireAudit || risk.hasRisk ? 'PENDING' : 'ON_SALE';
    const auditReason = risk.hasRisk ? risk.reason : setting.requireAudit ? '修改后等待后台审核' : null;

    const updated = await this.prisma.secondHand.update({
      where: { id },
      data: {
        title,
        description,
        images,
        price,
        originPrice,
        category: dto?.category !== undefined ? this.textValue(dto.category, item.category) : item.category,
        condition: dto?.condition !== undefined ? this.textValue(dto.condition, item.condition) : item.condition,
        status: status as any,
        auditReason,
        deliveryType,
        tags: dto?.tags !== undefined ? this.jsonArray(dto.tags) : item.tags,
        location,
        freight: deliveryType === '运费到付' ? this.moneyValue(dto?.freight ?? item.freight) : 0,
      } as any,
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true } },
        region: { select: { id: true, name: true } },
      },
    });
    await this.writeSecondHandAuditRecord(updated, status, auditReason || (status === 'ON_SALE' ? '用户修改后自动通过' : '修改后待审核'));
    const mapped = this.mapSecondHandProduct(updated, setting);
    return { success: true, message: status === 'PENDING' ? '修改成功，等待后台审核' : '修改成功，已重新上架', data: mapped, ...mapped };
  }

  async updateMySecondHandProductStatus(id: string, userId: string, dto: any) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    if (item.userId !== userId) throw new ForbiddenException('只能处理自己发布的闲置');
    const action = this.textValue(dto?.action || dto?.status).toLowerCase();
    let status = '';
    let reason = this.textValue(dto?.reason);
    if (['refresh', '刷新'].includes(action)) {
      const refreshed = await this.prisma.$transaction(async (tx) => {
        await this.membershipService.consumeBenefitWithDb(userId, 'second_hand_refresh_quota', {
          targetType: 'second_hand',
          targetId: id,
          metadata: { action: 'refresh' },
        }, tx);
        return tx.secondHand.update({
          where: { id },
          data: { createdAt: new Date(), wantCount: { increment: 1 } } as any,
          include: {
            user: { select: { id: true, uid: true, nickname: true, avatar: true } },
            region: { select: { id: true, name: true } },
          },
        });
      });
      return { success: true, message: '已使用会员刷新权益', data: this.mapSecondHandProduct(refreshed) };
    }
    if (['offline', 'off', '下架'].includes(action)) {
      status = 'OFFLINE';
      reason ||= '卖家主动下架';
    } else if (['relist', 'online', 'onsale', '上架'].includes(action)) {
      const setting = await this.loadSecondHandRegionSetting(item.regionId);
      const risk = await this.detectSecondHandPublishRisk({ title: item.title, description: item.description || '', images: this.jsonArray(item.images) });
      status = setting.requireAudit || risk.hasRisk ? 'PENDING' : 'ON_SALE';
      reason = risk.hasRisk ? risk.reason : setting.requireAudit ? '重新上架等待后台审核' : '卖家重新上架';
    } else if (['sold', 'complete', '已售出'].includes(action)) {
      status = 'SOLD';
      reason ||= '卖家标记已售出';
    } else if (['delete', 'remove', '删除'].includes(action)) {
      status = 'OFFLINE';
      reason ||= '卖家删除/隐藏';
    } else {
      throw new BadRequestException('不支持的商品操作');
    }
    const updated = await this.prisma.secondHand.update({
      where: { id },
      data: { status: status as any, auditReason: reason || null },
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true } },
        region: { select: { id: true, name: true } },
      },
    });
    await this.writeSecondHandAuditRecord(updated, status, reason);
    return { success: true, message: '操作成功', data: this.mapSecondHandProduct(updated) };
  }

  async getMySecondHandOrders(userId: string, query: any) {
    const { page, pageSize, skip } = this.getPaging(query);
    const role = this.textValue(query?.role, 'all');
    const status = this.textValue(query?.status);
    const where: any = {};
    if (role === 'buyer') where.buyerId = userId;
    else if (role === 'seller') where.sellerId = userId;
    else where.OR = [{ buyerId: userId }, { sellerId: userId }];
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.secondHandOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.secondHandOrder.count({ where }),
    ]);
    const userIds = Array.from(new Set(rows.flatMap((order) => [order.buyerId, order.sellerId]).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((order) => order.productId).filter(Boolean)));
    const [users, products] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, uid: true, nickname: true, avatar: true } }) : [],
      productIds.length ? this.prisma.secondHand.findMany({ where: { id: { in: productIds } }, include: { region: { select: { id: true, name: true } } } }) : [],
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const list = rows.map((order) => {
      const product = productMap.get(order.productId);
      return {
        ...order,
        price: this.moneyValue(order.price),
        status_text: this.normalizeSecondHandOrderStatusText(order.status),
        role: order.buyerId === userId ? 'buyer' : 'seller',
        buyer: userMap.get(order.buyerId) || null,
        seller: userMap.get(order.sellerId) || null,
        product: product ? this.mapSecondHandProduct(product) : null,
        shippingAddress: this.jsonObject(order.shippingAddress),
      };
    });
    return { list, data: list, total, page, pageSize };
  }

  async updateSecondHandOrderStatus(id: string, userId: string, dto: any) {
    const order = await this.prisma.secondHandOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenException('无权处理该订单');
    const action = this.textValue(dto?.action || dto?.status).toLowerCase();
    let status = '';
    if (['cancel', 'cancelled', '取消'].includes(action)) {
      if (!['contacting', 'pending_pay'].includes(order.status)) throw new BadRequestException('当前订单不能直接取消，请联系运营处理');
      status = 'cancelled';
    } else if (['ship', 'shipped', '发货'].includes(action)) {
      if (order.sellerId !== userId) throw new ForbiddenException('只有卖家可以标记发货');
      if (!['paid'].includes(order.status)) throw new BadRequestException('只有已支付订单可以标记发货');
      status = 'shipped';
    } else if (['complete', 'completed', '完成'].includes(action)) {
      if (order.status === 'contacting' && order.sellerId !== userId) {
        throw new ForbiddenException('只有卖家可以确认线下交易完成');
      }
      if (order.status === 'paid') {
        throw new BadRequestException('已支付订单需先由卖家标记发货');
      }
      if (order.status === 'shipped' && order.buyerId !== userId) {
        throw new ForbiddenException('只有买家可以确认收货完成');
      }
      if (!['contacting', 'shipped'].includes(order.status)) throw new BadRequestException('当前订单不能完成');
      status = 'completed';
    } else {
      throw new BadRequestException('不支持的订单操作');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.secondHandOrder.update({
        where: { id },
        data: { status, remark: this.textValue(dto?.remark, order.remark || '') },
      });
      if (status === 'completed') {
        await tx.secondHand.update({ where: { id: order.productId }, data: { status: 'SOLD' } }).catch(() => null);
      }
      if (status === 'cancelled' && order.status === 'pending_pay') {
        await tx.paymentOrder.updateMany({
          where: { bizType: 'second_hand', bizId: order.id, status: { in: ['pending', 'paying'] } },
          data: { status: 'closed' },
        });
      }
      return next;
    });
    return { success: true, message: '操作成功', data: { ...updated, status_text: this.normalizeSecondHandOrderStatusText(updated.status) } };
  }

  async reportSecondHandProduct(id: string, userId: string, dto: any) {
    const product = await this.prisma.secondHand.findUnique({ where: { id }, select: { id: true, userId: true, title: true, description: true } });
    if (!product) throw new NotFoundException('商品不存在');
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '举报二手闲置');
    if (product.userId === userId) throw new BadRequestException('不能举报自己发布的商品');
    const hasPriority = await this.hasMemberBenefit(userId, 'dispute_priority').catch(() => false);
    const reason = this.textValue(dto?.reason || dto?.report_type, '用户举报');
    const detail = this.textValue(dto?.detail || dto?.content || dto?.description);
    const duplicated = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        targetType: { in: ['second_hand', 'secondHand', 'secondhand'] },
        targetId: id,
        status: { in: ['pending', 'processing'] },
      },
    }).catch(() => null);
    if (duplicated) return { success: true, message: '你已举报过，运营会尽快处理', data: duplicated };
    const report = await this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedId: product.userId,
        targetType: 'second_hand',
        targetId: id,
        reason: hasPriority ? `[会员优先] ${reason}` : reason,
        detail: hasPriority ? `[会员优先纠纷] ${detail}`.trim() : detail,
        images: {
          images: this.jsonArray(dto?.images),
          productTitle: product.title || product.description || '二手商品',
        },
      },
    });
    return { success: true, message: '举报已提交，运营会尽快处理', data: report };
  }

  // ========== 签到 ==========
  private formatDateOnly(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private addDays(dateStr: string, days: number) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    date.setDate(date.getDate() + days);
    return this.formatDateOnly(date);
  }

  private monthRange(month?: string) {
    const base = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : this.formatDateOnly().slice(0, 7);
    const [y, m] = base.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      month: base,
      start: `${base}-01`,
      end: `${base}-${String(last).padStart(2, '0')}`,
    };
  }

  private toNumber(value: any, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toInt(value: any, fallback = 0, min?: number, max?: number) {
    const parsed = Number(value);
    let next = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  }

  private parseJsonObject(value: any) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private parseJsonList(value: any) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
      } catch {}
      return value.split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private normalizeSigninConfig(value: any, regionId: string) {
    const raw = value && typeof value === 'object' ? value : {};
    return {
      regionId,
      enabled: raw.enabled !== false,
      activity_title: raw.activity_title || '今日成长已到账',
      activity_rules: raw.activity_rules || '累计前台在线达到设定时长后，系统自动发放经验值。',
      online_minutes: this.toInt(raw.online_minutes ?? raw.onlineMinutes, 30, 1, 180),
      onlineMinutes: this.toInt(raw.online_minutes ?? raw.onlineMinutes, 30, 1, 180),
      daily_base_exp: this.toInt(raw.daily_base_exp, 5, 0, 1000),
      popup_enabled: raw.popup_enabled !== false,
      popupEnabled: raw.popup_enabled !== false,
      popup_image: typeof (raw.popup_image ?? raw.popupImage) === 'string' ? String(raw.popup_image ?? raw.popupImage).trim().slice(0, 500) : '',
      popupImage: typeof (raw.popup_image ?? raw.popupImage) === 'string' ? String(raw.popup_image ?? raw.popupImage).trim().slice(0, 500) : '',
    };
  }

  private shareRulesText(value: any) {
    const fallback = '邀请好友注册成功后，邀请人和新人都可以获得对应奖励。';
    if (!value) return fallback;
    if (typeof value !== 'string') return String(value || fallback);
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed.inviteRules || parsed.description || fallback;
      }
    } catch {
      // Plain text rules are valid.
    }
    return value;
  }

  private async loadSigninConfig(regionId: string) {
    const regionConfig = await this.prisma.config.findUnique({ where: { key: `sign_config_${regionId}` } }).catch(() => null);
    const globalConfig = regionConfig ? null : await this.prisma.config.findUnique({ where: { key: 'sign_config_global' } }).catch(() => null);
    return this.normalizeSigninConfig((regionConfig || globalConfig)?.value, regionId);
  }

  private calculateConsecutiveDays(dates: string[], anchorDate: string) {
    const set = new Set(dates.filter(Boolean));
    let cursor = anchorDate;
    let count = 0;
    while (set.has(cursor)) {
      count += 1;
      cursor = this.addDays(cursor, -1);
    }
    return count;
  }

  private async grantWalletReward(tx: any, userId: string, amount: number, description: string) {
    if (amount <= 0) return null;
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId, balance: amount, totalIn: amount },
      update: { balance: { increment: amount }, totalIn: { increment: amount } },
    });
    return tx.walletTransaction.create({
      data: {
        userId,
        type: 'REWARD',
        amount,
        balance: wallet.balance,
        description,
        status: 'SUCCESS',
      },
    });
  }

  private normalizeRewardReleaseMode(value: any) {
    const mode = String(value || 'immediate').trim().toLowerCase();
    return ['immediate', 'manual', 'delayed', 'qualified'].includes(mode) ? mode : 'immediate';
  }

  private isStudentApproved(user: any) {
    return user?.studentVerify?.status === 'APPROVED';
  }

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + Math.max(0, hours) * 60 * 60 * 1000);
  }

  private async createPendingShareReward(tx: any, inviteId: string, userId: string, type: 'INVITER' | 'INVITEE', amount: number, reason: string, force = false) {
    if (amount <= 0 && !force) return null;
    return tx.shareReward.create({
      data: { inviteId, userId, type, amount, status: 'PENDING', failedReason: reason },
    });
  }

  private async grantBadgeByName(
    tx: any,
    userId: string,
    name: string,
    condition: string,
    icon = '/static/logo.jpg',
  ) {
    let badge = await tx.badge.findFirst({ where: { name } });
    if (!badge) {
      badge = await tx.badge.create({
        data: {
          name,
          icon,
          description: condition,
          condition,
          isEnabled: true,
          sortOrder: 0,
        },
      });
    } else if (badge.isEnabled === false) {
      badge = await tx.badge.update({ where: { id: badge.id }, data: { isEnabled: true } });
    }
    await tx.userBadge.upsert({
      where: { badgeId_userId: { badgeId: badge.id, userId } },
      create: { badgeId: badge.id, userId },
      update: {},
    });
    return badge;
  }

  async getSigninConfig(regionId: string) {
    return this.loadSigninConfig(regionId);
  }

  async getSigninStatus(regionId: string, userId: string) {
    const config = await this.loadSigninConfig(regionId);
    const today = this.formatDateOnly();
    const [records, session] = await Promise.all([
      this.prisma.punchInRecord.findMany({
        where: { userId, regionId },
        orderBy: { date: 'asc' },
      }),
      this.prisma.onlineSigninSession.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } }),
    ]);
    const dates = records.map((item) => item.date);
    const todaySigned = dates.includes(today);
    const anchor = todaySigned ? today : this.addDays(today, -1);
    const targetSeconds = config.online_minutes * 60;
    const onlineSeconds = Math.min(targetSeconds, this.toInt(session?.accruedSeconds, 0, 0));
    return {
      enabled: config.enabled,
      signin_dates: dates,
      today_signed: todaySigned,
      isSigned: todaySigned,
      current_consecutive_days: this.calculateConsecutiveDays(dates, anchor),
      continuousDays: this.calculateConsecutiveDays(dates, anchor),
      online_minutes: config.online_minutes,
      onlineMinutes: config.online_minutes,
      online_seconds: onlineSeconds,
      onlineSeconds,
      target_seconds: targetSeconds,
      targetSeconds,
      online_progress: targetSeconds ? Math.min(100, Math.round((onlineSeconds / targetSeconds) * 100)) : 0,
      daily_base_exp: config.daily_base_exp,
      dailyBaseExp: config.daily_base_exp,
      completed_at: session?.completedAt || null,
      config,
    };
  }

  async onlineSigninHeartbeat(regionId: string, userId: string, dto: any = {}) {
    const config = await this.loadSigninConfig(regionId);
    if (!config.enabled) throw new BadRequestException('当前区域未开启成长签到');

    const today = this.formatDateOnly();
    const targetSeconds = config.online_minutes * 60;
    const now = new Date();
    const [existingRecord, previousSession] = await Promise.all([
      this.prisma.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } }),
      this.prisma.onlineSigninSession.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } }),
    ]);

    if (existingRecord || previousSession?.completedAt) {
      const status = await this.getSigninStatus(regionId, userId);
      return { success: true, newly_completed: false, already_signed: true, status };
    }

    // 服务端以心跳间隔计时；超出 90 秒的空档不累计，后台或伪造累计时长都不能直接领奖。
    const elapsedSeconds = !dto?.resume && previousSession?.lastHeartbeatAt
      ? Math.max(0, Math.min(90, Math.floor((now.getTime() - previousSession.lastHeartbeatAt.getTime()) / 1000)))
      : 0;
    const session = await this.prisma.onlineSigninSession.upsert({
      where: { userId_regionId_date: { userId, regionId, date: today } },
      create: { userId, regionId, date: today, accruedSeconds: 0, lastHeartbeatAt: now },
      update: { accruedSeconds: { increment: elapsedSeconds }, lastHeartbeatAt: now },
    });
    const onlineSeconds = Math.min(targetSeconds, session.accruedSeconds);
    const status = {
      online_minutes: config.online_minutes,
      online_seconds: onlineSeconds,
      target_seconds: targetSeconds,
      online_progress: Math.min(100, Math.round((onlineSeconds / targetSeconds) * 100)),
    };
    if (onlineSeconds < targetSeconds) return { success: true, newly_completed: false, already_signed: false, status };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.punchInRecord.findUnique({ where: { userId_regionId_date: { userId, regionId, date: today } } });
        if (duplicate) return { duplicate, growth: null };
        const record = await tx.punchInRecord.create({
          data: {
            userId,
            regionId,
            date: today,
            rewardValue: 0,
            content: JSON.stringify({
              source: 'online_growth_signin',
              online_minutes: config.online_minutes,
              exp_earned: config.daily_base_exp,
            }),
          },
        });
        const growth = await this.growthService.awardExperience({
          userId,
          regionId,
          amount: config.daily_base_exp,
          reason: `在线${config.online_minutes}分钟自动成长签到`,
          source: 'online_growth_signin',
          sourceId: record.id,
          metadata: { onlineMinutes: config.online_minutes },
        }, tx);
        await tx.onlineSigninSession.update({ where: { id: session.id }, data: { completedAt: now, accruedSeconds: targetSeconds } });
        return { record, growth };
      });

      if (result.duplicate) return { success: true, newly_completed: false, already_signed: true, status };
      return {
        success: true,
        newly_completed: true,
        already_signed: true,
        status: { ...status, online_seconds: targetSeconds, online_progress: 100 },
        reward: { exp_earned: config.daily_base_exp },
        growth_summary: result.growth,
        growthSummary: result.growth,
        popup: {
          enabled: config.popup_enabled,
          title: config.activity_title,
          online_minutes: config.online_minutes,
          image: config.popup_image,
          popup_image: config.popup_image,
        },
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { success: true, newly_completed: false, already_signed: true, status };
      }
      throw error;
    }
  }

  async signin(regionId: string, userId: string) {
    throw new BadRequestException('签到已改为在线成长自动完成，请保持小程序前台在线');
  }

  async makeupSignin(regionId: string, userId: string, dto: any) {
    throw new BadRequestException('补签已关闭，成长仅按前台在线时长自动完成');
  }

  async getSigninRewards(regionId: string, userId: string, query: any) {
    const page = this.toInt(query?.page, 1, 1);
    const pageSize = this.toInt(query?.page_size || query?.pageSize, 20, 1, 100);
    const range = this.monthRange(query?.month);
    const where: any = { userId, regionId, isMakeup: false, date: { gte: range.start, lte: range.end } };
    const [rows, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInRecord.count({ where }),
    ]);
    return {
      list: rows.map((row) => {
        const meta = this.parseJsonObject(row.content);
        return {
          id: row.id,
          signin_date: row.date,
          consecutive_days: this.toInt(meta.consecutive_days, 1, 1),
          is_makeup: row.isMakeup,
          exp_earned: this.toNumber(meta.exp_earned, 0),
          created_at: row.createdAt,
        };
      }),
      total,
      page,
      page_size: pageSize,
    };
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '发布打卡评论');
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '收藏打卡点');
    return this.prisma.punchInWishlist.create({ data: { userId, locationId, content: dto.content } });
  }

  async addWishlistFromBody(userId: string, dto: any) {
    const locationId = dto.locationId || dto.location_id;
    if (!locationId) throw new BadRequestException('缺少打卡点ID');
    return this.addWishlist(String(locationId), userId, dto);
  }

  async removeWishlist(locationId: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '取消收藏打卡点');
    await this.prisma.punchInWishlist.deleteMany({ where: { userId, locationId } });
    return { success: true };
  }

  // ========== 评分 ==========
  async getRatingCategories(regionId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    const where = { isActive: true, OR: [{ regionId }, { regionId: null }] };
    const [rows, total] = await Promise.all([
      this.prisma.ratingCategory.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { items: { where: { status: 'enabled' }, take: 6, orderBy: [{ avgScore: 'desc' }, { sortOrder: 'asc' }] } },
      }),
      this.prisma.ratingCategory.count({ where }),
    ]);
    const list = rows.map((category) => ({
      ...category,
      top_rating_items: category.items.map((item) => ({
        ...item,
        logo: item.cover,
        score: item.avgScore,
      })),
    }));
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getRatingCategoryDetail(categoryId: string) {
    return this.prisma.ratingCategory.findUnique({ where: { id: categoryId } });
  }

  async getRatingItems(categoryId: string, query: any) {
    const { page = 1, limit = 10, search, sort = 'hot' } = query;
    const where: any = { categoryId, status: 'enabled' };
    if (search) where.name = { contains: String(search) };
    return this.prisma.ratingItem.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: sort === 'latest' ? { createdAt: 'desc' } : { avgScore: 'desc' },
    });
  }

  async getRatingItemDetail(itemId: string) {
    const item = await this.prisma.ratingItem.findUnique({ where: { id: itemId }, include: { ratings: true } });
    if (!item) throw new NotFoundException('评分对象不存在');
    // AUD-P1-043: 检查区域评分开关（关闭时前端不应展示评分入口或提交）
    if (item.regionId) {
      const setting = await this.prisma.ratingRegionSetting.findUnique({ where: { regionId: item.regionId } });
      if (setting?.enableRating === false) {
        return { ...item, ratings: [], rating_disabled: true, message: '当前区域评分功能已关闭' };
      }
    }
    return item;
  }

  async getRatingItemDynamics(itemId: string, query: any) {
    const { page = 1, limit = 10 } = query;
    return this.prisma.userRating.findMany({
      where: { itemId, status: 'active' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: { User: { select: { id: true, nickname: true, avatar: true } } },
    });
  }

  async submitRating(userId: string, dto: any) {
    const itemId = dto.item_id || dto.itemId;
    const score = Number(dto.score);
    if (!itemId) throw new BadRequestException('缺少评分对象ID');
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new BadRequestException('评分必须在 1-5 之间');
    const item = await this.prisma.ratingItem.findUnique({ where: { id: itemId } });
    if (!item || item.status === 'disabled') throw new NotFoundException('评分对象不存在');
    const regionId = item.regionId || dto.regionId || dto.region_id;
    const setting = regionId ? await this.prisma.ratingRegionSetting.findUnique({ where: { regionId } }) : null;
    if (setting?.enableRating === false) throw new BadRequestException('当前区域未开启评分');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '提交评分');
    return this.prisma.$transaction(async (tx) => {
      const rating = await tx.userRating.create({
        data: { userId, itemId, regionId, score, content: dto.content, images: dto.images, status: 'active' },
      });
      const stats = await tx.userRating.aggregate({
        where: { itemId, status: 'active' },
        _avg: { score: true },
        _count: true,
      });
      await tx.ratingItem.update({
        where: { id: itemId },
        data: { avgScore: stats._avg.score || 0, ratingCount: stats._count },
      });
      return rating;
    });
  }

  async createRatingItem(userId: string, dto: any) {
    const categoryId = dto.categoryId || dto.category_id;
    const name = dto.name || dto.title;
    if (!categoryId) throw new BadRequestException('缺少评分分类ID');
    if (!name) throw new BadRequestException('缺少评分对象名称');
    await this.userAccess.assertStudentProtectedAction(userId, dto.regionId || dto.region_id, '创建评分对象');
    // AUD-P1-042: 用户创建评分对象需审核（status=pending），记录创建人，兼容logo字段
    return this.prisma.ratingItem.create({
      data: {
        categoryId,
        regionId: dto.regionId || dto.region_id,
        name,
        cover: dto.cover || dto.image || dto.image_url || dto.logo,
        description: dto.description || dto.desc,
        // AUD-P1-042: userId 字段需 schema migration，当前暂不记录创建人
        status: 'pending',
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '回复评分');
    return this.prisma.ratingReply.create({
      data: {
        ratingId,
        userId,
        content: dto.content,
        status: 'pending',
      },
    });
  }

  // ========== 网盘 ==========
  async getNetDiskCategories(query: any) {
    const where: any = {};
    const regionId = query?.region_id || query?.regionId;
    if (regionId) where.regionId = String(regionId);
    return this.prisma.netDiskCategory.findMany({ where, orderBy: { sortOrder: 'asc' } });
  }

  async getNetDiskResources(query: any) {
    const where: any = { status: 'active', isShared: true };
    const catId = query?.category_id || query?.categoryId;
    if (catId) where.categoryId = String(catId);
    // AUD-P1-130: 通过分类间接过滤区域
    const regionId = query?.region_id || query?.regionId;
    if (regionId) {
      const catIds = await this.prisma.netDiskCategory.findMany({
        where: { regionId: String(regionId) },
        select: { id: true },
      });
      if (catIds.length) where.categoryId = { in: catIds.map(c => c.id) };
    }
    // AUD-P1-130: 支持关键词搜索标题
    const keyword = query?.keyword;
    if (keyword) where.title = { contains: String(keyword) };
    return this.prisma.netDiskResource.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getNetDiskResourceDetail(id: string) {
    const resource = await this.prisma.netDiskResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('资源不存在');
    // AUD-P1-131: 构造前端期望的 links[] 格式
    return {
      ...resource,
      links: [{
        id: resource.id,
        url: resource.url,
        extract_code: resource.extractCode || '',
        platform_id: resource.platformId || '',
      }],
    };
  }

  async getNetDiskComments(query: any) {
    const where: any = {};
    const resourceId = query?.resource_id || query?.resourceId;
    if (resourceId) where.resourceId = String(resourceId);
    return this.prisma.netDiskComment.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createNetDiskComment(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '发布网盘评论');
    return this.prisma.netDiskComment.create({ data: { userId, resourceId: dto.resource_id, content: dto.content } });
  }

  async favoriteNetDisk(resourceId: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '收藏网盘资源');
    return this.prisma.netDiskFavorite.upsert({ where: { userId_resourceId: { userId, resourceId } }, create: { userId, resourceId }, update: {} });
  }

  async unfavoriteNetDisk(resourceId: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '取消收藏网盘资源');
    await this.prisma.netDiskFavorite.deleteMany({ where: { userId, resourceId } });
    return { success: true };
  }

  async getNetDiskFavorites(userId: string, query: any) {
    return this.prisma.netDiskFavorite.findMany({ where: { userId } });
  }

  async reportNetDisk(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '举报网盘资源');
    // AUD-P1-131: 兼容前端传入的 link_id 和 report_reason
    const targetId = dto?.link_id || dto?.resource_id;
    if (!targetId) throw new BadRequestException('缺少举报对象ID');
    const reason = this.textValue(dto?.reason || dto?.report_type || dto?.report_reason, '用户举报');
    const detail = this.textValue(dto?.detail || dto?.content || dto?.description || dto?.report_reason);
    const duplicated = await this.prisma.report.findFirst({
      where: { reporterId: userId, targetType: 'netdisk', targetId, status: { in: ['pending', 'processing'] } },
    }).catch(() => null);
    if (duplicated) return { success: true, message: '你已举报过，运营会尽快处理', data: duplicated };
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
  private toBoolFlag(value: any) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
  }

  private mapStickerCategory(item: any) {
    return {
      ...item,
      sort_order: item.sortOrder ?? 0,
      is_active: item.isActive ? 1 : 0,
    };
  }

  private mapSticker(item: any) {
    if (!item) return item;
    return {
      ...item,
      user_id: item.userId || '',
      category_id: item.categoryId || '',
      pack_id: item.packId || '',
      sticker_url: item.url,
      thumbnail_url: item.thumbnail || item.url,
      title: item.name,
      is_shared: item.isShared ? 1 : 0,
      is_official: item.isOfficial ? 1 : 0,
      source_label: item.isOfficial ? '官方基础表情' : '用户上传表情',
    };
  }

  async getStickerCategories() {
    const list = await this.prisma.stickerCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return list.map((item) => this.mapStickerCategory(item));
  }

  async getMyStickers(userId: string, query: any) {
    const categoryId = query?.category_id || query?.categoryId;
    const where: any = {
      userId,
      status: { in: ['active', 'pending', 'rejected', 'banned'] },
    };
    if (categoryId) where.categoryId = String(categoryId);
    const list = await this.prisma.sticker.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(Number(query?.limit || query?.pageSize || 60) || 60, 100),
      skip: Math.max(0, ((Number(query?.page) || 1) - 1) * (Number(query?.limit || query?.pageSize || 60) || 60)),
    });
    return list.map((item) => this.mapSticker(item));
  }

  async addStickerToMine(userId: string, dto: any) {
    const sourceId = String(dto?.sticker_id || dto?.stickerId || dto?.id || '').trim();
    const rawUrl = String(dto?.sticker_url || dto?.stickerUrl || dto?.url || '').trim();
    let source: any = null;
    if (sourceId) {
      source = await this.prisma.sticker.findFirst({
        where: { id: sourceId, status: 'active' },
      });
      if (!source) throw new NotFoundException('表情不存在或暂不可添加');
    } else if (rawUrl) {
      source = await this.prisma.sticker.findFirst({
        where: { url: rawUrl, status: 'active' },
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'asc' }],
      });
    }
    const url = source?.url || rawUrl;
    if (!url) throw new BadRequestException('缺少表情图片');
    const existing = await this.prisma.sticker.findFirst({
      where: {
        userId,
        url,
        status: { not: 'deleted' },
      },
    });
    if (existing) return { ...this.mapSticker(existing), duplicated: true };
    const item = await this.prisma.sticker.create({
      data: {
        userId,
        categoryId: source?.categoryId || dto?.category_id || dto?.categoryId || null,
        packId: source?.packId || dto?.pack_id || dto?.packId || null,
        name: String(source?.name || dto?.title || dto?.name || '我的表情').trim().slice(0, 30) || '我的表情',
        description: source?.description || dto?.description || null,
        url,
        thumbnail: source?.thumbnail || dto?.thumbnail_url || dto?.thumbnailUrl || url,
        isShared: false,
        isOfficial: false,
        source: 'collected',
        status: 'active',
        auditReason: '已审核表情添加到我的表情',
        mimeType: source?.mimeType || dto?.mime_type || dto?.mimeType || null,
        fileSize: Number(source?.fileSize || dto?.file_size || dto?.fileSize) || null,
      },
    });
    return this.mapSticker(item);
  }

  async getSharedStickers(query: any) {
    const categoryId = query?.category_id || query?.categoryId;
    const where: any = {
      status: 'active',
      OR: [{ isShared: true }, { isOfficial: true }],
    };
    if (categoryId) where.categoryId = String(categoryId);
    const list = await this.prisma.sticker.findMany({
      where,
      orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Number(query?.limit || query?.pageSize || 60) || 60, 100),
      skip: Math.max(0, ((Number(query?.page) || 1) - 1) * (Number(query?.limit || query?.pageSize || 60) || 60)),
    });
    return list.map((item) => this.mapSticker(item));
  }

  async uploadSticker(userId: string, dto: any) {
    const url = String(dto?.sticker_url || dto?.stickerUrl || dto?.url || '').trim();
    if (!url) throw new BadRequestException('请先上传表情图片');
    const item = await this.prisma.sticker.create({
      data: {
        userId,
        categoryId: dto?.category_id || dto?.categoryId || null,
        packId: dto?.pack_id || dto?.packId || null,
        name: String(dto?.title || dto?.name || '我的表情').trim().slice(0, 30) || '我的表情',
        description: String(dto?.description || '').trim().slice(0, 120) || null,
        url,
        thumbnail: dto?.thumbnail_url || dto?.thumbnailUrl || dto?.thumbnail || url,
        isShared: this.toBoolFlag(dto?.is_shared ?? dto?.isShared),
        isOfficial: false,
        source: 'user',
        status: 'pending',
        auditReason: '用户上传表情，等待平台审核',
        mimeType: dto?.mime_type || dto?.mimeType || null,
        fileSize: Number(dto?.file_size || dto?.fileSize) || null,
      },
    });
    return this.mapSticker(item);
  }

  // ========== 分享 ==========
  async getShareSettings(regionId: string) {
    const [settings, couponConfig] = await Promise.all([
      this.prisma.shareSettings.findUnique({ where: { regionId } }),
      this.prisma.config.findUnique({ where: { key: `share_invite_coupon_config_${regionId}` } }).catch(() => null),
    ]);
    const couponValue = this.parseJsonObject(couponConfig?.value);
    const couponIds = [couponValue.inviterCouponId, couponValue.inviteeCouponId].filter(Boolean);
    const coupons = couponIds.length
      ? await this.prisma.coupon.findMany({ where: { id: { in: couponIds } } }).catch(() => [])
      : [];
    const couponMap = new Map((coupons || []).map((coupon: any) => [coupon.id, coupon]));
    const formatInviteCoupon = (id: string) => {
      const coupon: any = id ? couponMap.get(id) : null;
      if (!coupon) return null;
      return {
        id: coupon.id,
        title: coupon.name,
        name: coupon.name,
        amount: this.toNumber(coupon.value, 0).toFixed(2),
        min_order_amount: this.toNumber(coupon.minAmount, 0).toFixed(2),
        valid_to: coupon.endAt,
      };
    };
    const inviterCoupon = formatInviteCoupon(couponValue.inviterCouponId || '');
    const inviteeCoupon = formatInviteCoupon(couponValue.inviteeCouponId || '');
    if (!settings) {
      return {
        region_id: regionId,
        is_enabled: false,
        activity_title: '分享有礼',
        activity_image: '',
        activity_rules: '当前区域暂未配置分享活动。',
        inviter_reward: '0.00',
        invitee_reward: '0.00',
        user_limit: 'ALL_USERS',
        daily_invite_limit: 0,
        total_invite_limit: 0,
        inviter_coupon_id: couponValue.inviterCouponId || '',
        invitee_coupon_id: couponValue.inviteeCouponId || '',
        inviter_coupon: inviterCoupon,
        invitee_coupon: inviteeCoupon,
        min_withdraw_amount: '0.00',
      };
    }
    return {
      id: settings.id,
      region_id: settings.regionId,
      is_enabled: settings.isEnabled ? 1 : 0,
      activity_title: settings.activityTitle || '邀请好友得奖励',
      activity_image: settings.activityImage || '',
      activity_rules: this.shareRulesText(settings.activityRules),
      inviter_reward: this.toNumber(settings.inviterReward, 0).toFixed(2),
      invitee_reward: this.toNumber(settings.inviteeReward, 0).toFixed(2),
      user_limit: settings.userLimit,
      daily_invite_limit: settings.dailyInviteLimit,
      total_invite_limit: settings.totalInviteLimit || 0,
      require_inviter_phone: settings.requireInviterPhone ? 1 : 0,
      require_invitee_phone: settings.requireInviteePhone ? 1 : 0,
      require_inviter_student_verify: settings.requireInviterStudentVerify ? 1 : 0,
      require_invitee_student_verify: settings.requireInviteeStudentVerify ? 1 : 0,
      reward_release_mode: settings.rewardReleaseMode || 'immediate',
      reward_delay_hours: settings.rewardDelayHours || 0,
      inviter_coupon_id: couponValue.inviterCouponId || '',
      invitee_coupon_id: couponValue.inviteeCouponId || '',
      inviter_coupon: inviterCoupon,
      invitee_coupon: inviteeCoupon,
      start_time: settings.startTime,
      end_time: settings.endTime,
      min_withdraw_amount: '0.00',
    };
  }

  private async grantInviteCoupon(tx: any, userId: string, couponId: any, reason: string) {
    const id = String(couponId || '').trim();
    if (!id) return null;
    const coupon = await tx.coupon.findUnique({ where: { id } });
    if (!coupon || coupon.status !== 'active') throw new BadRequestException(`${reason}优惠券不存在或已失效`);
    const now = new Date();
    if (coupon.endAt && now > coupon.endAt) throw new BadRequestException(`${reason}优惠券已过期`);
    if (coupon.receivedCount >= coupon.totalCount) throw new BadRequestException(`${reason}优惠券已领完`);
    const owned = await tx.couponReceive.count({ where: { couponId: id, userId } });
    if (owned >= coupon.limitPerUser) return null;
    const receive = await tx.couponReceive.create({ data: { couponId: id, userId }, include: { coupon: true } });
    await tx.coupon.update({ where: { id }, data: { receivedCount: { increment: 1 } } });
    return receive;
  }

  async claimPostShare(userId: string, code: string, requestMeta: { ip?: string; userAgent?: string; deviceId?: string } = {}) {
    const normalizedCode = String(code || '').trim();
    const deviceId = String(requestMeta.deviceId || '').trim().slice(0, 160);
    if (!normalizedCode) throw new BadRequestException('缺少分享码');
    if (!deviceId) throw new BadRequestException('缺少设备标识');

    const link: any = await (this.prisma as any).postShareLink.findUnique({
      where: { code: normalizedCode },
      include: { post: { select: { id: true, status: true, deletedAt: true } } },
    });
    if (!link || link.status !== 'ACTIVE' || new Date(link.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('分享链接已失效');
    }
    if (!link.post || link.post.deletedAt || link.post.status !== 'PUBLISHED') {
      throw new BadRequestException('笔记不可查看');
    }
    if (!link.regionId) throw new BadRequestException('分享链接缺少区域信息');
    if (link.sharerId === userId) throw new BadRequestException('不能邀请自己');

    const [visit, user] = await Promise.all([
      (this.prisma as any).postShareVisit.findFirst({
        where: { linkId: link.id, visitorId: deviceId },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } }),
    ]);
    if (!visit) throw new BadRequestException('请从分享海报进入后完成注册');
    if (!user || user.createdAt.getTime() <= new Date(visit.openedAt).getTime()) {
      throw new BadRequestException('仅限首次注册用户');
    }
    if (Date.now() - user.createdAt.getTime() > 15 * 60 * 1000) {
      throw new BadRequestException('仅限首次注册后立即认领');
    }

    const result = await this.beInvited(
      userId,
      { inviter_id: link.sharerId, region_id: link.regionId, device_id: deviceId },
      requestMeta,
      { linkId: link.id },
    );
    return { ...result, claimed: true, share_code: normalizedCode };
  }

  async beInvited(
    userId: string,
    dto: any,
    requestMeta: { ip?: string; userAgent?: string; deviceId?: string } = {},
    postShareClaim?: { linkId: string },
  ) {
    const inviterId = String(dto?.inviter_id || '');
    const regionId = String(dto?.region_id || '');
    if (!inviterId) throw new BadRequestException('邀请人不存在');
    if (!regionId) throw new BadRequestException('缺少区域信息');
    if (inviterId === userId) throw new BadRequestException('不能邀请自己');
    const ip = String(dto?.ip || requestMeta.ip || '').trim().slice(0, 120);
    const userAgent = String(dto?.user_agent || dto?.userAgent || requestMeta.userAgent || '').trim().slice(0, 500);
    const deviceId = String(dto?.device_id || dto?.deviceId || requestMeta.deviceId || '').trim().slice(0, 160);

    const [settings, invitee, inviter, region, couponConfig] = await Promise.all([
      this.prisma.shareSettings.findUnique({ where: { regionId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true, phone: true, status: true, lastLoginDevice: true, studentVerify: { select: { status: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: inviterId },
        select: { id: true, createdAt: true, phone: true, status: true, lastLoginDevice: true, studentVerify: { select: { status: true } } },
      }),
      this.prisma.region.findUnique({
        where: { id: regionId },
        select: { id: true, studentOnly: true, onlyStudentAuthUsers: true },
      }).catch(() => null),
      this.prisma.config.findUnique({ where: { key: `share_invite_coupon_config_${regionId}` } }).catch(() => null),
    ]);
    if (!settings || !settings.isEnabled) throw new BadRequestException('当前区域未开启分享奖励');

    const now = new Date();
    if (settings.startTime && now < settings.startTime) throw new BadRequestException('分享活动未开始');
    if (settings.endTime && now > settings.endTime) throw new BadRequestException('分享活动已结束');

    if (!inviter) throw new BadRequestException('邀请人不存在');
    if (!invitee) throw new BadRequestException('被邀请人不存在');
    if (inviter.status !== 'ACTIVE') throw new BadRequestException('邀请人账号状态异常');
    if (invitee.status !== 'ACTIVE') throw new BadRequestException('被邀请人账号状态异常');

    const existingInvitee = await this.prisma.shareInvite.findFirst({
      where: { inviteeId: userId, status: { in: ['SUCCESS', 'PENDING'] } },
    });
    if (existingInvitee) throw new BadRequestException('该用户已接受过邀请');

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activeRewardStatuses = ['SUCCESS', 'PENDING'] as any[];
    const [todayCount, totalCount] = await Promise.all([
      this.prisma.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } }),
      this.prisma.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses } } }),
    ]);
    if (settings.dailyInviteLimit > 0 && todayCount >= settings.dailyInviteLimit) {
      throw new BadRequestException('邀请人今日奖励次数已达上限');
    }
    if (settings.totalInviteLimit && settings.totalInviteLimit > 0 && totalCount >= settings.totalInviteLimit) {
      throw new BadRequestException('邀请人累计奖励次数已达上限');
    }

    const isNewUser = invitee ? now.getTime() - invitee.createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000 : true;
    if (settings.userLimit === 'NEW_USERS' && !isNewUser) {
      throw new BadRequestException('该活动仅限新用户参与');
    }

    const effectiveDeviceId = deviceId || invitee.lastLoginDevice || '';
    const riskReasons: string[] = [];
    const inviterWhitelist = this.parseJsonList(settings.inviterWhitelist);
    const inviterBlacklist = this.parseJsonList(settings.inviterBlacklist);
    const inviteeBlacklist = this.parseJsonList(settings.inviteeBlacklist);
    const blockedPhonePrefixes = this.parseJsonList(settings.blockedPhonePrefixes);
    if (inviterWhitelist.length && !inviterWhitelist.includes(inviterId)) riskReasons.push('邀请人不在活动白名单');
    if (inviterBlacklist.includes(inviterId)) riskReasons.push('邀请人已被禁止参与分享有礼');
    if (inviteeBlacklist.includes(userId)) riskReasons.push('被邀请人已被禁止参与分享有礼');
    if (blockedPhonePrefixes.length) {
      const inviterPhone = String(inviter.phone || '');
      const inviteePhone = String(invitee.phone || '');
      if (blockedPhonePrefixes.some((prefix) => inviterPhone.startsWith(prefix) || inviteePhone.startsWith(prefix))) {
        riskReasons.push('命中禁止参与的手机号段');
      }
    }
    const requireInviterStudent = !!settings.requireInviterStudentVerify || !!region?.studentOnly || !!region?.onlyStudentAuthUsers;
    const requireInviteeStudent = !!settings.requireInviteeStudentVerify || !!region?.studentOnly || !!region?.onlyStudentAuthUsers;
    if (settings.requireInviterPhone && !inviter.phone) riskReasons.push('邀请人未绑定手机号');
    if (settings.requireInviteePhone && !invitee.phone) riskReasons.push('被邀请人未绑定手机号');
    if (requireInviterStudent && !this.isStudentApproved(inviter)) riskReasons.push('邀请人未通过学生认证');
    if (requireInviteeStudent && !this.isStudentApproved(invitee)) riskReasons.push('被邀请人未通过学生认证');
    const inviterAgeDays = (now.getTime() - inviter.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (settings.minInviterAccountAgeDays > 0 && inviterAgeDays < settings.minInviterAccountAgeDays) {
      riskReasons.push(`邀请人注册未满${settings.minInviterAccountAgeDays}天`);
    }
    const inviteeAgeMinutes = (now.getTime() - invitee.createdAt.getTime()) / (60 * 1000);
    if (settings.minInviteeAccountAgeMinutes > 0 && inviteeAgeMinutes < settings.minInviteeAccountAgeMinutes) {
      riskReasons.push(`被邀请人注册未满${settings.minInviteeAccountAgeMinutes}分钟`);
    }

    const cooldownStart = new Date(now.getTime() - Math.max(0, settings.inviteCooldownMinutes || 0) * 60 * 1000);
    const recentStart = new Date(now.getTime() - Math.max(1, settings.recentWindowMinutes || 10) * 60 * 1000);
    const [cooldownCount, recentCount, sameIpCount, sameDeviceDailyCount, sameDeviceTotalCount, rewardSum] = await Promise.all([
      settings.inviteCooldownMinutes > 0
        ? this.prisma.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: cooldownStart } } })
        : Promise.resolve(0),
      settings.maxRecentInvites > 0
        ? this.prisma.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: recentStart } } })
        : Promise.resolve(0),
      ip && settings.sameIpDailyLimit > 0
        ? this.prisma.shareInvite.count({ where: { regionId, ip, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } })
        : Promise.resolve(0),
      effectiveDeviceId && settings.sameDeviceDailyLimit > 0
        ? this.prisma.shareInvite.count({ where: { regionId, deviceId: effectiveDeviceId, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } })
        : Promise.resolve(0),
      effectiveDeviceId && settings.sameDeviceTotalLimit > 0
        ? this.prisma.shareInvite.count({ where: { regionId, deviceId: effectiveDeviceId, status: { in: activeRewardStatuses } } })
        : Promise.resolve(0),
      this.prisma.shareReward.aggregate({ where: { status: { in: activeRewardStatuses }, invite: { regionId } }, _sum: { amount: true } }),
    ]);
    if (cooldownCount > 0) riskReasons.push(`邀请冷却期${settings.inviteCooldownMinutes}分钟内不能重复奖励`);
    if (settings.maxRecentInvites > 0 && recentCount >= settings.maxRecentInvites) {
      riskReasons.push(`${settings.recentWindowMinutes || 10}分钟内邀请奖励次数已达上限`);
    }
    if (settings.sameIpDailyLimit > 0 && sameIpCount >= settings.sameIpDailyLimit) riskReasons.push('同IP今日奖励次数已达上限');
    if (settings.sameDeviceDailyLimit > 0 && sameDeviceDailyCount >= settings.sameDeviceDailyLimit) riskReasons.push('同设备今日奖励次数已达上限');
    if (settings.sameDeviceTotalLimit > 0 && sameDeviceTotalCount >= settings.sameDeviceTotalLimit) riskReasons.push('同设备累计奖励次数已达上限');

    const singleRewardCap = this.toNumber(settings.singleRewardCap, 0);
    let inviterReward = this.toNumber(settings.inviterReward, 0);
    let inviteeReward = this.toNumber(settings.inviteeReward, 0);
    if (singleRewardCap > 0) {
      inviterReward = Math.min(inviterReward, singleRewardCap);
      inviteeReward = Math.min(inviteeReward, singleRewardCap);
    }
    const currentRewardTotal = this.toNumber(rewardSum._sum.amount, 0);
    const budget = this.toNumber(settings.totalRewardBudget, 0);
    if (budget > 0 && currentRewardTotal + inviterReward + inviteeReward > budget) {
      riskReasons.push('活动奖励预算已达上限');
    }
    if (riskReasons.length) {
      throw new BadRequestException(riskReasons[0]);
    }

    const releaseMode = this.normalizeRewardReleaseMode(settings.rewardReleaseMode);
    const rewardReadyAt = releaseMode === 'delayed' ? this.addHours(now, settings.rewardDelayHours || 0) : null;
    const immediateReward = releaseMode === 'immediate';
    const inviteStatus = immediateReward ? 'SUCCESS' : 'PENDING';
    const pendingReason = releaseMode === 'manual'
      ? '等待管理员审核发放'
      : releaseMode === 'qualified'
        ? '等待达成奖励条件'
        : '等待延迟发放';
    const couponValue = this.parseJsonObject(couponConfig?.value);

    return this.prisma.$transaction(async (tx) => {
      if (postShareClaim) {
        const locked = await (tx as any).postShareLink.updateMany({
          where: {
            id: postShareClaim.linkId,
            status: 'ACTIVE',
            claimUserId: null,
            expiresAt: { gt: now },
          },
          data: {
            status: 'CLAIMED',
            claimUserId: userId,
            claimedAt: now,
          },
        });
        if (!locked.count) throw new BadRequestException('分享链接已被认领');
      }
      const invite = await tx.shareInvite.create({
        data: {
          inviterId,
          inviteeId: userId,
          regionId,
          isNewUser,
          rewardAmount: inviterReward,
          inviteeRewardAmount: inviteeReward,
          status: inviteStatus,
          ip: ip || null,
          deviceId: effectiveDeviceId || null,
          userAgent: userAgent || null,
          riskReasons: {
            checks: {
              requireInviterStudent,
              requireInviteeStudent,
              inviterStudentApproved: this.isStudentApproved(inviter),
              inviteeStudentApproved: this.isStudentApproved(invitee),
              sameIpCount,
              sameDeviceDailyCount,
              sameDeviceTotalCount,
              currentRewardTotal,
              budget,
              inviterWhitelistEnabled: inviterWhitelist.length > 0,
            },
          },
          rewardReleaseMode: releaseMode,
          rewardReadyAt,
        },
      });

      if (immediateReward && inviterReward > 0) {
        await this.grantWalletReward(tx, inviterId, inviterReward, `分享邀请奖励 ${invite.id}`);
        await tx.shareReward.create({
          data: { inviteId: invite.id, userId: inviterId, type: 'INVITER', amount: inviterReward, status: 'SUCCESS' },
        });
      } else {
        await this.createPendingShareReward(tx, invite.id, inviterId, 'INVITER', inviterReward, pendingReason, !!couponValue.inviterCouponId);
      }
      if (immediateReward && inviteeReward > 0) {
        await this.grantWalletReward(tx, userId, inviteeReward, `新人受邀奖励 ${invite.id}`);
        await tx.shareReward.create({
          data: { inviteId: invite.id, userId, type: 'INVITEE', amount: inviteeReward, status: 'SUCCESS' },
        });
      } else {
        await this.createPendingShareReward(tx, invite.id, userId, 'INVITEE', inviteeReward, pendingReason, !!couponValue.inviteeCouponId);
      }
      const [inviterCoupon, inviteeCoupon] = immediateReward
        ? await Promise.all([
            this.grantInviteCoupon(tx, inviterId, couponValue.inviterCouponId, '邀请人奖励'),
            this.grantInviteCoupon(tx, userId, couponValue.inviteeCouponId, '新人奖励'),
          ])
        : [null, null];
      return {
        success: true,
        invite,
        reward_pending: !immediateReward,
        reward_release_mode: releaseMode,
        coupons: {
          inviter: inviterCoupon ? this.formatUserCoupon(inviterCoupon) : null,
          invitee: inviteeCoupon ? this.formatUserCoupon(inviteeCoupon) : null,
        },
      };
    });
  }

  async getInviteRecords(userId: string) {
    const rows = await this.prisma.shareInvite.findMany({
      where: { inviterId: userId },
      include: { invitee: { select: { id: true, nickname: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayInvites = rows.filter((row) => row.createdAt >= today).length;
    const totalReward = rows.reduce((sum, row) => row.status === 'SUCCESS' ? sum + this.toNumber(row.rewardAmount, 0) : sum, 0);
    return {
      records: rows.map((row) => ({
        id: row.id,
        invitee: row.invitee || { id: row.inviteeId, nickname: '用户', avatar: '' },
        created_at: row.createdAt,
        reward_amount: this.toNumber(row.rewardAmount, 0).toFixed(2),
        invitee_reward_amount: this.toNumber(row.inviteeRewardAmount, 0).toFixed(2),
        status: row.status === 'SUCCESS' ? 'completed' : row.status === 'FAILED' ? 'failed' : 'pending',
      })),
      statistics: {
        today_invites: todayInvites,
        total_invites: rows.length,
        total_reward: totalReward.toFixed(2),
      },
    };
  }

  // ========== 匿名身份 ==========
  async getRandomAnonymous(regionId: string, postId?: string) {
    if (!regionId && postId) {
      const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { regionId: true } });
      regionId = String(post?.regionId || '').trim();
    }
    if (!regionId) throw new BadRequestException('请选择区域');
    const where = { regionId };
    const count = await this.prisma.anonymousIdentity.count({ where });
    if (!count) return null;
    const skip = Math.floor(Math.random() * count);
    const identity = await this.prisma.anonymousIdentity.findFirst({ where, skip, orderBy: { id: 'asc' } });
    if (!identity) return null;
    return {
      ...identity,
      nickname: identity.name,
      avatar_url: identity.avatar || '',
    };
  }

  // ========== 排行榜 ==========
  async getRankings(query: any) {
    const {
      type = 'user',
      sort_by = 'orders',   // orders | earnings
      order = 'desc',
      time_range = 'week',  // day | week | month | all
      page = 1,
      limit = 20,
    } = query;

    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page), 1) - 1) * take;
    const dir = order === 'asc' ? 'asc' : 'desc';

    // 骑手排行榜（sort_by = orders / earnings）
    if (sort_by === 'orders' || sort_by === 'earnings') {
      const now = new Date();
      let since: Date | undefined;
      if (time_range === 'day') {
        since = new Date(now);
        since.setHours(0, 0, 0, 0);
      } else if (time_range === 'week') {
        since = new Date(now);
        since.setDate(since.getDate() - 7);
      } else if (time_range === 'month') {
        since = new Date(now);
        since.setDate(since.getDate() - 30);
      }

      const whereOrder: any = { status: 'completed' };
      if (since) whereOrder.completeTime = { gte: since };

      // 聚合骑手完成订单数和总收益
      const grouped = await this.prisma.errandOrder.groupBy({
        by: ['riderId'],
        where: { ...whereOrder, riderId: { not: null } },
        _count: { id: true },
        _sum: { payAmount: true },
        orderBy: sort_by === 'earnings'
          ? [{ _sum: { payAmount: dir as any } }]
          : [{ _count: { id: dir as any } }],
        take: take + skip,
      });

      const sliced = grouped.slice(skip, skip + take);
      if (!sliced.length) return { list: [], total: 0 };

      const riderIds = sliced.map(r => r.riderId!);
      const users = await this.prisma.user.findMany({
        where: { id: { in: riderIds } },
        select: { id: true, nickname: true, avatar: true },
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      const list = sliced.map((r, i) => ({
        rank: skip + i + 1,
        riderId: r.riderId,
        nickname: userMap.get(r.riderId!)?.nickname || '骑手',
        avatar: userMap.get(r.riderId!)?.avatar || '',
        orderCount: r._count.id,
        totalEarnings: Number(r._sum.payAmount || 0),
      }));

      return { list, total: grouped.length };
    }

    // 用户排行（按注册时间）
    if (type === 'user') {
      const users = await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: { id: true, nickname: true, avatar: true },
      });
      return { list: users, total: await this.prisma.user.count() };
    }

    // 帖子排行（按点赞）
    if (type === 'post') {
      const posts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { likeCount: dir },
        skip,
        take,
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
    const where: any = { isPublic: true };
    // AUD-P1-135: 按区域过滤公开联系人（通过分类间接过滤）
    const regionId = query?.region_id || query?.regionId;
    if (regionId) where.category = { regionId: String(regionId) };
    const list = await this.prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, data: { list } };
  }

  async getContactCategories(regionId: string) {
    return this.prisma.contactCategory.findMany({ where: { regionId } });
  }

  async getContactDetail(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { category: { select: { regionId: true } } },
    });
    if (!contact) throw new NotFoundException('联系人不存在');
    // AUD-P1-135: 详情只返回公开联系人，私密联系人需通过 my 接口访问
    if (!contact.isPublic) throw new NotFoundException('联系人不存在');
    return { success: true, data: contact };
  }

  async createContact(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '发布通讯录');
    // AUD-P1-134: 映射前端字段到模型字段（Contact 模型无 userId，该字段通过 studentVerify 区域准入校验保护）
    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone) data.phone = dto.phone;
    if (dto.address) data.address = dto.address;
    if (dto.remark) data.remark = dto.remark;
    if (dto.category) data.categoryId = dto.category;
    else if (dto.categoryId) data.categoryId = dto.categoryId;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic === true || dto.isPublic === 1;
    return this.prisma.contact.create({ data });
  }

  async updateContact(id: string, userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '修改通讯录');
    const contact = await this.prisma.contact.findUnique({ where: { id }, select: { id: true } });
    if (!contact) throw new NotFoundException('联系人不存在');
    // AUD-P1-134: 映射前端字段到模型字段（Contact 模型无 userId 字段，归属通过 studentVerify 区域准入保护）
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.remark !== undefined) data.remark = dto.remark;
    if (dto.category !== undefined) data.categoryId = dto.category;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic === true || dto.isPublic === 1;
    return this.prisma.contact.update({ where: { id }, data });
  }

  async deleteContact(id: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '删除通讯录');
    await this.prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  async getMyContacts(userId: string, query: any) {
    const regionId = query?.region_id || query?.regionId;
    if (regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: String(regionId) },
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
    // AUD-P1-134: 按 userId 过滤 + 包装 response 格式
    const where: any = { userId };
    if (regionId) where.category = { regionId: String(regionId) };
    const list = await this.prisma.contact.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return { success: true, data: { list } };
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
    const contents = await this.prisma.richTextContent.findMany({
      where: {
        isShow: true,
        OR: [
          { regionId },
          { regionId: null },
        ],
      },
      select: { id: true, type: true, title: true, version: true, scene: true, isRequired: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    const types = Array.from(new Map(contents.map((item) => [item.type, item])).values()).map((item) => ({
      type: item.type,
      content_id: item.id,
      contentId: item.id,
      title: item.title,
      version: item.version,
      scene: item.scene || '',
      required: item.isRequired,
      updated_at: item.updatedAt,
    }));
    return { code: 200, data: { types }, types };
  }

  async getAgreementDocument(type: string, query: any) {
    const def = this.normalizeAgreementType(type);
    const regionId = String(query?.region_id || query?.regionId || '').trim() || null;
    const doc = await this.prisma.richTextContent.findFirst({
      where: {
        type: def.type,
        isShow: true,
        OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }],
      },
      orderBy: [{ regionId: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const data = doc || {
      id: '',
      regionId,
      type: def.type,
      title: def.title,
      content: '平台暂未配置该协议内容，请联系运营管理员完善。',
      version: '1.0.0',
      scene: def.scene,
      isRequired: def.isRequired,
      isShow: true,
      updatedAt: new Date(),
    };
    return { code: 200, data, agreement: data };
  }

  async acceptAgreement(userId: string, dto: any) {
    const def = this.normalizeAgreementType(dto.type || dto.code);
    const regionId = String(dto.region_id || dto.regionId || 'global').trim() || 'global';
    const version = String(dto.version || '1.0.0').trim() || '1.0.0';
    const documentId = dto.document_id || dto.documentId || undefined;
    const data = await this.prisma.userAgreementConsent.upsert({
      where: {
        userId_code_version_regionId: {
          userId,
          code: def.type,
          version,
          regionId,
        },
      },
      update: {
        documentId,
        scene: dto.scene || def.scene,
        source: dto.source || 'miniapp',
        acceptedAt: new Date(),
      },
      create: {
        userId,
        documentId,
        code: def.type,
        version,
        regionId,
        scene: dto.scene || def.scene,
        source: dto.source || 'miniapp',
      },
    });
    return { code: 200, success: true, data };
  }

  // ========== 用户引导 ==========
  async getUserGuidanceSettings() {
    const config = await this.prisma.config.findUnique({ where: { key: 'force_guidance_enabled' } }).catch(() => null);
    return {
      success: true,
      data: {
        force_guidance_enabled: config?.value === true,
        forceGuidanceEnabled: config?.value === true,
      },
    };
  }

  async getUserGuidancePages(regionId: string) {
    if (!regionId) {
      return { success: false, message: '区域ID不能为空', data: this.getDefaultUserGuidanceConfig(regionId) };
    }

    const [rawPages, tags] = await Promise.all([
      this.prisma.userGuidancePage.findMany({
        where: { regionId, isShow: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.userTagDefinition.findMany({
        where: {
          isActive: true,
          OR: [{ regionId }, { regionId: null }],
        },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        take: 60,
      }),
    ]);

    const pages = this.normalizeUserGuidancePages(rawPages);
    const tagPage = pages.find((page) => Number(page.page_no) === 3) || {};
    const selectedTagIds = this.normalizeIdList(tagPage.selected_tag_ids || tagPage.selectedTagIds);
    const visibleTags = selectedTagIds.length
      ? tags.filter((tag) => selectedTagIds.includes(tag.id))
      : tags;

    return {
      success: true,
      data: {
        pages,
        tags: visibleTags.map((tag) => ({
          tag_id: tag.id,
          id: tag.id,
          tag_name: tag.tagName,
          name: tag.tagName,
          tag_color: tag.tagColor || tag.textColor || '#111111',
          color: tag.tagColor || tag.textColor || '#111111',
          background_color: tag.backgroundColor || '',
          text_color: tag.textColor || '',
          border_color: tag.borderColor || '',
        })),
        circles: [],
      },
    };
  }

  async saveUserGuidanceInfo(userId: string, dto: any) {
    if (!userId) throw new BadRequestException('用户身份缺失，请重新登录');

    const regionId = String(dto.region_id || dto.regionId || '').trim();
    const nickname = typeof dto.nickname === 'string' ? dto.nickname.trim() : undefined;
    const avatar = typeof dto.avatar === 'string' ? dto.avatar.trim() : undefined;
    const birthday = this.normalizeUserGuidanceBirthday(dto.birthday);
    const gender = this.normalizeUserGuidanceGender(dto.gender);
    const grade = typeof dto.user_identity === 'string' ? dto.user_identity.trim() : undefined;
    const hasSelectedTagsInput = Object.prototype.hasOwnProperty.call(dto || {}, 'selected_tags')
      || Object.prototype.hasOwnProperty.call(dto || {}, 'selectedTags');
    const selectedTagIds = this.normalizeIdList(dto.selected_tags || dto.selectedTags);

    const tagDefs = selectedTagIds.length
      ? await this.prisma.userTagDefinition.findMany({
          where: {
            id: { in: selectedTagIds },
            isActive: true,
            OR: regionId ? [{ regionId }, { regionId: null }] : undefined,
          },
        })
      : [];

    if (tagDefs.length !== selectedTagIds.length) {
      throw new BadRequestException('部分标签无效，请重新选择');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const userData: Record<string, any> = {};
      if (nickname !== undefined) userData.nickname = nickname;
      if (avatar !== undefined) userData.avatar = avatar;
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }

      const profileData: Record<string, any> = {};
      if (gender !== undefined) profileData.gender = gender;
      if (birthday !== undefined) profileData.birthday = birthday;
      if (grade !== undefined) profileData.grade = grade;
      if (Object.keys(profileData).length > 0) {
        await tx.userProfile.upsert({
          where: { userId },
          update: profileData,
          create: { userId, ...profileData },
        });
      }

      if (hasSelectedTagsInput) {
        await tx.userTag.deleteMany({ where: { userId } });
      }
      if (selectedTagIds.length > 0) {
        await tx.userTag.createMany({
          data: tagDefs.map((tag) => ({
            userId,
            name: tag.tagName,
            color: tag.tagColor || tag.textColor || null,
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          uid: true,
          nickname: true,
          avatar: true,
          profile: { select: { gender: true, birthday: true, grade: true } },
        },
      });
    });

    return {
      success: true,
      message: '保存成功',
      data: {
        user: updated,
        selected_tags: tagDefs.map((tag) => tag.id),
        selected_circles: [],
      },
    };
  }

  private normalizeUserGuidancePages(rawPages: any[]) {
    const defaults = this.getDefaultUserGuidanceConfig('').pages;
    if (!rawPages.length) return defaults;
    const pages = rawPages.map((page, index) => {
      const content = this.parseUserGuidanceContent(page.content);
      const pageNo = Number(content.page_no || content.pageNo || page.sortOrder || index + 1);
      const fallback = defaults.find((item) => item.page_no === pageNo) || defaults[index] || {};
      return {
        ...fallback,
        ...content,
        page_no: pageNo,
        page_title: content.page_title || content.pageTitle || page.title || fallback.page_title,
        page_subtitle: content.page_subtitle || content.pageSubtitle || fallback.page_subtitle || '',
      };
    });
    return pages.filter((page) => Number(page.page_no) !== 4).sort((a, b) => a.page_no - b.page_no);
  }

  private parseUserGuidanceContent(content: any) {
    if (!content) return {};
    if (typeof content === 'object') return content;
    if (typeof content !== 'string') return {};
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? parsed : { page_subtitle: content };
    } catch {
      return { page_subtitle: content };
    }
  }

  private getDefaultUserGuidanceConfig(regionId: string) {
    return {
      regionId,
      pages: [
        {
          page_no: 1,
          page_title: '你是男生还是女生？(选择后不可更改)',
          page_subtitle: '介绍一下自己的性别',
          enable_birthday_setting: true,
        },
        {
          page_no: 2,
          page_title: '设置头像和昵称',
          page_subtitle: '让大家更好地认识你',
          avatar_tip: '点击更换头像',
          nickname_label: '昵称',
          nickname_placeholder: '请输入昵称',
          nickname_max_length: 20,
          grade_title: '您当前是大几？或者您的身份',
        },
        {
          page_no: 3,
          page_title: '选择你的标签',
          page_subtitle: '最多选择5个标签，也可以先跳过',
          max_tags: 5,
          allow_skip: true,
          selected_tag_count_text: '已选择 {count}/{max} 个标签',
        },
      ],
      tags: [],
      circles: [],
    };
  }

  private normalizeUserGuidanceGender(value: any): Gender | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === Gender.MALE || value === 'MALE' || value === 'male' || value === 1 || value === '1' || value === '男') {
      return Gender.MALE;
    }
    if (value === Gender.FEMALE || value === 'FEMALE' || value === 'female' || value === 2 || value === '2' || value === '女') {
      return Gender.FEMALE;
    }
    if (value === Gender.UNKNOWN || value === 'UNKNOWN' || value === 'unknown' || value === 0 || value === '0') {
      return Gender.UNKNOWN;
    }
    throw new BadRequestException('性别参数不合法');
  }

  private normalizeUserGuidanceBirthday(value: any): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('出生日期不合法');
    return date;
  }

  private normalizeIdList(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
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
    const tags = await this.prisma.userTagDefinition.findMany({
      where: {
        isActive: true,
        OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }],
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      success: true,
      data: tags.map((tag) => ({
        tag_id: tag.id,
        id: tag.id,
        tag_name: tag.tagName,
        name: tag.tagName,
        tag_color: tag.tagColor || tag.textColor || '#111111',
        color: tag.tagColor || tag.textColor || '#111111',
      })),
    };
  }

  async updateUserTagRelation(userId: string, dto: any) {
    const tagIds = this.normalizeIdList(dto.tagIds || dto.tag_ids || dto.selected_tags);
    if (Array.isArray(tagIds)) {
      const defs = tagIds.length
        ? await this.prisma.userTagDefinition.findMany({ where: { id: { in: tagIds }, isActive: true } })
        : [];
      if (defs.length !== tagIds.length) throw new BadRequestException('部分标签无效，请重新选择');
      await this.prisma.userTag.deleteMany({ where: { userId } });
      if (defs.length > 0) {
        await this.prisma.userTag.createMany({
          data: defs.map((tag) => ({
            userId,
            name: tag.tagName,
            color: tag.tagColor || tag.textColor || null,
          })),
          skipDuplicates: true,
        });
      }
    }
    return { success: true };
  }

  // ========== 区域自定义页面 ==========
  async getRegionCustomPages(regionId: string, query: any) {
    return this.prisma.regionCustomPage.findMany({ where: { regionId, isShow: true } });
  }

  // ========== 对象匹配 ==========
  private cleanDatingId(value: any) {
    const text = String(value || '').trim();
    if (!text || text === 'undefined' || text === 'null') return undefined;
    return text;
  }

  private asBoolean(value: any, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  private asArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value].filter(Boolean);
      } catch {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return [value];
  }

  private normalizeDatingTags(value: any) {
    return this.asArray(value)
      .map((item) => (typeof item === 'string' ? { text: item } : { ...item, text: item?.text || item?.name || String(item || '') }))
      .filter((item) => item.text);
  }

  private getDatingAge(birthYear?: number | null) {
    if (!birthYear) return null;
    const age = new Date().getFullYear() - Number(birthYear);
    return age > 0 && age < 100 ? age : null;
  }

  private formatDatingStatus(status?: string) {
    const map: Record<string, string> = {
      pending: '待审核',
      approved: '已通过',
      rejected: '未通过',
      PENDING: '待回应',
      MATCHED: '互相喜欢',
      REJECTED: '已跳过',
      EXPIRED: '已过期',
    };
    return map[status || ''] || status || '-';
  }

  private formatDatingProfile(profile: any, viewerId?: string) {
    if (!profile) return null;
    const user = profile.user || {};
    const userProfile = user.profile || {};
    const photos = this.asArray(profile.photos).filter(Boolean);
    const gender = profile.gender || userProfile.gender || '';
    const normalizedGender = String(gender).toLowerCase();
    const age = this.getDatingAge(profile.birthYear) || this.getDatingAge(userProfile.birthday ? new Date(userProfile.birthday).getFullYear() : null);
    return {
      id: profile.id,
      profile_id: profile.id,
      user_id: profile.userId,
      uid: user.uid,
      uid_text: user.uid ? String(user.uid).padStart(6, '0') : '',
      name: profile.displayName || user.nickname || user.name || '校园用户',
      avatar: user.avatar || photos[0] || '/static/logo.jpg',
      photos: photos.length ? photos : [user.avatar || '/static/logo.jpg'],
      gender: normalizedGender === 'male' || normalizedGender === '1' || normalizedGender === '男' ? 'male' : normalizedGender === 'female' || normalizedGender === '2' || normalizedGender === '女' ? 'female' : '',
      gender_text: normalizedGender === 'male' || normalizedGender === '1' || normalizedGender === '男' ? '男' : normalizedGender === 'female' || normalizedGender === '2' || normalizedGender === '女' ? '女' : '未填写',
      age,
      height: profile.height || null,
      is_student: !!profile.isStudent,
      school: profile.school || userProfile.school || '',
      grade: profile.grade || userProfile.grade || '',
      major: profile.major || userProfile.major || '',
      work: profile.work || '',
      cp_declaration: profile.bio || userProfile.bio || '',
      bio: profile.bio || userProfile.bio || '',
      hobbies: this.normalizeDatingTags(profile.hobbies || profile.tags),
      personality_tags: this.normalizeDatingTags(profile.personalityTags),
      visibility: profile.visibility || 'region',
      audit_status: profile.auditStatus,
      audit_status_text: this.formatDatingStatus(profile.auditStatus),
      audit_remark: profile.auditRemark || '',
      is_open: !!profile.isOpen,
      liked_count: profile.likedCount || 0,
      matched_count: profile.matchedCount || 0,
      distance_text: '同区域',
      last_active: profile.lastActiveAt || profile.updatedAt || profile.createdAt,
      is_self: viewerId ? profile.userId === viewerId : false,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    };
  }

  private async ensureDatingConfig(regionId?: string) {
    const cleanRegionId = this.cleanDatingId(regionId);
    if (!cleanRegionId) return null;
    const region = await this.prisma.region.findUnique({
      where: { id: cleanRegionId },
      select: { id: true, name: true },
    });
    if (!region) return null;
    return this.prisma.datingConfig.upsert({
      where: { regionId: cleanRegionId },
      create: {
        regionId: cleanRegionId,
        isOpen: true,
        dailyMatchLimit: 10,
        requireAudit: true,
        requireStudentAuth: false,
        enableWhoLikedMe: true,
        enablePaidPackage: true,
        profileReviewMode: 'manual',
      } as any,
      update: {},
      include: { region: { select: { id: true, name: true } } },
    });
  }

  private formatDatingConfig(config: any, regionId?: string) {
    return {
      id: config?.id || '',
      region_id: config?.regionId || regionId || '',
      region_name: config?.region?.name || '',
      is_open: config?.isOpen ?? true,
      daily_match_limit: config?.dailyMatchLimit ?? 10,
      require_audit: config?.requireAudit ?? true,
      require_student_auth: config?.requireStudentAuth ?? false,
      enable_who_liked_me: config?.enableWhoLikedMe ?? true,
      enable_paid_package: config?.enablePaidPackage ?? true,
      ai_recommend_enabled: config?.aiRecommendEnabled ?? false,
      profile_review_mode: config?.profileReviewMode || 'manual',
      price: Number(config?.price || 0),
      match_rules: config?.matchRules || {},
    };
  }

  private async getDatingQuotaSnapshot(userId: string, regionId?: string) {
    const config = await this.ensureDatingConfig(regionId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyLimit = config?.dailyMatchLimit ?? 10;
    const dailyUsed = await this.prisma.match.count({
      where: {
        userId,
        status: { in: ['PENDING', 'MATCHED'] as any },
        createdAt: { gte: today },
      },
    });
    const quota = await this.prisma.datingQuota.upsert({
      where: { userId },
      create: { userId, remainingCount: 0, totalPurchased: 0, usedPurchased: 0 },
      update: {},
    });
    const freeRemaining = Math.max(0, dailyLimit - dailyUsed);
    return {
      daily_limit: dailyLimit,
      daily_used: dailyUsed,
      free_remaining: freeRemaining,
      paid_remaining: quota.remainingCount,
      remaining_matches: freeRemaining + quota.remainingCount,
      total_purchased: quota.totalPurchased,
      used_purchased: quota.usedPurchased,
      config: this.formatDatingConfig(config, regionId),
    };
  }

  async getDatingConfig(regionId: string) {
    const config = await this.ensureDatingConfig(regionId);
    return {
      success: true,
      data: this.formatDatingConfig(config, regionId),
      message: config ? '对象匹配配置已获取' : '当前区域暂未配置对象匹配',
    };
  }

  async getDatingProfile(userId: string) {
    const profile = await this.prisma.datingProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            uid: true,
            nickname: true,
            avatar: true,
            profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } },
          },
        },
        region: { select: { id: true, name: true } },
      },
    });
    const quota = await this.getDatingQuotaSnapshot(userId, profile?.regionId || undefined);
    return {
      success: true,
      data: {
        profile: this.formatDatingProfile(profile, userId),
        quota,
      },
    };
  }

  async createOrUpdateDatingProfile(userId: string, dto: any) {
    const regionId = this.cleanDatingId(dto.region_id || dto.regionId);
    if (!regionId) throw new BadRequestException('请先选择区域后再完善对象匹配资料');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '编辑对象匹配资料');
    const config = await this.ensureDatingConfig(regionId);
    if (!config || !config.isOpen) throw new BadRequestException('当前区域暂未开启对象匹配');
    if (config?.requireStudentAuth) {
      const verified = await this.prisma.studentVerify.findUnique({ where: { userId }, select: { status: true } });
      if (verified?.status !== 'APPROVED') throw new BadRequestException('当前区域要求先完成学生认证后才能使用对象匹配');
    }

    const autoApprove = config && (!config.requireAudit || config.profileReviewMode === 'auto' || config.profileReviewMode === 'auto_approve');
    const auditStatus = autoApprove ? 'approved' : 'pending';
    const photos = this.asArray(dto.photos || dto.images).filter(Boolean);
    const data: any = {
      regionId: regionId || null,
      displayName: dto.display_name || dto.displayName || dto.name || null,
      gender: dto.gender || null,
      birthYear: dto.birth_year || dto.birthYear ? Number(dto.birth_year || dto.birthYear) : null,
      height: dto.height ? Number(dto.height) : null,
      isStudent: this.asBoolean(dto.is_student ?? dto.isStudent, false),
      school: dto.school || null,
      grade: dto.grade || null,
      major: dto.major || null,
      work: dto.work || null,
      longitude: dto.longitude ? Number(dto.longitude) : null,
      latitude: dto.latitude ? Number(dto.latitude) : null,
      photos,
      bio: dto.cp_declaration || dto.bio || dto.description || '',
      tags: this.normalizeDatingTags(dto.tags || dto.hobbies),
      hobbies: this.normalizeDatingTags(dto.hobbies || dto.tags),
      personalityTags: this.normalizeDatingTags(dto.personality_tags || dto.personalityTags),
      visibility: dto.visibility || 'region',
      isOpen: this.asBoolean(dto.is_open ?? dto.isOpen, true),
      auditStatus,
      auditRemark: autoApprove ? '' : '资料已提交，等待运营审核',
      lastActiveAt: new Date(),
    };

    const profile = await this.prisma.datingProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      include: {
        user: {
          select: {
            id: true,
            uid: true,
            nickname: true,
            avatar: true,
            profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } },
          },
        },
        region: { select: { id: true, name: true } },
      },
    });
    return {
      success: true,
      data: { profile: this.formatDatingProfile(profile, userId) },
      message: auditStatus === 'approved' ? '资料已保存，已开始推荐' : '资料已提交，等待运营审核',
    };
  }

  async getDatingProfileList(viewerId: string, query: any) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || query.pageSize || 20)));
    const regionId = this.cleanDatingId(query.region_id || query.regionId);
    const config = regionId ? await this.ensureDatingConfig(regionId) : null;
    const quota = await this.getDatingQuotaSnapshot(viewerId, regionId);
    if (regionId && (!config || !config.isOpen)) {
      return {
        success: true,
        data: {
          profiles: [],
          pagination: {
            current_page: page,
            per_page: limit,
            total_count: 0,
            total_pages: 1,
          },
          quota,
        },
        message: '当前区域暂未开启对象匹配',
      };
    }
    const where: any = {
      isOpen: true,
      auditStatus: 'approved',
      userId: { not: viewerId },
    };
    if (regionId) {
      where.OR = [{ regionId }, { visibility: 'all' }];
    }
    if (query.gender) where.gender = String(query.gender);
    if (query.is_student === 1 || query.is_student === '1' || query.is_student === true) where.isStudent = true;
    if (query.min_height || query.max_height) {
      where.height = {};
      if (query.min_height) where.height.gte = Number(query.min_height);
      if (query.max_height) where.height.lte = Number(query.max_height);
    }
    if (query.min_age || query.max_age) {
      const year = new Date().getFullYear();
      where.birthYear = {};
      if (query.min_age) where.birthYear.lte = year - Number(query.min_age);
      if (query.max_age) where.birthYear.gte = year - Number(query.max_age);
    }

    const [blockRows, actedRows] = await Promise.all([
      this.prisma.block.findMany({
        where: { OR: [{ userId: viewerId }, { blockedId: viewerId }] },
        select: { userId: true, blockedId: true },
      }),
      this.prisma.match.findMany({
        where: { userId: viewerId },
        select: { targetId: true },
      }),
    ]);
    const excludedUserIds = new Set<string>([viewerId]);
    blockRows.forEach((row) => {
      excludedUserIds.add(row.userId === viewerId ? row.blockedId : row.userId);
    });
    if (!this.asBoolean(query.include_seen, false)) {
      actedRows.forEach((row) => excludedUserIds.add(row.targetId));
    }
    where.userId = { notIn: Array.from(excludedUserIds) };

    const [list, total] = await Promise.all([
      this.prisma.datingProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastActiveAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              uid: true,
              nickname: true,
              avatar: true,
              profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } },
            },
          },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.datingProfile.count({ where }),
    ]);

    return {
      success: true,
      data: {
        profiles: list.map((item) => this.formatDatingProfile(item, viewerId)),
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
        },
        quota,
      },
    };
  }

  async datingMatchAction(userId: string, dto: any) {
    const targetId = this.cleanDatingId(dto.target_user_id || dto.targetId || dto.target_id);
    if (!targetId) throw new BadRequestException('请选择要匹配的用户');
    if (targetId === userId) throw new BadRequestException('不能匹配自己');
    const rawAction = String(dto.match_type || dto.action || 'like').toLowerCase();
    const action = ['pass', 'skip', 'reject', 'nope'].includes(rawAction) ? 'pass' : 'like';
    const regionId = this.cleanDatingId(dto.region_id || dto.regionId);
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '使用对象匹配');
    const config = regionId ? await this.ensureDatingConfig(regionId) : null;
    if (regionId && (!config || !config.isOpen)) throw new BadRequestException('当前区域暂未开启对象匹配');

    const targetProfile = await this.prisma.datingProfile.findUnique({
      where: { userId: targetId },
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true, profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } } } },
      },
    });
    if (!targetProfile || !targetProfile.isOpen || targetProfile.auditStatus !== 'approved') {
      throw new BadRequestException('该用户暂时不能匹配');
    }

    const block = await this.prisma.block.findFirst({
      where: { OR: [{ userId, blockedId: targetId }, { userId: targetId, blockedId: userId }] },
      select: { id: true },
    });
    if (block) throw new BadRequestException('你们之间存在屏蔽关系，不能继续匹配');

    if (action === 'pass') {
      await this.prisma.$transaction([
        this.prisma.match.upsert({
          where: { userId_targetId: { userId, targetId } },
          update: { status: 'REJECTED' as any, matchType: 'interest', regionId, actionSource: 'mini_program' },
          create: { userId, targetId, status: 'REJECTED' as any, matchType: 'interest', regionId, actionSource: 'mini_program' },
        }),
        this.prisma.match.updateMany({
          where: { userId: targetId, targetId: userId, status: 'PENDING' as any },
          data: { status: 'REJECTED' as any, actionSource: 'mini_program' },
        }),
      ]);
      return { success: true, data: { action: 'pass' }, message: '已跳过' };
    }

    const quota = await this.getDatingQuotaSnapshot(userId, regionId);
    const existing = await this.prisma.match.findUnique({ where: { userId_targetId: { userId, targetId } } });
    if (!existing || existing.status === 'REJECTED') {
      if (quota.free_remaining <= 0 && quota.paid_remaining <= 0) {
        throw new BadRequestException('今日喜欢次数已用完，可以购买匹配次数后继续使用');
      }
      if (quota.free_remaining <= 0) {
        await this.prisma.datingQuota.update({
          where: { userId },
          data: { remainingCount: { decrement: 1 }, usedPurchased: { increment: 1 } },
        });
      }
    }

    const reverse = await this.prisma.match.findUnique({ where: { userId_targetId: { userId: targetId, targetId: userId } } });
    const isMutual = reverse?.status === 'PENDING' || reverse?.status === 'MATCHED';
    const now = new Date();
    const status = isMutual ? 'MATCHED' : 'PENDING';
    await this.prisma.$transaction([
      this.prisma.match.upsert({
        where: { userId_targetId: { userId, targetId } },
        update: { status: status as any, matchType: 'interest', regionId, actionSource: 'mini_program', matchedAt: isMutual ? now : null },
        create: { userId, targetId, status: status as any, matchType: 'interest', regionId, actionSource: 'mini_program', matchedAt: isMutual ? now : null },
      }),
      ...(isMutual
        ? [
            this.prisma.match.update({
              where: { userId_targetId: { userId: targetId, targetId: userId } },
              data: { status: 'MATCHED' as any, matchedAt: now },
            }),
            this.prisma.datingProfile.update({ where: { userId }, data: { matchedCount: { increment: 1 } } }),
            this.prisma.datingProfile.update({ where: { userId: targetId }, data: { matchedCount: { increment: 1 } } }),
          ]
        : [this.prisma.datingProfile.update({ where: { userId: targetId }, data: { likedCount: { increment: 1 } } })]),
    ]);

    const nextQuota = await this.getDatingQuotaSnapshot(userId, regionId);
    return {
      success: true,
      data: {
        action: 'like',
        is_mutual: isMutual,
        remaining_matches: nextQuota.remaining_matches,
        quota: nextQuota,
        target_user: this.formatDatingProfile(targetProfile, userId),
      },
      message: isMutual ? '你们互相喜欢了，可以开始聊天' : '已喜欢，等对方回应',
    };
  }

  async getDatingPackages(query: any) {
    const regionId = this.cleanDatingId(query.region_id || query.regionId);
    const config = regionId ? await this.ensureDatingConfig(regionId) : null;
    if (regionId && config?.enablePaidPackage === false) {
      return { success: true, data: { packages: [] }, message: '当前区域未开启对象匹配套餐' };
    }
    const where: any = {};
    if (regionId) where.OR = [{ regionId }, { regionId: null }];
    const list = await this.prisma.datingPackage.findMany({
      where,
      include: { region: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return {
      success: true,
      data: {
        packages: list.map((item) => ({
          id: item.id,
          package_name: item.name,
          name: item.name,
          current_price: Number(item.price || 0),
          original_price: Number((item.rights as any)?.original_price || item.price || 0),
          match_count: item.matchCount,
          validity_days: item.validDays,
          description: item.description || '',
          bonus_description: item.description || `${item.matchCount} 次喜欢机会`,
          is_hot: !!(item.rights as any)?.is_hot,
          is_recommended: !!(item.rights as any)?.is_recommended,
          region_id: item.regionId,
          region_name: item.region?.name || '全部区域',
        })),
      },
    };
  }

  async createDatingOrder(userId: string, dto: any) {
    const packageId = this.cleanDatingId(dto.package_id || dto.packageId);
    if (!packageId) throw new BadRequestException('请选择匹配套餐');
    const pkg = await this.prisma.datingPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('匹配套餐不存在');
    const regionId = this.cleanDatingId((pkg as any).regionId || dto.region_id || dto.regionId);
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '购买对象匹配套餐');
    const config = regionId ? await this.ensureDatingConfig(regionId) : null;
    if (regionId && config?.enablePaidPackage === false) throw new BadRequestException('当前区域未开启对象匹配套餐');
    const payType = String(dto.pay_type || dto.payType || 'balance');
    const amount = Number(pkg.price || 0);
    const orderNo = `DAT${Date.now()}${Math.floor(Math.random() * 1000)}`;

    if (amount <= 0 || payType === 'balance') {
      const result = await this.prisma.$transaction(async (tx) => {
        if (amount > 0) {
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet || Number(wallet.balance) < amount) throw new BadRequestException('余额不足，请先充值');
          const nextBalance = Number(wallet.balance) - amount;
          await tx.wallet.update({
            where: { userId },
            data: { balance: { decrement: amount }, totalOut: { increment: amount } },
          });
          await tx.walletTransaction.create({
            data: {
              userId,
              type: 'PAY',
              amount,
              balance: nextBalance,
              channel: 'BALANCE',
              orderNo,
              description: `对象匹配套餐：${pkg.name}`,
              status: 'SUCCESS',
            } as any,
          });
        }
        const order = await tx.datingOrder.create({
          data: { userId, packageId, amount, orderNo, status: 'paid', payChannel: amount > 0 ? 'balance' : 'free', payTime: new Date() },
          include: { package: true },
        });
        const quota = await tx.datingQuota.upsert({
          where: { userId },
          create: { userId, remainingCount: pkg.matchCount, totalPurchased: pkg.matchCount, usedPurchased: 0 },
          update: { remainingCount: { increment: pkg.matchCount }, totalPurchased: { increment: pkg.matchCount } },
        });
        return { order, quota };
      });
      return {
        success: true,
        data: {
          order_id: result.order.id,
          order_number: result.order.orderNo,
          total_amount: amount,
          status: result.order.status,
          quota: result.quota,
        },
        message: '购买成功，匹配次数已到账',
      };
    }

    const order = await this.prisma.datingOrder.create({ data: { userId, packageId, amount, orderNo, status: 'pending', payChannel: payType } });
    return {
      success: true,
      data: {
        order_id: order.id,
        order_number: order.orderNo,
        total_amount: amount,
        status: order.status,
        requires_payment: true,
      },
      message: '订单已创建，请继续完成支付',
    };
  }

  async getMyDatingMatches(userId: string, query: any) {
    const regionId = this.cleanDatingId(query.region_id || query.regionId);
    const matchScope = regionId ? { regionId } : {};
    const [matchedRows, likedMeRows, sentRows, quota] = await Promise.all([
      this.prisma.match.findMany({
        where: { ...matchScope, OR: [{ userId }, { targetId: userId }], status: 'MATCHED' as any },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true, profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } }, datingProfile: true } },
          target: { select: { id: true, uid: true, nickname: true, avatar: true, profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } }, datingProfile: true } },
        },
      }),
      this.prisma.match.findMany({
        where: { ...matchScope, targetId: userId, status: 'PENDING' as any },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, uid: true, nickname: true, avatar: true, profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } }, datingProfile: true } } },
      }),
      this.prisma.match.findMany({
        where: { ...matchScope, userId, status: 'PENDING' as any },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { target: { select: { id: true, uid: true, nickname: true, avatar: true, profile: { select: { gender: true, birthday: true, school: true, major: true, grade: true, bio: true } }, datingProfile: true } } },
      }),
      this.getDatingQuotaSnapshot(userId, regionId),
    ]);
    const toOtherProfile = (row: any) => {
      const other = row.userId === userId ? row.target : row.user;
      return this.formatDatingProfile({ ...(other.datingProfile || {}), userId: other.id, user: other }, userId);
    };
    return {
      success: true,
      data: {
        matches: matchedRows.map(toOtherProfile).filter(Boolean),
        liked_me: quota.config?.enable_who_liked_me === false
          ? []
          : likedMeRows.map((row: any) => this.formatDatingProfile({ ...(row.user.datingProfile || {}), userId: row.user.id, user: row.user }, userId)).filter(Boolean),
        sent_likes: sentRows.map((row: any) => this.formatDatingProfile({ ...(row.target.datingProfile || {}), userId: row.target.id, user: row.target }, userId)).filter(Boolean),
        quota,
      },
    };
  }

  async reportDatingUser(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '举报对象匹配用户');
    const targetId = this.cleanDatingId(dto.target_user_id || dto.targetId || dto.target_id);
    if (!targetId || targetId === userId) throw new BadRequestException('举报对象不正确');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new BadRequestException('举报对象不存在');
    const report = await this.prisma.datingReport.create({
      data: {
        reporterId: userId,
        targetId,
        reason: dto.reason || '其他问题',
        detail: dto.detail || dto.content || '',
        images: this.asArray(dto.images),
        status: 'pending',
      },
    });
    return { success: true, data: { report_id: report.id }, message: '已提交举报，运营会尽快处理' };
  }

  async blockDatingUser(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '屏蔽对象匹配用户');
    const targetId = this.cleanDatingId(dto.target_user_id || dto.targetId || dto.target_id);
    if (!targetId || targetId === userId) throw new BadRequestException('屏蔽对象不正确');
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { userId_blockedId: { userId, blockedId: targetId } },
        create: { userId, blockedId: targetId },
        update: {},
      }),
      this.prisma.match.updateMany({
        where: { OR: [{ userId, targetId }, { userId: targetId, targetId: userId }] },
        data: { status: 'REJECTED' as any },
      }),
    ]);
    return { success: true, message: '已屏蔽，对方不会再出现在推荐里' };
  }

  // ========== 团购 ==========
  async getGroupBuyPackages(query: any) {
    return this.prisma.groupBuyPackage.findMany({ where: { status: 'active' } });
  }

  async createGroupBuyOrder(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '参与团购');
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '发起社区缴费');
    return this.prisma.communityPayment.create({ data: { userId, communityId: dto.community_id, amount: dto.amount } });
  }

  // ========== 用户头衔 ==========
  private toMiniUserTitle(titleOrRecord: any, maybeRecord?: any) {
    const record = maybeRecord || (titleOrRecord?.title ? titleOrRecord : null);
    const title = record?.title || titleOrRecord;
    if (!title) return null;
    const image = title.image || title.icon || '';
    const claimedAt = record?.claimedAt || null;
    return {
      ...title,
      id: title.id,
      title_id: title.id,
      titleId: title.id,
      title_name: title.name || '',
      titleName: title.name || '',
      name: title.name || '',
      title_image_url: image,
      titleImageUrl: image,
      icon: title.icon || '',
      image: title.image || '',
      description: title.description || '',
      condition: title.condition || '',
      type: title.type || 'title',
      region_id: title.regionId || null,
      regionId: title.regionId || null,
      background_color: title.backgroundColor || '',
      backgroundColor: title.backgroundColor || '',
      text_color: title.textColor || '',
      textColor: title.textColor || '',
      border_color: title.borderColor || '',
      borderColor: title.borderColor || '',
      style: title.style || null,
      sort_order: title.sortOrder || 0,
      sortOrder: title.sortOrder || 0,
      is_enabled: title.isEnabled !== false ? 1 : 0,
      isEnabled: title.isEnabled !== false,
      is_claimed: !!record,
      is_owned: !!record,
      is_wearing: !!record?.isWearing,
      obtained_at: claimedAt,
      obtain_time: claimedAt,
      claimedAt,
      created_at: title.createdAt,
      createdAt: title.createdAt,
      price: 0,
    };
  }

  private buildTitleRegionFilter(regionId: any, includeGlobal = true) {
    const normalized = this.normalizeRegionScope(regionId);
    if (!normalized) return { regionId: null };
    return includeGlobal ? { OR: [{ regionId: normalized }, { regionId: null }] } : { regionId: normalized };
  }

  private async findCurrentTitleRecord(userId: string, regionId?: any) {
    const normalizedRegionId = this.normalizeRegionScope(regionId);
    const titleWhere: any = { isEnabled: true, type: 'title' };
    if (normalizedRegionId) {
      Object.assign(titleWhere, this.buildTitleRegionFilter(normalizedRegionId, true));
    } else {
      titleWhere.regionId = null;
    }
    const records = await this.prisma.userTitleRecord.findMany({
      where: { userId, isWearing: true, title: titleWhere },
      include: { title: true },
      orderBy: [{ claimedAt: 'desc' }],
      take: normalizedRegionId ? 5 : 1,
    });
    if (!normalizedRegionId) return records[0] || null;
    return records.find((record: any) => record?.title?.regionId === normalizedRegionId)
      || records.find((record: any) => !record?.title?.regionId)
      || records[0]
      || null;
  }

  async getUserTitles(query: any) {
    const regionId = query?.regionId || query?.region_id;
    const where: any = { isEnabled: true, type: 'title' };
    if (regionId) Object.assign(where, this.buildTitleRegionFilter(regionId, true));
    if (query?.keyword) where.name = { contains: String(query.keyword) };
    const titles = await this.prisma.userTitle.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return titles.map((title) => this.toMiniUserTitle(title));
  }

  async claimTitle(titleId: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '领取称号');
    const title = await this.prisma.userTitle.findFirst({ where: { id: titleId, isEnabled: true, type: 'title' } });
    if (!title) throw new NotFoundException('称号不存在或已下架');
    const record = await this.prisma.userTitleRecord.upsert({
      where: { userId_titleId: { userId, titleId } },
      create: { userId, titleId },
      update: {},
      include: { title: true },
    });
    return { success: true, data: this.toMiniUserTitle(record), message: '领取成功' };
  }

  async wearTitle(titleId: string, userId: string) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '佩戴称号');
    const existing = await this.prisma.userTitleRecord.findUnique({
      where: { userId_titleId: { userId, titleId } },
      include: { title: true },
    });
    if (!existing) throw new BadRequestException('请先领取该称号');
    if (!existing.title || existing.title.isEnabled === false || existing.title.type !== 'title') {
      throw new BadRequestException('称号不存在或已下架');
    }
    const scopeRegionId = this.normalizeRegionScope(existing.title.regionId);
    await this.prisma.userTitleRecord.updateMany({
      where: {
        userId,
        title: { is: { regionId: scopeRegionId } },
      },
      data: { isWearing: false },
    });
    const record = await this.prisma.userTitleRecord.update({
      where: { userId_titleId: { userId, titleId } },
      data: { isWearing: true },
      include: { title: true },
    });
    return { success: true, data: this.toMiniUserTitle(record), message: '佩戴成功' };
  }

  async unwearTitle(userId: string, regionId?: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '取下称号');
    const record = await this.findCurrentTitleRecord(userId, regionId);
    if (record) {
      await this.prisma.userTitleRecord.update({
        where: { userId_titleId: { userId, titleId: record.titleId } },
        data: { isWearing: false },
      });
    }
    return { success: true };
  }

  async getUserTitlesById(userId: string, query: any = {}) {
    const regionId = query?.regionId || query?.region_id;
    const titleWhere: any = { isEnabled: true, type: 'title' };
    if (regionId) Object.assign(titleWhere, this.buildTitleRegionFilter(regionId, true));
    const records = await this.prisma.userTitleRecord.findMany({
      where: { userId, title: titleWhere },
      include: { title: true },
      orderBy: [{ isWearing: 'desc' }, { claimedAt: 'desc' }],
    });
    return records.map((record) => this.toMiniUserTitle(record)).filter(Boolean);
  }

  async getCurrentTitle(userId: string, regionId?: any) {
    const record = await this.findCurrentTitleRecord(userId, regionId);
    return this.toMiniUserTitle(record);
  }

  async useRedeemCode(userId: string, dto: any) {
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '兑换称号');
    const { code } = dto;
    const redeemCode = await this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
    if (!redeemCode) throw new BadRequestException('兑换码不存在');
    if (redeemCode.usedBy) throw new BadRequestException('兑换码已被使用');
    if (redeemCode.expireAt && new Date(redeemCode.expireAt) < new Date()) throw new BadRequestException('兑换码已过期');
    await this.prisma.userTitleRedeemCode.update({
      where: { id: redeemCode.id },
      data: { usedBy: userId, usedAt: new Date() },
    });
    const record = await this.prisma.userTitleRecord.upsert({
      where: { userId_titleId: { userId, titleId: redeemCode.titleId } },
      create: { userId, titleId: redeemCode.titleId },
      update: {},
      include: { title: true },
    });
    return { success: true, data: this.toMiniUserTitle(record), message: '兑换成功' };
  }

  async getRedeemCodeInfo(code: string) {
    return this.prisma.userTitleRedeemCode.findUnique({ where: { code } });
  }

  // ========== AI ==========
  async getAIConfig() {
    return this.aiRuntime.getSafeConfig();
  }

  async generateAIComments(userId: string, dto: any) {
    const { postId, contentType, regionId, count = 5, tone, persona } = dto;

    const configured = await this.aiRuntime.isConfigured();
    if (!configured) {
      return {
        success: false,
        error: '请先在 AI运营中心 / AI配置 中配置模型密钥和模型名称',
        comments: [],
      };
    }
    const aiOpsConfig = await this.prisma.config.findUnique({
      where: { key: 'ai_ops_config' },
      select: { value: true },
    }).catch(() => null);
    const userDailyLimit = Number((aiOpsConfig?.value as any)?.riskControl?.maxMiniProgramCallsPerUserDay || 20);
    if (userDailyLimit > 0 && userId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const used = await this.prisma.aiCallLog.count({
        where: {
          userId,
          purpose: 'comment_generate',
          createdAt: { gte: today },
        },
      }).catch(() => 0);
      if (used >= userDailyLimit) {
        await this.prisma.aiRiskEvent.create({
          data: {
            eventType: 'mini_program_user_ai_limit',
            level: 'warning',
            regionId: regionId || null,
            detail: { userId, used, limit: userDailyLimit, postId },
          },
        }).catch(() => undefined);
        return { success: false, error: `今日AI生成次数已达上限(${userDailyLimit})`, comments: [] };
      }
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
        source: 'mini_program',
        startedAt: new Date(),
      },
    });

    try {
      let postContext = '';
      let targetPost: { id: string; regionId: string | null; commentCount: number | null } | null = null;
      if (postId) {
        const post = await this.prisma.post.findUnique({
          where: { id: postId },
          select: { id: true, title: true, content: true, regionId: true, commentCount: true },
        });
        if (!post) throw new BadRequestException('目标帖子不存在，无法生成评论');
        targetPost = post;
        if (post) postContext = `帖子标题: ${post.title || ''}\n帖子内容: ${(post.content || '').slice(0, 500)}`;
      }

      const userPrompt = `请为以下内容生成 ${count} 条${tone || '友好'}风格的评论。\n${postContext}\n要求：每条评论独立一行，内容真实自然，像真人写的，不要带序号。`;
      const content = await this.aiRuntime.generateText(userPrompt, {
        systemPrompt: persona || '你是一个校园社区的活跃用户，负责生成自然、真实、克制的评论。',
        type: 'comment_generate',
        source: 'mini_program',
        taskId: task.id,
        botId: botAccount.id,
        userId,
        regionId: regionId || targetPost?.regionId || undefined,
      });
      const comments = content
        .split('\n')
        .map((c: string) => c.replace(/^[-*\d.、\s]+/, '').trim())
        .filter((c: string) => c.length > 0)
        .slice(0, Math.max(1, Number(count) || 5));

      const botUserId = botAccount.userId;

      const savedComments: any[] = [];
      if (postId && comments.length > 0) {
        const targetRegionId = targetPost?.regionId || regionId || null;
        const noteConfig = targetRegionId
          ? await this.prisma.config.findUnique({
              where: { key: this.getNoteSettingConfigKey(targetRegionId) },
              select: { value: true },
            }).catch(() => null)
          : null;
        const commentApprovalType = String((noteConfig?.value as any)?.comment_approval_type || 'none').toLowerCase();
        for (const commentText of comments) {
          try {
            let review = {
              status: 'active',
              auditStatus: 'approved',
              auditReason: '无需审核',
              aiResult: undefined as any,
            };
            if (['ai', 'llm', 'model'].includes(commentApprovalType)) {
              const result = await this.aiRuntime.moderateContent({
                type: 'comment',
                content: commentText,
                regionId: targetRegionId,
                approvalType: commentApprovalType,
              });
              review = {
                status: result.decision === 'approve' ? 'active' : 'hidden',
                auditStatus: result.decision === 'approve' ? 'approved' : result.decision === 'reject' ? 'rejected' : 'pending',
                auditReason: result.reason || (result.decision === 'approve' ? 'AI审核通过' : 'AI建议人工复核'),
                aiResult: result,
              };
            } else if (!['none', 'auto', 'pass', 'published', 'approved'].includes(commentApprovalType)) {
              review = {
                status: 'hidden',
                auditStatus: 'pending',
                auditReason: '等待人工审核',
                aiResult: undefined,
              };
            }
            const comment = await this.prisma.$transaction(async (tx) => {
              const created = await tx.comment.create({
                data: {
                  postId,
                  userId: botUserId || 'system',
                  content: commentText,
                  status: review.status,
                  auditStatus: review.auditStatus,
                  auditReason: review.auditReason,
                },
              });
              if (review.status === 'active' && review.auditStatus === 'approved') {
                await tx.post.update({
                  where: { id: postId },
                  data: { commentCount: { increment: 1 } },
                });
              }
              return created;
            });
            if (review.aiResult) {
              await this.aiRuntime.recordModeration({
                targetType: 'comment',
                targetId: comment.id,
                userId: botUserId || null,
                regionId: targetRegionId,
                approvalType: commentApprovalType,
                result: review.aiResult,
                finalStatus: review.auditStatus,
              });
            }
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
          completedAt: new Date(),
          content,
          aiResult: content,
          isAiGenerated: true,
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
        data: { status: 'failed', failReason: errorMsg, completedAt: new Date() },
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
