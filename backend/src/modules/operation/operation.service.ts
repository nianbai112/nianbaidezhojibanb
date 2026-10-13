import { GroupBuyConsumerService } from '../group-buy/group-buy.consumer.service';
import { createHash } from 'crypto';
import { readRiderRanking } from './rider-ranking';
import { canStartWechatPayment } from '../../common/payment-client';
import { effectiveStudentIdentity, identityInclude } from '../student-identity/student-identity.policy';
import { reserveCouponIssue, couponDiscountAmount } from '../../common/coupon-policy';
import { agreementContentHash, findPublishedAgreement, normalizeAgreementRegion, normalizeAgreementType, recordAgreementConsents } from '../../common/agreement-consent';
import { readUserGuidanceTags } from '../../common/user-guidance-tags';
import { isMiniappOpenid } from '../../common/wechat-identity';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { PaymentService } from '../payment/payment.service';
import { MembershipService } from '../membership/membership.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { GrowthService } from '../growth/growth.service';
import { assertErrandGenderChangeAllowed } from '../errand/errand-delivery-requirements';
import { resolveActiveCouponCampaign, assertCouponCampaignRules, lockErrandAssignee } from '../errand/errand-transaction-guards';

@Injectable()
export class OperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly paymentService: PaymentService,
    private readonly membershipService: MembershipService,
    private readonly growthService: GrowthService,
    private readonly userAccess: UserAccessPolicyService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly groupBuy?: GroupBuyConsumerService,
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
      status: receive?.status === 'unused' && new Date(coupon.endAt) < new Date() ? 'expired' : receive?.status || coupon.status,
      user_coupon_status: receive?.status === 'unused' && new Date(coupon.endAt) < new Date() ? 'expired' : receive?.status || coupon.status,
      coupon_status: coupon.status,
      description: coupon.description,
      region_id: coupon.regionId,
      regionId: coupon.regionId,
      merchant_id: coupon.merchantId,
      merchantId: coupon.merchantId,
      business_scope: businessScope,
      businessScope,
      is_universal: businessScope === 'all' && !coupon.merchantId && !coupon.regionId,
      applicable_to_module: businessScope !== 'all' || !!coupon.merchantId || !!coupon.regionId,
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
      is_claimed: userClaimedCount >= limitPerUser,
      has_claimed: userClaimedCount > 0,
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
      status: 'active',
      startAt: { lte: new Date() },
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
      await reserveCouponIssue(tx, id, userId);
      const receive = await tx.couponReceive.create({ data: { couponId: id, userId }, include: { coupon: true } });
      return this.formatUserCoupon(receive);
    }, { isolationLevel: 'ReadCommitted' });
  }

  async getMyCoupons(userId: string, query: any = {}) {
    const status = String(query.status || 'unused').toLowerCase();
    const moduleType = String(query.module || '').toLowerCase();
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(Number(query.limit) || 10)));
    const now = new Date();
    const where: any = { userId };
    if (status !== 'all') where.status = status;
    if (status === 'expired') {
      delete where.status;
      where.OR = [{ status: 'expired' }, { status: 'unused', coupon: { endAt: { lt: now } } }];
    }
    const couponWhere: any = {};
    const scopeMap: Record<string, string[]> = {
      errand: ['all', 'errand'], running: ['all', 'errand'],
      shop: ['all', 'shop'], takeout: ['all', 'shop'], takeaway: ['all', 'shop'],
      mall: ['all', 'mall'], activity: ['all', 'activity'], membership: ['all', 'membership'],
    };
    if (scopeMap[moduleType]) couponWhere.businessScope = { in: scopeMap[moduleType] };
    const regionId = String(query.region_id || query.regionId || '').trim();
    const merchantId = String(query.merchant_id || query.merchantId || '').trim();
    const amount = query.amount ?? query.goods_amount;
    const contexts: any[] = [];
    if (regionId) contexts.push({ OR: [{ regionId: null }, { regionId }] });
    if (merchantId) contexts.push({ OR: [{ merchantId: null }, { merchantId }] });
    if (contexts.length) couponWhere.AND = contexts;
    if (['mall', 'errand', 'running'].includes(moduleType)) couponWhere.merchantId = null;
    if (status === 'unused') {
      Object.assign(couponWhere, { status: 'active', startAt: { lte: now }, endAt: { gte: now } });
      if (amount !== undefined && Number.isFinite(Number(amount))) couponWhere.minAmount = { lte: Math.max(0, Number(amount)) };
    }
    if (Object.keys(couponWhere).length) where.coupon = couponWhere;
    // Filter campaign eligibility before pagination so earlier unusable coupons cannot hide usable ones.
    const receives = await this.prisma.couponReceive.findMany({ where, include: { coupon: true }, orderBy: { createdAt: 'desc' } });
    const checks = new Map<string, Promise<boolean>>();
    const orderType = ['errand', 'running'].includes(moduleType) ? 'errand' : 'shop';
    const filtered = [];
    for (const receive of receives) {
      if (status === 'unused') {
        if (!checks.has(receive.couponId)) checks.set(receive.couponId, (async () => {
          try {
            const campaign = await resolveActiveCouponCampaign(this.prisma, receive.couponId);
            if (['errand', 'running', 'shop', 'takeout', 'takeaway'].includes(moduleType)) {
              await assertCouponCampaignRules(this.prisma, campaign, userId, receive.couponId,
                amount === undefined ? 0 : couponDiscountAmount(receive.coupon, Number(amount)), orderType);
            }
            return true;
          } catch (error) {
            if (error instanceof BadRequestException) return false;
            throw error;
          }
        })());
        if (!await checks.get(receive.couponId)) continue;
      }
      filtered.push(receive);
    }
    const total = filtered.length;
    return {
      list: filtered.slice((page - 1) * limit, page * limit).map(receive => this.formatUserCoupon(receive)),
      total, page, pageSize: limit,
      pagination: { total, page, current_page: page, per_page: limit, total_pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async redeemCoupon(userId: string, dto: any, ip = '') {
    const code = String(dto?.code || '').trim().toUpperCase();
    const regionId = String(dto?.region_id || dto?.regionId || '').trim();
    if (!code) throw new BadRequestException('请输入兑换码');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '兑换卡券');
    return this.prisma.$transaction(async (tx) => {
      const lockedCode = await tx.couponRedeemCode.updateMany({ where: { code }, data: { usedCount: { increment: 0 } } });
      if (lockedCode.count !== 1) throw new BadRequestException('兑换码不存在或已失效');
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
      await reserveCouponIssue(tx, coupon.id, userId);
      const reserved = await tx.couponRedeemCode.updateMany({
        where: { id: redeemCode.id, status: 'active', usedCount: redeemCode.usedCount,
          totalLimit: { gt: redeemCode.usedCount }, perUserLimit: redeemCode.perUserLimit },
        data: { usedCount: { increment: 1 } },
      });
      if (reserved.count !== 1) throw new BadRequestException('兑换码状态已变化，请刷新后重试');
      const receive = await tx.couponReceive.create({ data: { couponId: coupon.id, userId }, include: { coupon: true } });
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
    }, { isolationLevel: 'ReadCommitted' });
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
    const { clientRequestId: _requestId, clientPayloadHash: _payloadHash, ...publicItem } = item || {};
    return {
      ...publicItem,
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
    const clientRequestId = dto.client_request_id == null ? null : String(dto.client_request_id).trim();
    if (clientRequestId != null && !/^[A-Za-z0-9_-]{8,100}$/.test(clientRequestId)) throw new BadRequestException('发布请求标识无效');
    const payload = { regionId, title, description, images, price, originPrice, deliveryType, location, category: this.textValue(dto?.category, '闲置'), condition: this.textValue(dto?.condition, 'good'), tags: this.jsonArray(dto?.tags), freight: deliveryType === '运费到付' ? this.moneyValue(dto?.freight) : 0, syncToFeed: dto?.sync_to_feed === true || dto?.sync_to_feed === 1 || dto?.syncToFeed === true || dto?.syncToFeed === 1 };
    const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value != null && typeof value === 'object' ? Object.keys(value).sort().reduce((result: any, key: string) => { result[key] = stable(value[key]); return result; }, {}) : value;
    const clientPayloadHash = clientRequestId ? createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex') : null;
    const replay = async () => {
      if (!clientRequestId) return null;
      const old = await this.prisma.secondHand.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId } }, include: { user: { select: { id: true, uid: true, nickname: true, avatar: true } }, region: { select: { id: true, name: true } } } });
      if (!old) return null;
      if (old.status === 'DELETED' as any) throw new NotFoundException('商品不存在');
      if (old.clientPayloadHash !== clientPayloadHash) throw new ConflictException('同一发布请求内容已变化，请重新发起发布');
      const mapped = this.mapSecondHandProduct(old, setting);
      return { success: true, idempotent_replay: true, message: old.status === 'PENDING' ? '商品已提交，请留意审核结果' : '商品已提交', data: mapped, ...mapped };
    };
    const previous = await replay();
    if (previous) return previous;
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

    const risk = await this.detectSecondHandPublishRisk({ title, description, images });
    const hasAuditPriority = await this.hasMemberBenefit(userId, 'content_audit_priority');
    const status = setting.requireAudit || risk.hasRisk ? 'PENDING' : 'ON_SALE';
    const auditReason = risk.hasRisk ? risk.reason : setting.requireAudit ? '等待后台审核' : null;

    let item: any;
    try { item = await this.prisma.secondHand.create({
      data: {
        userId,
        regionId,
        ...(clientRequestId ? { clientRequestId, clientPayloadHash } : {}),
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
    } catch (error: any) { if (clientRequestId && error?.code === 'P2002') { const old = await replay(); if (old) return old; }; throw error; }
    if (status === 'PENDING') {
      await this.writeSecondHandAuditRecord(item, status, hasAuditPriority ? '会员优先审核：' + (auditReason || '等待后台审核') : auditReason || '等待后台审核');
    }
    if (payload.syncToFeed) {
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
    const product = await this.prisma.secondHand.findUnique({where:{id:productId}});
    if (!product) throw new NotFoundException('商品不存在');
    if (product.userId===userId) throw new BadRequestException('不能购买自己发布的商品');
    await this.userAccess.assertStudentProtectedAction(userId,product.regionId,'购买二手闲置');
    const setting=await this.loadSecondHandRegionSetting(product.regionId);
    if(!setting.enableSecondHand)throw new ForbiddenException('当前区域暂未开放二手交易');
    const allowOnlinePayment=!!setting.enableOnlinePayment&&product.deliveryType==='包邮';
    const user=allowOnlinePayment?await this.prisma.user.findUnique({where:{id:userId},select:{openid:true}}):null;
    if(allowOnlinePayment&&!canStartWechatPayment(user?.openid))throw new BadRequestException('当前账号无法发起微信支付');
    // 锁商品行后查重，两个并发请求不能为同一买家创建两张待付单。
    const created=await this.prisma.$transaction(async tx=>{
      await tx.secondHand.updateMany({where:{id:productId},data:{wantCount:{increment:0}}});
      const active=await tx.secondHandOrder.findFirst({where:{buyerId:userId,productId,status:{in:['contacting','pending_pay','paid','shipped']}},orderBy:{createdAt:'desc'}});
      if(active)return {order:active,duplicated:true};
      const current=await tx.secondHand.findUniqueOrThrow({where:{id:productId}});
      if(current.status!=='ON_SALE')throw new BadRequestException('该商品当前不能交易');
      if(!Number.isFinite(Number(current.price))||Number(current.price)<=0)throw new BadRequestException('商品价格无效');
      const order=await tx.secondHandOrder.create({data:{orderNo:`SH${Date.now()}${createHash('sha256').update(userId+productId+Math.random()).digest('hex').slice(0,12)}`,buyerId:userId,userId,sellerId:current.userId,productId,price:current.price,status:allowOnlinePayment?'pending_pay':'contacting',shippingAddress:this.jsonObject(dto?.shippingAddress||dto?.shipping_address),remark:this.textValue(dto?.remark)}});
      await tx.secondHand.update({where:{id:productId},data:{wantCount:{increment:1}}});
      return {order,duplicated:false};
    });
    const {order,duplicated}=created;
    if(order.status!=='pending_pay')return {success:true,message:order.status==='contacting'?'已记录交易意向，请与卖家确认交易安排':'已有进行中的交易，请到我的闲置查看',contactRequired:order.status==='contacting',paymentInfo:null,order,duplicated};
    if(!allowOnlinePayment)throw new BadRequestException('当前区域已暂停在线支付，请处理原待支付订单');
    const paymentInfo=await this.paymentService.wxUnifiedOrder({bizType:'second_hand',bizId:order.id,orderNo:order.orderNo,amount:Number(order.price),description:`二手闲置 ${product.title}`,openid:user!.openid,userId});
    const current=await this.prisma.secondHandOrder.findUniqueOrThrow({where:{id:order.id}});
    if(current.status!=='pending_pay')throw new ConflictException('订单状态已变化，请刷新本人订单，勿继续支付');
    return {success:true,message:'请完成原订单支付',contactRequired:false,paymentInfo,order:current,duplicated};
  }

  async getMySecondHandProducts(userId: string, query: any) {
    const { page, pageSize, skip } = this.getPaging(query);
    const status = this.textValue(query?.status);
    const where: any = { userId };
    if(query?.region_id||query?.regionId)where.regionId=this.textValue(query.region_id||query.regionId);
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
    if(query?.region_id||query?.regionId){
      const products=await this.prisma.secondHand.findMany({where:{regionId:this.textValue(query.region_id||query.regionId)},select:{id:true}});
      where.productId={in:products.map(item=>item.id)};
    }
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
      // 与付款回调保持相同锁顺序：支付单 -> 业务单 -> 商品。
      if(status==='cancelled'&&order.status==='pending_pay'){
        await tx.paymentOrder.updateMany({where:{bizType:'second_hand',bizId:id,status:{in:['pending','paying','failed','closed']}},data:{status:'closed'}});
        const paid=await tx.paymentOrder.findFirst({where:{bizType:'second_hand',bizId:id,status:{in:['paid','refunding','refunded']}}});
        if(paid)throw new ConflictException('支付状态已变化，请刷新订单');
      }
      const claimed=await tx.secondHandOrder.updateMany({where:{id,status:order.status},data:{status,remark:this.textValue(dto?.remark,order.remark||'')}});
      if(claimed.count!==1)throw new ConflictException('订单状态已变化，请刷新订单');
      if(status==='completed'&&order.status==='contacting'){
        const sold=await tx.secondHand.updateMany({where:{id:order.productId,status:'ON_SALE'},data:{status:'SOLD'}});
        if(sold.count!==1)throw new ConflictException('商品已完成其他交易，不能重复确认');
      }
      const next=await tx.secondHandOrder.findUniqueOrThrow({where:{id}});
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

  private isStudentApproved(user: any, regionId: string) {
    return effectiveStudentIdentity(user?.studentVerify, user?.id, regionId);
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

  // ========== 评分 ==========
  private ratingPage(query: any) { return {page:this.toInt(query?.page,1,1,1000000),limit:this.toInt(query?.limit,10,1,50)}; }
  private async ratingRegion(userId: string, regionId?: string | null) {
    const profile=await this.prisma.userProfile.findUnique({where:{userId},select:{regionId:true}});
    if(regionId&&profile?.regionId!==regionId)throw new BadRequestException('请切换到评分所属校区');
    const scope=regionId||profile?.regionId;
    if(!scope)throw new BadRequestException('请选择校区');
    const setting=await this.prisma.ratingRegionSetting.findUnique({where:{regionId:scope}});
    if(setting?.enableRating===false)throw new BadRequestException('当前校区评分已关闭');
    await this.userAccess.assertStudentProtectedAction(userId,scope,'参与评分');
    return scope;
  }
  private async publicRatingItem(itemId: string) {
    const item=await this.prisma.ratingItem.findUnique({where:{id:itemId},include:{category:true}});
    if(!item||item.status!=='enabled'||!item.category?.isActive)throw new NotFoundException('评分对象不存在或尚未开放');
    const scope=item.regionId||item.category.regionId;
    const setting=scope?await this.prisma.ratingRegionSetting.findUnique({where:{regionId:scope}}):null;
    if(setting?.enableRating===false)throw new BadRequestException('当前校区评分已关闭');
    return {item,scope,setting};
  }
  async getRatingCategories(regionId: string, query: any) {
    const {page,limit}=this.ratingPage(query),setting=await this.prisma.ratingRegionSetting.findUnique({where:{regionId}});
    if(setting?.enableRating===false)return {list:[],total:0,page,pageSize:limit,rating_disabled:true};
    const where={isActive:true,OR:[{regionId},{regionId:null}]};
    const [rows,total]=await Promise.all([this.prisma.ratingCategory.findMany({where,skip:(page-1)*limit,take:limit,orderBy:[{sortOrder:'asc'},{id:'asc'}],include:{items:{where:{status:'enabled',OR:[{regionId},{regionId:null}]},take:6,orderBy:[{avgScore:'desc'},{sortOrder:'asc'}]}}}),this.prisma.ratingCategory.count({where})]);
    return {list:rows.map(category=>({...category,top_rating_items:category.items.map(item=>({...item,logo:item.cover,score:item.avgScore}))})),total,page,pageSize:limit};
  }
  async getRatingCategoryDetail(categoryId: string) {
    const category=await this.prisma.ratingCategory.findUnique({where:{id:categoryId}});
    if(!category?.isActive)throw new NotFoundException('评分分类未开放');
    return category;
  }
  async getRatingItems(categoryId: string, query: any) {
    const category=await this.getRatingCategoryDetail(categoryId),{page,limit}=this.ratingPage(query);
    const region=category.regionId||String(query?.region_id||'').trim();
    const setting=region?await this.prisma.ratingRegionSetting.findUnique({where:{regionId:region}}):null;
    if(setting?.enableRating===false)throw new BadRequestException('当前校区评分已关闭');
    const where:any={categoryId,status:'enabled',OR:region?[{regionId:region},{regionId:null}]:[{regionId:null}]};
    if(query?.search)where.name={contains:String(query.search).trim().slice(0,100)};
    return this.prisma.ratingItem.findMany({where,skip:(page-1)*limit,take:limit,orderBy:['latest','newest'].includes(query?.sort)?[{createdAt:'desc'},{id:'asc'}]:query?.sort==='low_score'?[{avgScore:'asc'},{id:'asc'}]:query?.sort==='hot'?[{ratingCount:'desc'},{id:'asc'}]:[{avgScore:'desc'},{id:'asc'}]});
  }
  async getRatingItemDetail(itemId: string, userId?: string) {
    const {item,setting}=await this.publicRatingItem(itemId);
    const own=userId?await this.prisma.userRating.findFirst({where:{itemId,userId,status:'active'},orderBy:{createdAt:'desc'},select:{id:true,score:true,content:true,images:true}}):null;
    const distribution=await this.prisma.userRating.groupBy({by:['score'],where:{itemId,status:'active'},_count:{id:true}});
    return {...item,user_rating:own,rating_distribution:distribution.map(x=>({stars:x.score,count:x._count.id})),rating_disabled:false,dynamic_disabled:setting?.enableDynamic===false};
  }
  async getRatingItemDynamics(itemId: string, query: any) {
    const {setting}=await this.publicRatingItem(itemId),{page,limit}=this.ratingPage(query);
    if(setting?.enableDynamic===false)return [];
    return this.prisma.userRating.findMany({where:{itemId,status:'active'},skip:(page-1)*limit,take:limit,orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,itemId:true,score:true,content:true,images:true,likes:true,createdAt:true,User:{select:{id:true,nickname:true,avatar:true}},replies:{where:{status:'approved'},take:5,orderBy:{createdAt:'asc'},select:{id:true,content:true,createdAt:true,user:{select:{id:true,nickname:true,avatar:true}}}}}});
  }
  async submitRating(userId: string, dto: any) {
    const itemId=String(dto.item_id||dto.itemId||''),score=Number(dto.score),content=String(dto.content||'').trim();
    if(!Number.isInteger(score)||score<1||score>5)throw new BadRequestException('评分必须为 1–5 的整数');
    if(content.length>1000)throw new BadRequestException('评价最多 1000 字');
    const images=Array.isArray(dto.images)?dto.images:[];
    if(images.length>6||images.some((x:any)=>typeof x!=='string'||!/^https:\/\//.test(x)||x.length>2000))throw new BadRequestException('图片最多 6 张且必须先上传');
    const {scope}=await this.publicRatingItem(itemId),regionId=await this.ratingRegion(userId,scope);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM rating_items WHERE id = ${itemId} FOR UPDATE`;
      const current=await tx.ratingItem.findUnique({where:{id:itemId},include:{category:true}});
      if(current?.status!=='enabled'||!current.category.isActive)throw new BadRequestException('评分对象已关闭');
      const existing=await tx.userRating.findFirst({where:{userId,itemId,status:'active'},orderBy:{createdAt:'desc'}});
      const data={score,content,images,regionId};
      const rating=existing?await tx.userRating.update({where:{id:existing.id},data}):await tx.userRating.create({data:{...data,userId,itemId,status:'active'}});
      const stats=await tx.userRating.aggregate({where:{itemId,status:'active'},_avg:{score:true},_count:true});
      await tx.ratingItem.update({where:{id:itemId},data:{avgScore:stats._avg.score||0,ratingCount:stats._count}});
      return rating;
    });
  }
  async createRatingItem(userId: string, dto: any) {
    const categoryId=String(dto.categoryId||dto.category_id||''),name=String(dto.name||dto.title||'').trim(),description=String(dto.description||dto.desc||'').trim(),cover=String(dto.cover||dto.logo||'');
    if(!name||name.length>100||description.length>1000)throw new BadRequestException('名称须为 1–100 字，介绍最多 1000 字');
    if(cover&&(!/^https:\/\//.test(cover)||cover.length>2000))throw new BadRequestException('请先上传对象封面');
    const category=await this.getRatingCategoryDetail(categoryId),regionId=await this.ratingRegion(userId,category.regionId);
    return this.prisma.ratingItem.create({data:{categoryId,regionId,name,description,cover,status:'pending'}});
  }
  async getRatingReplies(query: any) {
    const ratingId=String(query?.rating_id||''),{page,limit}=this.ratingPage(query);
    if(!ratingId)throw new BadRequestException('缺少评分编号');
    const rating=await this.prisma.userRating.findUnique({where:{id:ratingId}});
    if(!rating||rating.status!=='active')throw new NotFoundException('评分不存在');
    const {setting}=await this.publicRatingItem(rating.itemId);
    if(setting?.enableDynamic===false)return [];
    return this.prisma.ratingReply.findMany({where:{ratingId,status:'approved'},skip:(page-1)*limit,take:limit,orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,content:true,createdAt:true,user:{select:{id:true,nickname:true,avatar:true}}}});
  }
  async createRatingReply(userId: string, dto: any) {
    const ratingId=String(dto.rating_id||dto.ratingId||''),content=String(dto.content||'').trim();
    if(!content||content.length>500)throw new BadRequestException('回复须为 1–500 字');
    const rating=await this.prisma.userRating.findUnique({where:{id:ratingId}});
    if(!rating||rating.status!=='active')throw new NotFoundException('评分不存在');
    const {scope,setting}=await this.publicRatingItem(rating.itemId);
    if(setting?.enableDynamic===false)throw new BadRequestException('评分动态已关闭');
    await this.ratingRegion(userId,scope);
    return this.prisma.ratingReply.create({data:{ratingId,userId,content,status:'pending'}});
  }

  // ========== 网盘 ==========

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
    const coupon = await reserveCouponIssue(tx, id, userId, 1, { skipIfLimit: true });
    if (!coupon) return null;
    const receive = await tx.couponReceive.create({ data: { couponId: id, userId }, include: { coupon: true } });
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
    const ip = String(requestMeta.ip || '').trim().slice(0, 120);
    const userAgent = String(requestMeta.userAgent || '').trim().slice(0, 500);
    const deviceId = String(dto?.device_id || dto?.deviceId || requestMeta.deviceId || '').trim().slice(0, 160);

    return this.prisma.$transaction(async (tx) => {
      // User locks serialize cross-campus claims; sorted participants avoid inverse-invite deadlocks.
      for (const id of [userId, inviterId].sort()) {
        const locked = await tx.user.updateMany({ where: { id }, data: { authVersion: { increment: 0 } } });
        if (!locked.count) throw new BadRequestException('邀请账号不存在');
      }
      // A per-campaign row lock also serializes budget/IP/device and inviter quotas.
      const campaign = await tx.shareSettings.updateMany({ where: { regionId }, data: { dailyInviteLimit: { increment: 0 } } });
      if (!campaign.count) throw new BadRequestException('当前区域未开启分享奖励');
    const [settings, invitee, inviter, region, couponConfig] = await Promise.all([
      tx.shareSettings.findUnique({ where: { regionId } }),
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true, phone: true, status: true, lastLoginDevice: true, studentVerify: { include: identityInclude } },
      }),
      tx.user.findUnique({
        where: { id: inviterId },
        select: { id: true, createdAt: true, phone: true, status: true, lastLoginDevice: true, studentVerify: { include: identityInclude } },
      }),
      tx.region.findUnique({
        where: { id: regionId },
        select: { id: true, studentOnly: true, onlyStudentAuthUsers: true },
      }),
      tx.config.findUnique({ where: { key: `share_invite_coupon_config_${regionId}` } }),
    ]);
    if (!settings || !settings.isEnabled) throw new BadRequestException('当前区域未开启分享奖励');

    const now = new Date();
    if (settings.startTime && now < settings.startTime) throw new BadRequestException('分享活动未开始');
    if (settings.endTime && now > settings.endTime) throw new BadRequestException('分享活动已结束');

    if (!inviter) throw new BadRequestException('邀请人不存在');
    if (!invitee) throw new BadRequestException('被邀请人不存在');
    if (inviter.status !== 'ACTIVE') throw new BadRequestException('邀请人账号状态异常');
    if (invitee.status !== 'ACTIVE') throw new BadRequestException('被邀请人账号状态异常');

    const existingInvitee = await tx.shareInvite.findFirst({
      where: { inviteeId: userId, status: { in: ['SUCCESS', 'PENDING'] } },
    });
    if (existingInvitee) throw new BadRequestException('该用户已接受过邀请');

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activeRewardStatuses = ['SUCCESS', 'PENDING'] as any[];
    const [todayCount, totalCount] = await Promise.all([
      tx.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } }),
      tx.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses } } }),
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
    if (requireInviterStudent && !this.isStudentApproved(inviter, regionId)) riskReasons.push('邀请人未通过学生认证');
    if (requireInviteeStudent && !this.isStudentApproved(invitee, regionId)) riskReasons.push('被邀请人未通过学生认证');
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
        ? tx.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: cooldownStart } } })
        : Promise.resolve(0),
      settings.maxRecentInvites > 0
        ? tx.shareInvite.count({ where: { inviterId, regionId, status: { in: activeRewardStatuses }, createdAt: { gte: recentStart } } })
        : Promise.resolve(0),
      ip && settings.sameIpDailyLimit > 0
        ? tx.shareInvite.count({ where: { regionId, ip, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } })
        : Promise.resolve(0),
      effectiveDeviceId && settings.sameDeviceDailyLimit > 0
        ? tx.shareInvite.count({ where: { regionId, deviceId: effectiveDeviceId, status: { in: activeRewardStatuses }, createdAt: { gte: todayStart } } })
        : Promise.resolve(0),
      effectiveDeviceId && settings.sameDeviceTotalLimit > 0
        ? tx.shareInvite.count({ where: { regionId, deviceId: effectiveDeviceId, status: { in: activeRewardStatuses } } })
        : Promise.resolve(0),
      tx.shareReward.aggregate({ where: { status: { in: activeRewardStatuses }, invite: { regionId } }, _sum: { amount: true } }),
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
              inviterStudentApproved: this.isStudentApproved(inviter, regionId),
              inviteeStudentApproved: this.isStudentApproved(invitee, regionId),
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
      const inviterCoupon = immediateReward
        ? await this.grantInviteCoupon(tx, inviterId, couponValue.inviterCouponId, '邀请人奖励') : null;
      const inviteeCoupon = immediateReward
        ? await this.grantInviteCoupon(tx, userId, couponValue.inviteeCouponId, '新人奖励') : null;
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
    }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 20000 });
  }

  async getInviteRecords(userId: string, query: any = {}) {
    const page=this.toInt(query.page,1,1,1000000),size=this.toInt(query.page_size,20,1,50),where={inviterId:userId};
    const today=new Date();today.setHours(0,0,0,0);
    const [rows,total,todayCount,reward]=await Promise.all([
      this.prisma.shareInvite.findMany({where,include:{invitee:{select:{id:true,nickname:true,avatar:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*size,take:size}),
      this.prisma.shareInvite.count({where}),this.prisma.shareInvite.count({where:{...where,createdAt:{gte:today}}}),
      this.prisma.shareReward.aggregate({where:{userId,type:'INVITER',status:'SUCCESS',invite:{inviterId:userId}},_sum:{amount:true}})
    ]);
    return {records:rows.map(row=>({id:row.id,invitee:row.invitee,created_at:row.createdAt,reward_amount:this.toNumber(row.rewardAmount,0).toFixed(2),invitee_reward_amount:this.toNumber(row.inviteeRewardAmount,0).toFixed(2),status:row.status==='SUCCESS'?'completed':row.status==='FAILED'?'failed':'pending'})),statistics:{today_invites:todayCount,total_invites:total,total_reward:this.toNumber(reward._sum.amount,0).toFixed(2)},total,page,page_size:size};
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
      return readRiderRanking(this.prisma, query);
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
  async getContacts(query: any, userId = '') {
    const regionId = String(query?.region_id || query?.regionId || '').trim();
    if (!regionId) throw new BadRequestException('请选择学校区域');
    await this.assertContactAccess(regionId, userId);
    const where: any = { isPublic: true, category: { regionId } };
    if (query.category) where.categoryId = String(query.category);
    const keyword = String(query.keyword || '').trim().slice(0, 100);
    if (keyword) where.OR = [{ name: { contains: keyword } }, { phone: { contains: keyword } }];
    const page = this.publicContentPage(query.page, 1, 1000000), limit = this.publicContentPage(query.limit, 20, 50);
    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.contact.count({ where }),
    ]);
    return { success: true, data: { list: list.map(item => ({ ...item, userId: undefined, canEdit: false })), total, page, limit } };
  }

  async getContactCategories(regionId: string) {
    return this.prisma.contactCategory.findMany({ where: { regionId } });
  }

  async getContactDetail(id: string, userId = '') {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { category: { select: { regionId: true } } },
    });
    if (!contact) throw new NotFoundException('联系人不存在');
    // AUD-P1-135: 详情只返回公开联系人，私密联系人需通过 my 接口访问
    if (!contact.isPublic) throw new NotFoundException('联系人不存在');
    if (!contact.category?.regionId) throw new NotFoundException('联系人缺少有效学校区域');
    await this.assertContactAccess(contact.category.regionId, userId);
    return { success: true, data: contact };
  }

  private async contactWriteCategory(userId: string, dto: any, previousRegion = '') {
    const categoryId = String(dto.categoryId || dto.category || '').trim();
    if (!categoryId) throw new BadRequestException('请选择通讯录分类');
    const category = await this.prisma.contactCategory.findUnique({ where: { id: categoryId } });
    if (!category?.regionId) throw new BadRequestException('通讯录分类不存在或未绑定校区');
    const regionId = String(dto.region_id || dto.regionId || previousRegion || '').trim();
    if (!regionId || category.regionId !== regionId || (previousRegion && previousRegion !== regionId)) throw new ForbiddenException('不能使用其他校区的通讯录分类');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '管理个人通讯录', true);
    const name = String(dto.name || '').trim(), phone = String(dto.phone || '').trim();
    if (!name || name.length > 50) throw new BadRequestException('联系人姓名需填写1至50个字');
    if (!/^\+?[\d() -]{5,25}$/.test(phone)) throw new BadRequestException('联系电话格式不正确');
    const address = String(dto.address || '').trim(), remark = String(dto.remark || '').trim();
    if (address.length > 300 || remark.length > 500) throw new BadRequestException('联系人地址或备注过长');
    // 普通用户只能维护本人私密联系人；公开联系人由后台管理。
    return { categoryId, name, phone, address, remark, isPublic: false };
  }

  async createContact(userId: string, dto: any) {
    const data = await this.contactWriteCategory(userId, dto);
    return this.prisma.contact.create({ data: { ...data, userId } });
  }

  async updateContact(id: string, userId: string, dto: any) {
    const contact = await this.prisma.contact.findUnique({ where: { id }, include: { category: true } });
    if (!contact || contact.userId !== userId || contact.isPublic) throw new NotFoundException('个人联系人不存在');
    const data = await this.contactWriteCategory(userId, dto, contact.category.regionId || '');
    const result = await this.prisma.contact.updateMany({ where: { id, userId, isPublic: false, categoryId: contact.categoryId }, data });
    if (result.count !== 1) throw new BadRequestException('联系人状态已变化，请重新加载');
    return { success: true };
  }

  async deleteContact(id: string, userId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id }, include: { category: true } });
    if (!contact || contact.userId !== userId || contact.isPublic || !contact.category.regionId) throw new NotFoundException('个人联系人不存在');
    await this.userAccess.assertStudentProtectedAction(userId, contact.category.regionId, '删除个人通讯录', true);
    const result = await this.prisma.contact.deleteMany({ where: { id, userId, isPublic: false, categoryId: contact.categoryId } });
    if (result.count !== 1) throw new BadRequestException('联系人状态已变化，请重新加载');
    return { success: true };
  }

  private async assertContactAccess(regionId: string, userId: string) {
    const region = await this.prisma.region.findUnique({ where: { id: regionId }, select: { contactsRequireStudentAuth: true } });
    if (!region) throw new NotFoundException('学校区域不存在');
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '查看通讯录', region.contactsRequireStudentAuth);
  }

  async getMyContacts(userId: string, query: any) {
    const regionId = String(query?.region_id || query?.regionId || '').trim();
    if (!regionId) throw new BadRequestException('请选择学校区域');
    await this.assertContactAccess(regionId, userId);
    const page = this.publicContentPage(query.page, 1, 1000000), limit = this.publicContentPage(query.limit, 20, 50);
    const where: any = { userId, isPublic: false, category: { regionId } };
    if (query.category) where.categoryId = String(query.category);
    const keyword = String(query.keyword || '').trim().slice(0, 100);
    if (keyword) where.OR = [{ name: { contains: keyword } }, { phone: { contains: keyword } }];
    const [list, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.contact.count({ where }),
    ]);
    return { success: true, data: { list: list.map(item => ({ ...item, canEdit: true })), total, page, limit } };
  }

  // ========== 富文本内容 ==========
  private publicContentRegion(value: unknown): string | null {
    if (value == null || value === '' || value === 0 || value === '0' || value === '__global__') return null;
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^[a-zA-Z0-9_-]{1,191}$/.test(String(value))) {
      throw new BadRequestException('区域编号不合法');
    }
    return String(value);
  }

  private publicContentPage(value: unknown, fallback: number, maximum: number): number {
    if (value == null || value === '') return fallback;
    if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9]\d*$/.test(String(value))) throw new BadRequestException('分页参数不合法');
    const page = Number(value);
    if (!Number.isSafeInteger(page) || page > maximum) throw new BadRequestException('分页参数超出范围');
    return page;
  }

  async getRichTextContents(query: any = {}) {
    const regionId = this.publicContentRegion(query.region_id ?? query.regionId);
    const page = this.publicContentPage(query.page, 1, 1000000);
    const limit = this.publicContentPage(query.limit, 10, 50);
    return this.prisma.richTextContent.findMany({
      where: {
        isShow: true,
        AND: [
          { OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }] },
          { OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit, take: limit,
    });
  }

  async getRichTextContent(id: string) {
    // A published document ID remains shareable across campuses. Listing scope
    // is separate; an exact ID must never expose a hidden or future document.
    return this.prisma.richTextContent.findFirst({
      where: { id, isShow: true, OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
    });
  }

  async getRegionContentTypes(regionId: string) {
    const scope = this.publicContentRegion(regionId);
    const contents = await this.prisma.richTextContent.findMany({
      where: {
        isShow: true,
        AND: [
          { OR: scope ? [{ regionId: scope }, { regionId: null }] : [{ regionId: null }] },
          { OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
        ],
      },
      select: { id: true, regionId: true, type: true, title: true, version: true, scene: true, isRequired: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
    const selected = new Map<string, (typeof contents)[number]>();
    for (const item of contents) {
      const current = selected.get(item.type);
      // Keep the first (best sorted) row per scope; a campus override wins even
      // when its sortOrder places it after a global document.
      if (!current || (item.regionId === scope && current.regionId !== scope)) {
        selected.set(item.type, item);
      }
    }
    const types = Array.from(selected.values()).map((item) => ({
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
    const def = normalizeAgreementType(type);
    const regionId = normalizeAgreementRegion(query?.region_id ?? query?.regionId);
    const doc = await findPublishedAgreement(this.prisma, def.type, regionId);
    const data = doc ? { ...doc, content_hash: agreementContentHash(doc) } : {
      id: '',
      regionId,
      type: def.type,
      title: def.title,
      content: '平台暂未配置该协议内容，请联系运营管理员完善。',
      version: '',
      content_hash: '',
      scene: def.scene,
      isRequired: def.isRequired,
      isShow: false,
      updatedAt: new Date(),
    };
    return { code: 200, data, agreement: data };
  }

  async acceptAgreement(userId: string, dto: any) {
    const [data] = await recordAgreementConsents(this.prisma, userId, [dto], {
      regionId: dto?.region_id ?? dto?.regionId,
      scene: dto?.scene,
      source: dto?.source,
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
            OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }],
          },
        })
      : [];

    if (tagDefs.length !== selectedTagIds.length) {
      throw new BadRequestException('部分标签无效，请重新选择');
    }
    if (new Set(tagDefs.map((tag) => tag.tagName)).size !== tagDefs.length) {
      throw new BadRequestException('同名标签只能选择一个，请重新选择');
    }

    const { updated, selection } = await this.prisma.$transaction(async (tx) => {
      if (gender !== undefined) {
        await lockErrandAssignee(tx, userId);
        await assertErrandGenderChangeAllowed(tx, userId, gender);
      }
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

      const updated = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          uid: true,
          nickname: true,
          avatar: true,
          profile: { select: { gender: true, birthday: true, grade: true, regionId: true } },
        },
      });
      const selection = await readUserGuidanceTags(tx, userId, regionId || updated?.profile?.regionId);
      return { updated, selection };
    });

    // 事务失败不动缓存；成功后同时清理旧键和按校区/查看人缓存的 v2 键。
    if (this.redis) {
      await Promise.all([
        this.redis.delPattern(`user:profile:${userId}:*`).catch(() => undefined),
        this.redis.delPattern(`user:profile:v2:${userId}:*`).catch(() => undefined),
      ]);
    }

    return {
      success: true,
      message: '保存成功',
      data: {
        user: updated ? { ...updated, ...selection } : updated,
        ...selection,
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
  async getRegionCustomPages(regionId: string, query: any = {}) {
    const scope = this.publicContentRegion(regionId);
    if (!scope) throw new BadRequestException('请先选择区域');
    const displayScope = query.display_scope ?? query.displayScope ?? 'all';
    if (!['all', 'module', 'home', 'mine'].includes(displayScope)) throw new BadRequestException('展示位置不合法');
    const page = this.publicContentPage(query.page, 1, 1000000);
    const limit = this.publicContentPage(query.page_size, 10, 50);
    return this.prisma.regionCustomPage.findMany({
      where: { regionId: scope, isShow: true, displayScope: { in: displayScope === 'all' ? ['all'] : [displayScope, 'all'] } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit, take: limit,
    });
  }

  // ========== 对象匹配 ==========

  // ========== 团购 ==========
  async getGroupBuyPackages(query: any) {
    if(!this.groupBuy)throw new BadRequestException('团购服务尚未就绪');
    return this.groupBuy.packages(query);
  }
  async createGroupBuyOrder(userId: string, dto: any) {
    if(!this.groupBuy)throw new BadRequestException('团购服务尚未就绪');
    return this.groupBuy.create(userId,dto);
  }
  async getGroupBuyOrder(orderSn: string, userId: string) {
    if(!this.groupBuy)throw new BadRequestException('团购服务尚未就绪');
    return this.groupBuy.order(userId,orderSn,true);
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
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const existing=await tx.userTitleRecord.findUnique({where:{userId_titleId:{userId,titleId}},include:{title:true}});
      if(!existing?.title||!existing.title.isEnabled||existing.title.type!=='title')throw new BadRequestException('称号未获得或已下架');
      const profile=await tx.userProfile.findUnique({where:{userId},select:{regionId:true}});
      if(existing.title.regionId&&existing.title.regionId!==profile?.regionId)throw new BadRequestException('请切换到称号所属校区');
      const scopeRegionId=this.normalizeRegionScope(existing.title.regionId);
      await tx.userTitleRecord.updateMany({where:{userId,title:{is:{regionId:scopeRegionId}}},data:{isWearing:false}});
      const record=await tx.userTitleRecord.update({where:{userId_titleId:{userId,titleId}},data:{isWearing:true},include:{title:true}});
      return {success:true,data:this.toMiniUserTitle(record),message:'佩戴成功'};
    });
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
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId,'兑换称号');
    const code=String(dto?.code||'').trim();
    if(!code||code.length>128)throw new BadRequestException('兑换码不合法');
    return this.prisma.$transaction(async tx=>{
      const row=await tx.userTitleRedeemCode.findUnique({where:{code}});
      if(!row)throw new BadRequestException('兑换码不存在');
      const title=await tx.userTitle.findUnique({where:{id:row.titleId}});
      const profile=await tx.userProfile.findUnique({where:{userId},select:{regionId:true}});
      if(!title?.isEnabled||title.type!=='title')throw new BadRequestException('称号已下架');
      if(title.regionId&&profile?.regionId!==title.regionId)throw new BadRequestException('请切换到称号所属校区');
      const claimed=await tx.userTitleRedeemCode.updateMany({where:{id:row.id,usedBy:null,isUsed:false,OR:[{expireAt:null},{expireAt:{gt:new Date()}}]},data:{usedBy:userId,isUsed:true,usedAt:new Date()}});
      if(claimed.count!==1)throw new BadRequestException('兑换码已使用或过期');
      const record=await tx.userTitleRecord.upsert({where:{userId_titleId:{userId,titleId:title.id}},create:{userId,titleId:title.id},update:{},include:{title:true}});
      return {success:true,data:this.toMiniUserTitle(record),message:'兑换成功'};
    });
  }

  async getRedeemCodeInfo(value: string) {
    const code=String(value||'').trim();
    if(!code||code.length>128)throw new BadRequestException('兑换码不合法');
    const row=await this.prisma.userTitleRedeemCode.findUnique({where:{code}});
    if(!row||row.usedBy||row.isUsed||(row.expireAt&&row.expireAt<=new Date()))throw new BadRequestException('兑换码不可用');
    const title=await this.prisma.userTitle.findUnique({where:{id:row.titleId}});
    if(!title?.isEnabled||title.type!=='title')throw new BadRequestException('称号已下架');
    return {title:this.toMiniUserTitle(title),expireAt:row.expireAt};
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
