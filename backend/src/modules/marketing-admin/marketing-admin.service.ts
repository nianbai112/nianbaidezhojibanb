import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class MarketingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifyService: NotifyService,
  ) {}

  private readonly campaignConfigKey = 'marketing_campaigns_config';

  private toInt(value: any, fallback = 0, min?: number, max?: number) {
    const parsed = Number(value);
    let next = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  }

  private toNumber(value: any, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private optionalString(value: any) {
    if (typeof value !== 'string') return value ?? undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private nullableString(value: any) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toDate(value: any, fallback?: Date | null) {
    if (value === undefined || value === null || value === '') return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
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

  private parseStringList(value: any) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || '')
      .split(/[\n,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private campaignId() {
    return `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async readCampaigns() {
    const config = await this.prisma.config.findUnique({ where: { key: this.campaignConfigKey } }).catch(() => null);
    const value = config?.value as any;
    return Array.isArray(value?.list) ? value.list : Array.isArray(value) ? value : [];
  }

  private normalizeCampaign(data: any, current?: any) {
    const startAt = this.toDate(data.startAt, current?.startAt || new Date());
    const endAt = this.toDate(data.endAt, current?.endAt || startAt || new Date());
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('活动结束时间不能早于开始时间');
    }
    const type = String(data.type ?? current?.type ?? 'coupon').trim() || 'coupon';
    return {
      id: current?.id || data.id || this.campaignId(),
      title: String(data.title ?? current?.title ?? '').trim(),
      type,
      status: data.status ?? current?.status ?? 'active',
      couponId: this.nullableString(data.couponId ?? current?.couponId),
      regionId: this.nullableString(data.regionId ?? current?.regionId),
      merchantId: this.nullableString(data.merchantId ?? current?.merchantId),
      startAt: startAt ? startAt.toISOString() : null,
      endAt: endAt ? endAt.toISOString() : null,
      dailyBudget: this.toNumber(data.dailyBudget ?? current?.dailyBudget, 0),
      totalBudget: this.toNumber(data.totalBudget ?? current?.totalBudget, 0),
      perUserBudget: this.toNumber(data.perUserBudget ?? current?.perUserBudget, 0),
      userLimit: this.toInt(data.userLimit ?? current?.userLimit, 1, 1),
      firstOrderOnly: data.firstOrderOnly ?? current?.firstOrderOnly ?? type === 'first_order',
      newUserOnly: data.newUserOnly ?? current?.newUserOnly ?? type === 'new_user',
      newUserDays: this.toInt(data.newUserDays ?? current?.newUserDays, 7, 1, 365),
      payerType: data.payerType ?? current?.payerType ?? 'platform',
      description: this.nullableString(data.description ?? current?.description),
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async writeCampaigns(list: any[]) {
    await this.prisma.config.upsert({
      where: { key: this.campaignConfigKey },
      update: { value: { list }, updatedAt: new Date() },
      create: { key: this.campaignConfigKey, value: { list }, group: 'marketing', desc: '运营活动规则配置' },
    });
  }

  private dayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async enrichCampaign(campaign: any) {
    const couponId = campaign.couponId || '';
    const baseWhere: any = {
      status: { not: 'cancelled' },
      OR: [
        { campaignId: campaign.id },
        ...(couponId ? [{ sourceType: 'coupon', sourceId: couponId }] : []),
      ],
    };
    const [coupon, totalAgg, todayAgg, users, orders, couponClaimCount, couponUseCount] = await Promise.all([
      couponId ? this.prisma.coupon.findUnique({ where: { id: couponId } }).catch(() => null) : null,
      this.prisma.subsidyLedger.aggregate({ where: baseWhere, _sum: { amount: true }, _count: true }).catch(() => null),
      this.prisma.subsidyLedger.aggregate({ where: { ...baseWhere, createdAt: { gte: this.dayStart() } }, _sum: { amount: true }, _count: true }).catch(() => null),
      this.prisma.subsidyLedger.findMany({
        where: baseWhere,
        select: { userId: true },
        distinct: ['userId'],
        take: 10000,
      }).catch(() => []),
      this.prisma.subsidyLedger.findMany({
        where: baseWhere,
        select: { orderId: true },
        distinct: ['orderId'],
        take: 10000,
      }).catch(() => []),
      couponId ? this.prisma.couponReceive.count({ where: { couponId } }).catch(() => 0) : 0,
      couponId ? this.prisma.couponReceive.count({ where: { couponId, status: 'used' } }).catch(() => 0) : 0,
    ]);
    const totalSpent = this.toNumber(totalAgg?._sum?.amount, 0);
    const todaySpent = this.toNumber(todayAgg?._sum?.amount, 0);
    const orderCount = orders.filter((item: any) => item.orderId).length;
    const claimCount = this.toInt(couponClaimCount, 0, 0);
    const usedCount = this.toInt(couponUseCount, 0, 0);
    return {
      ...campaign,
      coupon,
      metrics: {
        totalSpent,
        todaySpent,
        totalCount: totalAgg?._count || 0,
        todayCount: todayAgg?._count || 0,
        userCount: users.filter((item: any) => item.userId).length,
        orderCount,
        claimCount,
        usedCount,
        useRate: claimCount > 0 ? Number(((usedCount / claimCount) * 100).toFixed(1)) : 0,
        costPerOrder: orderCount > 0 ? Number((totalSpent / orderCount).toFixed(2)) : 0,
        totalRemaining: campaign.totalBudget > 0 ? Math.max(0, campaign.totalBudget - totalSpent) : null,
        todayRemaining: campaign.dailyBudget > 0 ? Math.max(0, campaign.dailyBudget - todaySpent) : null,
      },
    };
  }

  private normalizeSignConfig(value: any, regionId?: string | null) {
    const raw = value && typeof value === 'object' ? value : {};
    return {
      regionId: regionId || raw.regionId || null,
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
    const fallback = '邀请好友注册成功后，邀请人和新人都可以获得奖励。';
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

  private normalizeCouponType(type: any) {
    const map: Record<string, string> = {
      discount: 'DISCOUNT',
      DISCOUNT: 'DISCOUNT',
      full_reduction: 'FULL_REDUCTION',
      FULL_REDUCTION: 'FULL_REDUCTION',
      exchange: 'EXCHANGE',
      EXCHANGE: 'EXCHANGE',
    };
    return map[String(type || '').trim()] || 'DISCOUNT';
  }

  private normalizeCouponBusinessScope(scope: any) {
    const value = String(scope || '').trim().toLowerCase();
    const allowed = new Set(['all', 'shop', 'mall', 'errand', 'activity', 'membership']);
    return allowed.has(value) ? value : 'all';
  }

  private normalizeCouponPayload(data: any, current?: any): any {
    const startAt = this.toDate(data.startAt, current?.startAt || new Date());
    const endAt = this.toDate(data.endAt, current?.endAt || startAt || new Date());
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('优惠券结束时间不能早于开始时间');
    }
    return {
      name: data.name ?? current?.name,
      type: data.type !== undefined ? this.normalizeCouponType(data.type) : current?.type ?? 'DISCOUNT',
      value: this.toNumber(data.value ?? current?.value, 0),
      minAmount: this.toNumber(data.minAmount ?? current?.minAmount, 0),
      totalCount: this.toInt(data.totalCount ?? current?.totalCount, 0, 0),
      limitPerUser: this.toInt(data.limitPerUser ?? current?.limitPerUser, 1, 1),
      startAt,
      endAt,
      status: data.status ?? current?.status ?? 'active',
      businessScope: data.businessScope !== undefined
        ? this.normalizeCouponBusinessScope(data.businessScope)
        : this.normalizeCouponBusinessScope(current?.businessScope || 'all'),
      description: data.description !== undefined ? this.nullableString(data.description) : current?.description,
      regionId: data.regionId !== undefined ? this.nullableString(data.regionId) : current?.regionId,
      merchantId: data.merchantId !== undefined ? this.nullableString(data.merchantId) : current?.merchantId,
    };
  }

  private normalizeActivityPayload(data: any, current?: any): any {
    const startAt = this.toDate(data.startAt, current?.startAt || new Date());
    const endAt = this.toDate(data.endAt, current?.endAt || startAt || new Date());
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('活动结束时间不能早于开始时间');
    }
    return {
      title: data.title ?? current?.title,
      description: data.description !== undefined ? this.nullableString(data.description) : current?.description,
      cover: data.cover !== undefined ? this.nullableString(data.cover) : current?.cover,
      location: data.location !== undefined ? this.nullableString(data.location) : current?.location,
      startAt,
      endAt,
      maxPeople: data.maxPeople !== undefined ? this.toInt(data.maxPeople, 0, 0) : current?.maxPeople,
      fee: data.fee !== undefined ? this.toNumber(data.fee, 0) : current?.fee,
      status: data.status ?? current?.status ?? 'upcoming',
      regionId: data.regionId !== undefined ? this.nullableString(data.regionId) : current?.regionId,
      typeId: data.typeId !== undefined ? this.nullableString(data.typeId) : current?.typeId,
      visibility: data.visibility ?? current?.visibility ?? 'public',
      organizer: data.organizer !== undefined ? this.nullableString(data.organizer) : current?.organizer,
      contact: data.contact !== undefined ? this.nullableString(data.contact) : current?.contact,
    };
  }

  private normalizeGroupBuyPayload(data: any, current?: any): any {
    const startAt = this.toDate(data.startAt, current?.startAt || new Date());
    const endAt = this.toDate(data.endAt, current?.endAt || startAt || new Date());
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('团购结束时间不能早于开始时间');
    }
    return {
      name: data.name ?? current?.name,
      description: data.description !== undefined ? this.nullableString(data.description) : current?.description,
      cover: data.cover !== undefined ? this.nullableString(data.cover) : current?.cover,
      price: data.price !== undefined ? this.toNumber(data.price, 0) : current?.price ?? 0,
      originPrice: (data.originPrice ?? data.originalPrice) !== undefined ? this.toNumber(data.originPrice ?? data.originalPrice, 0) : current?.originPrice,
      stock: (data.stock ?? data.minPeople) !== undefined ? this.toInt(data.stock ?? data.minPeople, 0, 0) : current?.stock,
      startAt,
      endAt,
      status: data.status ?? current?.status ?? 'active',
      regionId: data.regionId !== undefined ? this.nullableString(data.regionId) : current?.regionId,
      categoryId: data.categoryId !== undefined ? this.nullableString(data.categoryId) : current?.categoryId,
      merchantId: data.merchantId !== undefined ? this.nullableString(data.merchantId) : current?.merchantId,
    };
  }

  private normalizePopupPayload(data: any, current?: any, operatorId?: string): any {
    const name = String(data.name ?? data.title ?? current?.name ?? '').trim();
    const image = String(data.image ?? current?.image ?? '').trim();
    const linkType = String(data.linkType ?? current?.linkType ?? 'none').trim() || 'none';
    const linkValue = data.linkValue !== undefined
      ? this.nullableString(data.linkValue)
      : data.link !== undefined
        ? this.nullableString(data.link)
        : current?.linkValue;
    const regionId = data.regionId !== undefined ? this.nullableString(data.regionId) : current?.regionId;
    const startTime = this.toDate(data.startTime ?? data.startAt, current?.startTime ?? null);
    const endTime = this.toDate(data.endTime ?? data.endAt, current?.endTime ?? null);
    if (!regionId) throw new BadRequestException('请选择首页权益卡片投放区域');
    if (!name) throw new BadRequestException('卡片标题不能为空');
    if (name.length > 80) throw new BadRequestException('卡片标题太长，请控制在80个字以内');
    if (!image) throw new BadRequestException('卡片图片不能为空，请上传图片或套用示范图');
    if (/^\/(?:src|assets)\//.test(image)) {
      throw new BadRequestException('图片地址不是正式可访问地址，请重新上传图片或套用示范图');
    }
    if (image.length > 1000) throw new BadRequestException('卡片图片地址太长，请重新上传图片或检查存储配置');
    if (linkType !== 'none' && !linkValue) throw new BadRequestException('已选择跳转类型，请填写跳转值');
    if (linkType === 'page' && linkValue && !/^\/[A-Za-z0-9_/-]+(\?[A-Za-z0-9_=&%.-]+)?$/.test(String(linkValue))) {
      throw new BadRequestException('小程序页面路径格式不对，请填写 /pagesA/coupon/coupon 这种以 / 开头的路径');
    }
    if (linkType === 'webview' && linkValue && !/^https?:\/\/.+/i.test(String(linkValue))) {
      throw new BadRequestException('H5页面地址格式不对，请填写 http:// 或 https:// 开头的完整网址');
    }
    if (linkValue && String(linkValue).length > 500) throw new BadRequestException('跳转值太长，请缩短页面路径、URL或资源ID');
    if (startTime && endTime && endTime.getTime() < startTime.getTime()) {
      throw new BadRequestException('卡片有效期不对，结束时间不能早于开始时间');
    }
    return {
      name,
      image,
      linkType,
      linkValue,
      position: 'popup',
      startTime,
      endTime,
      priority: data.priority !== undefined ? this.toInt(data.priority, 0, 0) : current?.priority,
      status: data.status !== undefined
        ? (data.status === 'active' || data.status === true ? 1 : data.status === 'inactive' || data.status === false ? 0 : this.toInt(data.status, 1, 0, 1))
        : current?.status ?? 1,
      regionId,
      updatedBy: operatorId,
    };
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

  private formatPopupForClient(item: any) {
    const image = this.publicUploadUrl(item.image);
    return {
      ...item,
      title: item.name,
      image,
      image_url: image,
      link: item.linkValue,
      link_type: item.linkType,
      link_value: item.linkValue,
      startAt: item.startTime,
      start_at: item.startTime,
      endAt: item.endTime,
      end_at: item.endTime,
      statusText: item.status === 1 ? 'active' : 'inactive',
    };
  }

  private async logOperation(operatorId: string, action: string, module: string, targetId: string, ip: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: { accountId: operatorId, action, module, targetId, ip: ip || '' },
      });
    } catch (e) {
      // 日志失败不影响主流程
    }
  }

  private async assertShareCouponUsable(couponId: string, regionId: string, label: string) {
    const id = String(couponId || '').trim();
    if (!id) return;
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon || coupon.status !== 'active') throw new BadRequestException(`${label}优惠券不存在或未启用`);
    const now = new Date();
    if (coupon.endAt && coupon.endAt < now) throw new BadRequestException(`${label}优惠券已过期`);
    if (coupon.regionId && coupon.regionId !== regionId) throw new BadRequestException(`${label}优惠券不属于当前区域`);
  }

  // ==================== 优惠券 ====================

  async getCoupons(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, keyword, regionId, businessScope } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.OR = [{ regionId }, { regionId: null }];
    if (businessScope) where.businessScope = this.normalizeCouponBusinessScope(businessScope);
    if (keyword) where.name = { contains: keyword.trim() };

    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          region: { select: { id: true, name: true } },
          merchant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  async createCoupon(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('优惠券名称不能为空');

    const coupon = await this.prisma.coupon.create({
      data: this.normalizeCouponPayload(data),
    });

    await this.logOperation(operatorId, 'create', 'coupon', coupon.id, ip);
    return { success: true, data: coupon };
  }

  async updateCoupon(id: string, data: any, operatorId: string, ip: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('优惠券不存在');

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: this.normalizeCouponPayload(data, coupon),
    });

    await this.logOperation(operatorId, 'update', 'coupon', id, ip);
    return { success: true, data: updated };
  }

  async updateCouponStatus(id: string, status: string, operatorId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('优惠券不存在');

    await this.prisma.coupon.update({
      where: { id },
      data: { status },
    });

    return { success: true };
  }

  async getCouponRecords(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { couponId, userId, status } = query;
    const where: any = {};
    if (couponId) where.couponId = couponId;
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.couponReceive.findMany({
        where,
        include: { coupon: true, user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.couponReceive.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  private normalizeRedeemCode(value: any) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  private randomRedeemCode(prefix = '') {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let body = '';
    for (let i = 0; i < 10; i += 1) {
      body += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const cleanPrefix = this.normalizeRedeemCode(prefix).replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return `${cleanPrefix}${body}`;
  }

  async getCouponRedeemCodes(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { couponId, status, regionId, keyword } = query;
    const where: any = {};
    if (couponId) where.couponId = String(couponId);
    if (status) where.status = String(status);
    if (regionId) where.regionId = String(regionId);
    if (keyword) {
      const text = String(keyword).trim();
      where.OR = [
        { code: { contains: text.toUpperCase() } },
        { batchName: { contains: text } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.couponRedeemCode.findMany({
        where,
        include: {
          coupon: { include: { region: { select: { id: true, name: true } } } },
          _count: { select: { records: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.couponRedeemCode.count({ where }),
    ]);
    return { success: true, data: { list, total, page, pageSize } };
  }

  async createCouponRedeemCodes(data: any, operatorId: string, ip: string) {
    const couponId = String(data.couponId || data.coupon_id || '').trim();
    if (!couponId) throw new BadRequestException('请选择绑定优惠券');
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new BadRequestException('绑定优惠券不存在');
    const count = this.toInt(data.count, 1, 1, 500);
    const explicitCode = this.normalizeRedeemCode(data.code);
    if (explicitCode && count > 1) throw new BadRequestException('指定兑换码时只能生成 1 个');
    const totalLimit = this.toInt(data.totalLimit ?? data.total_limit, 1, 1, 100000);
    const perUserLimit = this.toInt(data.perUserLimit ?? data.per_user_limit, 1, 1, totalLimit);
    const startAt = this.toDate(data.startAt, coupon.startAt || new Date());
    const endAt = this.toDate(data.endAt, coupon.endAt || startAt || new Date());
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) throw new BadRequestException('兑换码结束时间不能早于开始时间');
    const regionId = data.regionId !== undefined ? this.nullableString(data.regionId) : coupon.regionId;
    if (coupon.regionId && regionId && String(coupon.regionId) !== String(regionId)) {
      throw new BadRequestException('兑换码区域必须与绑定优惠券区域一致');
    }
    const batchName = this.nullableString(data.batchName) || `兑换码-${new Date().toLocaleDateString('zh-CN')}`;
    const remark = this.nullableString(data.remark);
    const codes = new Set<string>();
    if (explicitCode) codes.add(explicitCode);
    while (codes.size < count) codes.add(this.randomRedeemCode(data.prefix || ''));
    const created = await this.prisma.couponRedeemCode.createMany({
      data: Array.from(codes).map((code) => ({
        couponId,
        code,
        batchName,
        status: data.status || 'active',
        totalLimit,
        perUserLimit,
        startAt,
        endAt,
        regionId,
        remark,
        createdBy: operatorId,
      })),
      skipDuplicates: true,
    });
    await this.logOperation(operatorId, 'create', 'coupon_redeem_code', couponId, ip);
    return { success: true, data: { count: created.count, codes: Array.from(codes) } };
  }

  async updateCouponRedeemCodeStatus(id: string, status: string, operatorId: string, ip: string) {
    const nextStatus = String(status || '').trim() || 'disabled';
    if (!['active', 'disabled'].includes(nextStatus)) throw new BadRequestException('兑换码状态不正确');
    const item = await this.prisma.couponRedeemCode.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('兑换码不存在');
    const updated = await this.prisma.couponRedeemCode.update({ where: { id }, data: { status: nextStatus } });
    await this.logOperation(operatorId, 'status', 'coupon_redeem_code', id, ip);
    return { success: true, data: updated };
  }

  async getCouponRedeemRecords(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { redeemCodeId, couponId, userId } = query;
    const where: any = {};
    if (redeemCodeId) where.redeemCodeId = String(redeemCodeId);
    if (couponId) where.couponId = String(couponId);
    if (userId) where.userId = String(userId);
    const [list, total] = await Promise.all([
      this.prisma.couponRedeemRecord.findMany({
        where,
        include: {
          redeemCode: { include: { coupon: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.couponRedeemRecord.count({ where }),
    ]);
    return { success: true, data: { list, total, page, pageSize } };
  }

  // ==================== 运营活动 ====================

  async getCampaigns(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const rawList = await this.readCampaigns();
    const filtered = rawList.filter((item: any) => {
      if (query.status && item.status !== query.status) return false;
      if (query.type && item.type !== query.type) return false;
      if (query.regionId && item.regionId !== query.regionId) return false;
      if (query.couponId && item.couponId !== query.couponId) return false;
      if (keyword && !String(`${item.title || ''} ${item.description || ''}`).toLowerCase().includes(keyword)) return false;
      return true;
    });
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
    const list = await Promise.all(pageRows.map((item: any) => this.enrichCampaign(item)));
    return { success: true, data: { list, total: filtered.length, page, pageSize } };
  }

  async createCampaign(data: any, operatorId: string, ip: string) {
    const list = await this.readCampaigns();
    const campaign = this.normalizeCampaign(data);
    if (!campaign.title) throw new BadRequestException('活动名称不能为空');
    if (!campaign.couponId) throw new BadRequestException('请选择绑定优惠券');
    const coupon = await this.prisma.coupon.findUnique({ where: { id: campaign.couponId } });
    if (!coupon) throw new BadRequestException('绑定优惠券不存在');
    list.unshift(campaign);
    await this.writeCampaigns(list);
    await this.logOperation(operatorId, 'create', 'campaign', campaign.id, ip);
    return { success: true, data: await this.enrichCampaign(campaign) };
  }

  async updateCampaign(id: string, data: any, operatorId: string, ip: string) {
    const list = await this.readCampaigns();
    const index = list.findIndex((item: any) => item.id === id);
    if (index < 0) throw new NotFoundException('活动不存在');
    const campaign = this.normalizeCampaign(data, list[index]);
    if (!campaign.title) throw new BadRequestException('活动名称不能为空');
    if (!campaign.couponId) throw new BadRequestException('请选择绑定优惠券');
    const coupon = await this.prisma.coupon.findUnique({ where: { id: campaign.couponId } });
    if (!coupon) throw new BadRequestException('绑定优惠券不存在');
    list[index] = campaign;
    await this.writeCampaigns(list);
    await this.logOperation(operatorId, 'update', 'campaign', id, ip);
    return { success: true, data: await this.enrichCampaign(campaign) };
  }

  async updateCampaignStatus(id: string, status: string, operatorId: string, ip: string) {
    const list = await this.readCampaigns();
    const index = list.findIndex((item: any) => item.id === id);
    if (index < 0) throw new NotFoundException('活动不存在');
    list[index] = this.normalizeCampaign({ status }, list[index]);
    await this.writeCampaigns(list);
    await this.logOperation(operatorId, 'status', 'campaign', id, ip);
    return { success: true, data: await this.enrichCampaign(list[index]) };
  }

  // ==================== 签到配置 ====================

  async getSignConfig(regionId?: string) {
    const key = regionId ? `sign_config_${regionId}` : 'sign_config_global';
    const config = await this.prisma.config.findUnique({ where: { key } });
    const fallback = regionId && !config
      ? await this.prisma.config.findUnique({ where: { key: 'sign_config_global' } }).catch(() => null)
      : null;
    return {
      success: true,
      data: this.normalizeSignConfig((config || fallback)?.value, regionId || null),
    };
  }

  async saveSignConfig(data: any, operatorId: string, ip: string) {
    const regionId = this.nullableString(data.regionId) || null;
    const key = regionId ? `sign_config_${regionId}` : 'sign_config_global';
    const value = this.normalizeSignConfig(data, regionId);

    await this.prisma.config.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value, group: 'marketing' },
    });

    await this.logOperation(operatorId, 'save', 'sign_config', regionId || 'global', ip);
    return { success: true };
  }

  async getSignRecords(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { userId, regionId, startDate, endDate } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = String(startDate).slice(0, 10);
      if (endDate) where.date.lte = String(endDate).slice(0, 10);
    }

    const [list, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({
        where,
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInRecord.count({ where }),
    ]);

    return {
      success: true,
      data: {
        list: list.map((item: any) => {
          const meta = this.parseJsonObject(item.content);
          return {
            id: item.id,
            userId: item.userId,
            user: item.User,
            regionId: item.regionId,
            type: meta.source === 'online_growth_signin' ? 'ONLINE_GROWTH' : 'LEGACY_SIGNIN',
            signinDate: item.date,
            reward: item.rewardValue,
            expEarned: this.toNumber(meta.exp_earned, 0),
            createdAt: item.createdAt,
          };
        }),
        total,
        page,
        pageSize,
      },
    };
  }

  // ==================== 徽章配置 ====================

  async getBadges(query: any) {
    const { page = 1, pageSize = 20, keyword, isEnabled } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (isEnabled !== undefined && isEnabled !== '') where.isEnabled = String(isEnabled) === 'true' || String(isEnabled) === '1';

    const [list, total] = await Promise.all([
      this.prisma.badge.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.badge.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createBadge(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('徽章名称不能为空');

    const badge = await this.prisma.badge.create({
      data: {
        name: data.name,
        icon: data.icon,
        description: data.description,
        condition: data.condition || '',
        sortOrder: data.sortOrder || 0,
        isEnabled: data.isEnabled ?? data.is_enabled ?? true,
      },
    });

    await this.logOperation(operatorId, 'create', 'badge', badge.id, ip);
    return { success: true, data: badge };
  }

  async updateBadge(id: string, data: any, operatorId: string, ip: string) {
    const badge = await this.prisma.badge.findUnique({ where: { id } });
    if (!badge) throw new NotFoundException('徽章不存在');

    const updated = await this.prisma.badge.update({
      where: { id },
      data: {
        name: data.name ?? badge.name,
        icon: data.icon ?? badge.icon,
        description: data.description ?? badge.description,
        condition: data.condition ?? badge.condition,
        sortOrder: data.sortOrder ?? badge.sortOrder,
        isEnabled: data.isEnabled ?? data.is_enabled ?? badge.isEnabled,
      },
    });

    await this.logOperation(operatorId, 'update', 'badge', id, ip);
    return { success: true, data: updated };
  }

  async deleteBadge(id: string, operatorId: string, ip: string) {
    const badge = await this.prisma.badge.findUnique({ where: { id } });
    if (!badge) throw new NotFoundException('徽章不存在');

    await this.prisma.badge.delete({ where: { id } });
    await this.logOperation(operatorId, 'delete', 'badge', id, ip);
    return { success: true, message: '删除成功' };
  }

  async getUserBadges(userId: string) {
    if (!userId) throw new BadRequestException('用户ID不能为空');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, avatar: true } });
    if (!user) throw new NotFoundException('用户不存在');
    const list = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: { user, list } };
  }

  async grantBadgeToUser(badgeId: string, data: any, operatorId: string, ip: string) {
    const userId = data?.userId || data?.user_id;
    if (!userId) throw new BadRequestException('用户ID不能为空');
    const [badge, user] = await Promise.all([
      this.prisma.badge.findUnique({ where: { id: badgeId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);
    if (!badge) throw new NotFoundException('徽章不存在');
    if (!user) throw new NotFoundException('用户不存在');
    const record = await this.prisma.userBadge.upsert({
      where: { badgeId_userId: { badgeId, userId } },
      create: { badgeId, userId },
      update: {},
      include: { badge: true, user: { select: { id: true, nickname: true, avatar: true } } },
    });
    await this.logOperation(operatorId, 'grant', 'badge', `${badgeId}:${userId}`, ip);
    return { success: true, data: record, message: '发放成功' };
  }

  async revokeBadgeFromUser(badgeId: string, userId: string, operatorId: string, ip: string) {
    if (!userId) throw new BadRequestException('用户ID不能为空');
    await this.prisma.userBadge.deleteMany({ where: { badgeId, userId } });
    await this.logOperation(operatorId, 'revoke', 'badge', `${badgeId}:${userId}`, ip);
    return { success: true, message: '撤销成功' };
  }

  // ==================== 称号配置 ====================

  async getTitles(query: any) {
    const { page = 1, pageSize = 20, keyword, regionId, type, isEnabled } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (regionId) where.regionId = regionId === '__global__' ? null : regionId;
    where.type = type || 'title';
    if (isEnabled !== undefined && isEnabled !== '') where.isEnabled = String(isEnabled) === 'true' || String(isEnabled) === '1';

    const [list, total] = await Promise.all([
      this.prisma.userTitle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.userTitle.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createTitle(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('称号名称不能为空');

    const title = await this.prisma.userTitle.create({
      data: {
        regionId: data.regionId || null,
        name: data.name,
        icon: data.icon || null,
        image: data.image || data.titleImage || data.title_image || null,
        description: data.description || null,
        type: data.type || 'title',
        condition: data.condition || null,
        backgroundColor: data.backgroundColor || data.background_color || null,
        textColor: data.textColor || data.text_color || null,
        borderColor: data.borderColor || data.border_color || null,
        style: data.style || null,
        isEnabled: data.isEnabled ?? data.is_enabled ?? true,
        sortOrder: data.sortOrder || 0,
      },
    });

    await this.logOperation(operatorId, 'create', 'title', title.id, ip);
    return { success: true, data: title };
  }

  async updateTitle(id: string, data: any, operatorId: string, ip: string) {
    const title = await this.prisma.userTitle.findUnique({ where: { id } });
    if (!title) throw new NotFoundException('称号不存在');

    const updated = await this.prisma.userTitle.update({
      where: { id },
      data: {
        regionId: data.regionId !== undefined ? data.regionId || null : title.regionId,
        name: data.name ?? title.name,
        icon: data.icon !== undefined ? data.icon || null : title.icon,
        image: data.image !== undefined || data.titleImage !== undefined || data.title_image !== undefined
          ? data.image || data.titleImage || data.title_image || null
          : title.image,
        description: data.description !== undefined ? data.description || null : title.description,
        type: data.type ?? title.type,
        condition: data.condition !== undefined ? data.condition || null : title.condition,
        backgroundColor: data.backgroundColor !== undefined || data.background_color !== undefined
          ? data.backgroundColor || data.background_color || null
          : title.backgroundColor,
        textColor: data.textColor !== undefined || data.text_color !== undefined
          ? data.textColor || data.text_color || null
          : title.textColor,
        borderColor: data.borderColor !== undefined || data.border_color !== undefined
          ? data.borderColor || data.border_color || null
          : title.borderColor,
        style: data.style !== undefined ? data.style || null : title.style,
        isEnabled: data.isEnabled ?? data.is_enabled ?? title.isEnabled,
        sortOrder: data.sortOrder ?? title.sortOrder,
      },
    });

    await this.logOperation(operatorId, 'update', 'title', id, ip);
    return { success: true, data: updated };
  }

  async deleteTitle(id: string, operatorId: string, ip: string) {
    const title = await this.prisma.userTitle.findUnique({ where: { id } });
    if (!title) throw new NotFoundException('称号不存在');
    await this.prisma.userTitle.delete({ where: { id } });
    await this.logOperation(operatorId, 'delete', 'title', id, ip);
    return { success: true, message: '删除成功' };
  }

  // ==================== 分享有礼 ====================

  async getShareInviteConfig(regionId?: string) {
    if (regionId) {
      const [settings, couponConfig] = await Promise.all([
        this.prisma.shareSettings.findUnique({ where: { regionId } }).catch(() => null),
        this.prisma.config.findUnique({ where: { key: `share_invite_coupon_config_${regionId}` } }).catch(() => null),
      ]);
      const couponValue = this.parseJsonObject(couponConfig?.value);
      return {
        success: true,
        data: {
          regionId,
          enabled: settings?.isEnabled ?? false,
          isEnabled: settings?.isEnabled ?? false,
          activityTitle: settings?.activityTitle || '邀请好友得奖励',
          activityImage: settings?.activityImage || '',
          activityRules: this.shareRulesText(settings?.activityRules),
          inviterReward: this.toNumber(settings?.inviterReward, 10),
          inviteeReward: this.toNumber(settings?.inviteeReward, 5),
          userLimit: settings?.userLimit || 'NEW_USERS',
          dailyInviteLimit: settings?.dailyInviteLimit ?? 10,
          totalInviteLimit: settings?.totalInviteLimit ?? 100,
          maxInvites: settings?.totalInviteLimit ?? 100,
          inviterCouponId: couponValue.inviterCouponId || '',
          inviteeCouponId: couponValue.inviteeCouponId || '',
          startTime: settings?.startTime || null,
          endTime: settings?.endTime || null,
          requireInviterPhone: settings?.requireInviterPhone ?? false,
          requireInviteePhone: settings?.requireInviteePhone ?? false,
          requireInviterStudentVerify: settings?.requireInviterStudentVerify ?? false,
          requireInviteeStudentVerify: settings?.requireInviteeStudentVerify ?? false,
          minInviterAccountAgeDays: settings?.minInviterAccountAgeDays ?? 0,
          minInviteeAccountAgeMinutes: settings?.minInviteeAccountAgeMinutes ?? 0,
          inviteCooldownMinutes: settings?.inviteCooldownMinutes ?? 0,
          maxRecentInvites: settings?.maxRecentInvites ?? 0,
          recentWindowMinutes: settings?.recentWindowMinutes ?? 10,
          sameIpDailyLimit: settings?.sameIpDailyLimit ?? 0,
          sameDeviceDailyLimit: settings?.sameDeviceDailyLimit ?? 0,
          sameDeviceTotalLimit: settings?.sameDeviceTotalLimit ?? 0,
          totalRewardBudget: this.toNumber(settings?.totalRewardBudget, 0),
          singleRewardCap: this.toNumber(settings?.singleRewardCap, 0),
          rewardReleaseMode: settings?.rewardReleaseMode || 'immediate',
          rewardDelayHours: settings?.rewardDelayHours ?? 0,
          inviterWhitelist: Array.isArray(settings?.inviterWhitelist) ? settings?.inviterWhitelist : [],
          inviterBlacklist: Array.isArray(settings?.inviterBlacklist) ? settings?.inviterBlacklist : [],
          inviteeBlacklist: Array.isArray(settings?.inviteeBlacklist) ? settings?.inviteeBlacklist : [],
          blockedPhonePrefixes: Array.isArray(settings?.blockedPhonePrefixes) ? settings?.blockedPhonePrefixes : [],
        },
      };
    }
    const config = await this.prisma.config.findUnique({ where: { key: 'share_invite_config' } });
    const value = (config?.value || {}) as any;
    return {
      success: true,
      data: {
        enabled: true,
        inviterReward: 10,
        inviteeReward: 5,
        maxInvites: 100,
        ...value,
      },
    };
  }

  async saveShareInviteConfig(data: any, operatorId: string, ip: string) {
    const regionId = this.nullableString(data.regionId);
    if (regionId) {
      const totalInviteLimit = this.toInt(data.totalInviteLimit ?? data.maxInvites, 100, 0);
      const inviterCouponId = this.nullableString(data.inviterCouponId) || '';
      const inviteeCouponId = this.nullableString(data.inviteeCouponId) || '';
      const rewardReleaseMode = ['immediate', 'manual', 'delayed', 'qualified'].includes(String(data.rewardReleaseMode || '').toLowerCase())
        ? String(data.rewardReleaseMode).toLowerCase()
        : 'immediate';
      await Promise.all([
        this.assertShareCouponUsable(inviterCouponId, regionId, '邀请人奖励'),
        this.assertShareCouponUsable(inviteeCouponId, regionId, '新人奖励'),
      ]);
      const riskData = {
        requireInviterPhone: data.requireInviterPhone === true,
        requireInviteePhone: data.requireInviteePhone === true,
        requireInviterStudentVerify: data.requireInviterStudentVerify === true,
        requireInviteeStudentVerify: data.requireInviteeStudentVerify === true,
        minInviterAccountAgeDays: this.toInt(data.minInviterAccountAgeDays, 0, 0, 3650),
        minInviteeAccountAgeMinutes: this.toInt(data.minInviteeAccountAgeMinutes, 0, 0, 14400),
        inviteCooldownMinutes: this.toInt(data.inviteCooldownMinutes, 0, 0, 1440),
        maxRecentInvites: this.toInt(data.maxRecentInvites, 0, 0, 1000),
        recentWindowMinutes: this.toInt(data.recentWindowMinutes, 10, 1, 1440),
        sameIpDailyLimit: this.toInt(data.sameIpDailyLimit, 0, 0, 10000),
        sameDeviceDailyLimit: this.toInt(data.sameDeviceDailyLimit, 0, 0, 10000),
        sameDeviceTotalLimit: this.toInt(data.sameDeviceTotalLimit, 0, 0, 10000),
        totalRewardBudget: this.toNumber(data.totalRewardBudget, 0),
        singleRewardCap: this.toNumber(data.singleRewardCap, 0),
        rewardReleaseMode,
        rewardDelayHours: this.toInt(data.rewardDelayHours, 0, 0, 720),
        inviterWhitelist: this.parseStringList(data.inviterWhitelist),
        inviterBlacklist: this.parseStringList(data.inviterBlacklist),
        inviteeBlacklist: this.parseStringList(data.inviteeBlacklist),
        blockedPhonePrefixes: this.parseStringList(data.blockedPhonePrefixes),
      };
      const saved = await this.prisma.shareSettings.upsert({
        where: { regionId },
        create: {
          regionId,
          isEnabled: data.enabled !== false && data.isEnabled !== false,
          activityTitle: this.nullableString(data.activityTitle) || '邀请好友得奖励',
          activityImage: this.nullableString(data.activityImage),
          activityRules: this.nullableString(data.activityRules) || '邀请好友注册成功后，邀请人和新人都可以获得奖励。',
          inviterReward: this.toNumber(data.inviterReward ?? data.inviteReward, 0),
          inviteeReward: this.toNumber(data.inviteeReward, 0),
          userLimit: data.userLimit === 'ALL_USERS' ? 'ALL_USERS' : 'NEW_USERS',
          dailyInviteLimit: this.toInt(data.dailyInviteLimit, 10, 0),
          totalInviteLimit,
          startTime: this.toDate(data.startTime, null),
          endTime: this.toDate(data.endTime, null),
          ...riskData,
        },
        update: {
          isEnabled: data.enabled !== false && data.isEnabled !== false,
          activityTitle: this.nullableString(data.activityTitle) || '邀请好友得奖励',
          activityImage: this.nullableString(data.activityImage),
          activityRules: this.nullableString(data.activityRules) || '邀请好友注册成功后，邀请人和新人都可以获得奖励。',
          inviterReward: this.toNumber(data.inviterReward ?? data.inviteReward, 0),
          inviteeReward: this.toNumber(data.inviteeReward, 0),
          userLimit: data.userLimit === 'ALL_USERS' ? 'ALL_USERS' : 'NEW_USERS',
          dailyInviteLimit: this.toInt(data.dailyInviteLimit, 10, 0),
          totalInviteLimit,
          startTime: this.toDate(data.startTime, null),
          endTime: this.toDate(data.endTime, null),
          ...riskData,
        },
      });
      await this.prisma.config.upsert({
        where: { key: `share_invite_coupon_config_${regionId}` },
        update: {
          value: {
            inviterCouponId,
            inviteeCouponId,
          },
          updatedAt: new Date(),
        },
        create: {
          key: `share_invite_coupon_config_${regionId}`,
          value: {
            inviterCouponId,
            inviteeCouponId,
          },
          group: 'marketing',
          desc: '分享有礼优惠券奖励配置',
        },
      });

      await this.logOperation(operatorId, 'save', 'share_invite_config', regionId, ip);
      return { success: true, data: saved };
    }

    const value = {
      enabled: data.enabled !== false,
      inviterReward: this.toNumber(data.inviterReward ?? data.inviteReward, 0),
      inviteeReward: this.toNumber(data.inviteeReward, 0),
      maxInvites: this.toInt(data.maxInvites, 100, 0),
    };
    await this.prisma.config.upsert({
      where: { key: 'share_invite_config' },
      update: { value, updatedAt: new Date() },
      create: { key: 'share_invite_config', value, group: 'marketing' },
    });

    await this.logOperation(operatorId, 'save', 'share_invite_config', 'global', ip);
    return { success: true };
  }

  async getShareInviteRecords(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, inviterId, inviteeId, regionId, keyword } = query;
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
      this.prisma.shareInvite.findMany({
        where,
        include: {
          inviter: { select: { id: true, nickname: true, avatar: true } },
          invitee: { select: { id: true, nickname: true, avatar: true } },
          rewards: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shareInvite.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  // ==================== 活动管理 ====================

  async getActivities(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, regionId, keyword } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (keyword) where.title = { contains: keyword.trim() };

    const [list, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          region: { select: { id: true, name: true } },
          type: { select: { id: true, name: true } },
          packages: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { joins: true, orders: true, packages: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  async createActivity(data: any, operatorId: string, ip: string) {
    if (!data.title) throw new BadRequestException('活动标题不能为空');

    const activity = await this.prisma.activity.create({
      data: this.normalizeActivityPayload(data),
    });

    await this.logOperation(operatorId, 'create', 'activity', activity.id, ip);
    return { success: true, data: activity };
  }

  async updateActivity(id: string, data: any, operatorId: string, ip: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('活动不存在');

    const updated = await this.prisma.activity.update({
      where: { id },
      data: this.normalizeActivityPayload(data, activity),
    });

    await this.logOperation(operatorId, 'update', 'activity', id, ip);
    return { success: true, data: updated };
  }

  async getActivityOrders(id: string, query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);

    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({
        where: { activityId: id },
        include: {
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
          package: { select: { id: true, name: true, price: true } },
          tickets: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityOrder.count({ where: { activityId: id } }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  async getActivityUsers(id: string, query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);

    const [list, total] = await Promise.all([
      this.prisma.activityJoin.findMany({
        where: { activityId: id },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityJoin.count({ where: { activityId: id } }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  // ==================== 团购管理 ====================

  async getGroupBuys(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, keyword, regionId, categoryId, merchantId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    if (merchantId) where.merchantId = merchantId;
    if (keyword) where.name = { contains: keyword.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          Category: { select: { id: true, name: true } },
          Merchant: { select: { id: true, name: true } },
          _count: { select: { Orders: true, Reviews: true } },
        },
      }),
      this.prisma.groupBuyPackage.count({ where }),
    ]);

    const list = rows.map((item: any) => ({
      ...item,
      originalPrice: item.originPrice,
      minPeople: item.stock,
      categoryName: item.Category?.name || '',
      merchantName: item.Merchant?.name || '',
      orderCount: item._count?.Orders || 0,
      reviewCount: item._count?.Reviews || 0,
    }));

    return { success: true, data: { list, total, page, pageSize } };
  }

  async createGroupBuy(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('团购名称不能为空');

    const groupBuy = await this.prisma.groupBuyPackage.create({
      data: this.normalizeGroupBuyPayload(data),
    });

    await this.logOperation(operatorId, 'create', 'group_buy', groupBuy.id, ip);
    return { success: true, data: groupBuy };
  }

  async updateGroupBuy(id: string, data: any, operatorId: string, ip: string) {
    const groupBuy = await this.prisma.groupBuyPackage.findUnique({ where: { id } });
    if (!groupBuy) throw new NotFoundException('团购不存在');

    const updated = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: this.normalizeGroupBuyPayload(data, groupBuy),
    });

    await this.logOperation(operatorId, 'update', 'group_buy', id, ip);
    return { success: true, data: updated };
  }

  async getGroupBuyOrders(id: string, query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);

    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({
        where: { packageId: id },
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.groupBuyOrder.count({ where: { packageId: id } }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  // ==================== 首页权益卡片 ====================

  async getPopups(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, regionId } = query;
    const where: any = { position: 'popup' };
    if (status !== undefined && status !== '') where.status = Number(status);
    if (regionId) where.regionId = regionId;

    const [rows, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    const list = rows.map((item: any) => this.formatPopupForClient(item));

    return { success: true, data: { list, total, page, pageSize } };
  }

  async createPopup(data: any, operatorId: string, ip: string) {
    const popup = await this.prisma.advertisement.create({
      data: {
        ...this.normalizePopupPayload(data, undefined, operatorId),
        createdBy: operatorId,
      },
    });

    await this.logOperation(operatorId, 'create', 'popup', popup.id, ip);
    return { success: true, data: popup };
  }

  async updatePopup(id: string, data: any, operatorId: string, ip: string) {
    const popup = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!popup) throw new NotFoundException('首页权益卡片不存在');

    const updated = await this.prisma.advertisement.update({
      where: { id },
      data: this.normalizePopupPayload(data, popup, operatorId),
    });

    await this.logOperation(operatorId, 'update', 'popup', id, ip);
    return { success: true, data: updated };
  }

  async deletePopup(id: string, operatorId: string, ip: string) {
    const popup = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!popup) throw new NotFoundException('首页权益卡片不存在');

    await this.prisma.advertisement.delete({ where: { id } });
    await this.logOperation(operatorId, 'delete', 'popup', id, ip);
    return { success: true };
  }

  // ==================== 系统通知 ====================

  async getNotifications(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { type, regionId } = query;
    const where: any = {};
    if (type) where.type = type;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  async sendNotification(data: any, operatorId: string, ip: string) {
    if (!data.title || !data.content) throw new BadRequestException('标题和内容不能为空');

    const { targetType, targetUsers, regionId, title, content, type, linkType, linkValue, channelMask } = data;

    let count = 0;
    if (targetType === 'specific') {
      const userIds = [...new Set((Array.isArray(targetUsers) ? targetUsers : []).map(String).filter(Boolean))];
      if (!userIds.length) throw new BadRequestException('请选择接收用户');
      const existingUsers = await this.prisma.user.findMany({
        where: { id: { in: userIds }, deletedAt: null },
        select: { id: true },
      });
      const results = await Promise.all(existingUsers.map((user) => this.notifyService.createAndDispatch({
        userId: user.id,
        regionId: regionId || undefined,
        type: type || 'ADMIN_BROADCAST',
        scene: 'admin_broadcast',
        title,
        content,
        data: { operatorId },
        linkType: linkType || undefined,
        linkValue: linkValue || undefined,
        channelMask: channelMask || { inApp: true, websocket: true },
      })));
      count = results.filter((item: any) => !item?.skipped).length;
    } else {
      if (targetType === 'region' && !regionId) throw new BadRequestException('请选择要发送的区域');
      const result = await this.notifyService.adminBroadcast(operatorId, {
        title,
        content,
        regionId: regionId || undefined,
        linkType: linkType || undefined,
        linkValue: linkValue || undefined,
        data: { operatorId },
        channelMask,
      });
      count = result.createdCount;
    }

    await this.logOperation(operatorId, 'send', 'notification', `count:${count}`, ip);
    return { success: true, count };
  }

  async getNotificationRecords(query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.adminOperationLog.findMany({
        where: { module: 'notification', action: 'send' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.adminOperationLog.count({ where: { module: 'notification', action: 'send' } }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }
}
