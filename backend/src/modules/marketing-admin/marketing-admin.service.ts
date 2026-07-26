import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class MarketingAdminService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      name: data.name ?? data.title ?? current?.name,
      image: data.image ?? current?.image,
      linkType: data.linkType ?? current?.linkType ?? 'none',
      linkValue: data.linkValue !== undefined ? this.nullableString(data.linkValue) : data.link !== undefined ? this.nullableString(data.link) : current?.linkValue,
      position: 'popup',
      startTime: this.toDate(data.startTime ?? data.startAt, current?.startTime ?? null),
      endTime: this.toDate(data.endTime ?? data.endAt, current?.endTime ?? null),
      priority: data.priority !== undefined ? this.toInt(data.priority, 0, 0) : current?.priority,
      status: data.status !== undefined
        ? (data.status === 'active' || data.status === true ? 1 : data.status === 'inactive' || data.status === false ? 0 : this.toInt(data.status, 1, 0, 1))
        : current?.status ?? 1,
      regionId: data.regionId !== undefined ? this.nullableString(data.regionId) : current?.regionId,
      updatedBy: operatorId,
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

  // ==================== 优惠券 ====================

  async getCoupons(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { status, keyword, regionId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
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

  // ==================== 签到配置 ====================

  async getSignConfig(regionId?: string) {
    const key = regionId ? `sign_config_${regionId}` : 'sign_config_global';
    const config = await this.prisma.config.findUnique({ where: { key } });
    return {
      success: true,
      data: config?.value || {
        enabled: true,
        dailyReward: 10,
        continuousRewards: [20, 30, 50, 80, 100],
        maxContinuousDays: 7,
        regionId: regionId || null,
      },
    };
  }

  async saveSignConfig(data: any, operatorId: string, ip: string) {
    const key = data.regionId ? `sign_config_${data.regionId}` : 'sign_config_global';
    const value = {
      enabled: data.enabled !== false,
      dailyReward: this.toNumber(data.dailyReward, 0),
      continuousRewards: Array.isArray(data.continuousRewards)
        ? data.continuousRewards.map((item: any) => this.toNumber(item, 0))
        : [],
      maxContinuousDays: this.toInt(data.maxContinuousDays, 7, 1, 365),
      regionId: this.nullableString(data.regionId) || null,
    };

    await this.prisma.config.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value, group: 'marketing' },
    });

    await this.logOperation(operatorId, 'save', 'sign_config', data.regionId || 'global', ip);
    return { success: true };
  }

  async getSignRecords(query: any) {
    const page = this.toInt(query.page, 1, 1);
    const pageSize = this.toInt(query.pageSize || query.limit, 20, 1, 100);
    const { userId, startDate, endDate } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.checkIn.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.checkIn.count({ where }),
    ]);

    return { success: true, data: { list, total, page, pageSize } };
  }

  // ==================== 徽章配置 ====================

  async getBadges(query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.badge.findMany({
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.badge.count(),
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

  // ==================== 称号配置 ====================

  async getTitles(query: any) {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };

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
        description: data.description || null,
        type: data.type || 'title',
        condition: data.condition || null,
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
        description: data.description !== undefined ? data.description || null : title.description,
        type: data.type ?? title.type,
        condition: data.condition !== undefined ? data.condition || null : title.condition,
        sortOrder: data.sortOrder ?? title.sortOrder,
      },
    });

    await this.logOperation(operatorId, 'update', 'title', id, ip);
    return { success: true, data: updated };
  }

  // ==================== 分享有礼 ====================

  async getShareInviteConfig() {
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
    const { status, inviterId, inviteeId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (inviterId) where.inviterId = inviterId;
    if (inviteeId) where.inviteeId = inviteeId;

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
          _count: { select: { joins: true, orders: true } },
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
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
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

  // ==================== 弹窗广告 ====================

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

    const list = rows.map((item: any) => ({
      ...item,
      title: item.name,
      link: item.linkValue,
      startAt: item.startTime,
      endAt: item.endTime,
      statusText: item.status === 1 ? 'active' : 'inactive',
    }));

    return { success: true, data: { list, total, page, pageSize } };
  }

  async createPopup(data: any, operatorId: string, ip: string) {
    if (!data.name && !data.title) throw new BadRequestException('弹窗标题不能为空');

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
    if (!popup) throw new NotFoundException('弹窗广告不存在');

    const updated = await this.prisma.advertisement.update({
      where: { id },
      data: this.normalizePopupPayload(data, popup, operatorId),
    });

    await this.logOperation(operatorId, 'update', 'popup', id, ip);
    return { success: true, data: updated };
  }

  async deletePopup(id: string, operatorId: string, ip: string) {
    const popup = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!popup) throw new NotFoundException('弹窗广告不存在');

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

    let userIds: string[] = [];

    if (regionId || targetType === 'region') {
      if (!regionId) throw new BadRequestException('请选择要发送的区域');
      const profiles = await this.prisma.userProfile.findMany({
        where: { region: regionId },
        select: { userId: true },
      });
      userIds = profiles.map((profile) => profile.userId);
    } else if (targetType === 'all' || !targetType) {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      userIds = users.map(u => u.id);
    } else if (targetType === 'specific' && targetUsers?.length) {
      userIds = targetUsers;
    }

    // 批量创建通知
    const notifications = userIds.map(userId => ({
      userId,
      regionId: regionId || null,
      title,
      content,
      type: type || 'ADMIN_BROADCAST',
      scene: 'admin_broadcast',
      linkType: linkType || null,
      linkValue: linkValue || null,
      channelMask: channelMask || { inApp: true, websocket: true },
      isRead: false,
    }));

    if (notifications.length > 0) {
      await this.prisma.notification.createMany({ data: notifications });
    }

    await this.logOperation(operatorId, 'send', 'notification', `count:${notifications.length}`, ip);
    return { success: true, count: notifications.length };
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
