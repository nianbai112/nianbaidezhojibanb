import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class MarketingAdminService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { page = 1, pageSize = 20, status, keyword, regionId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createCoupon(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('优惠券名称不能为空');

    const coupon = await this.prisma.coupon.create({
      data: {
        name: data.name,
        type: data.type || 'discount',
        value: data.value || 0,
        minAmount: data.minAmount || 0,
        totalCount: data.totalCount || 0,
        limitPerUser: data.limitPerUser || 1,
        startAt: data.startAt ? new Date(data.startAt) : new Date(),
        endAt: data.endAt ? new Date(data.endAt) : new Date(),
        status: data.status || 'active',
        description: data.description,
        regionId: data.regionId,
        merchantId: data.merchantId,
      },
    });

    await this.logOperation(operatorId, 'create', 'coupon', coupon.id, ip);
    return { success: true, data: coupon };
  }

  async updateCoupon(id: string, data: any, operatorId: string, ip: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('优惠券不存在');

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        name: data.name ?? coupon.name,
        type: data.type ?? coupon.type,
        value: data.value ?? coupon.value,
        minAmount: data.minAmount ?? coupon.minAmount,
        totalCount: data.totalCount ?? coupon.totalCount,
        limitPerUser: data.limitPerUser ?? coupon.limitPerUser,
        startAt: data.startAt ? new Date(data.startAt) : coupon.startAt,
        endAt: data.endAt ? new Date(data.endAt) : coupon.endAt,
        status: data.status ?? coupon.status,
        description: data.description ?? coupon.description,
      },
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
    const { page = 1, pageSize = 20, couponId, userId } = query;
    const where: any = {};
    if (couponId) where.couponId = couponId;
    if (userId) where.userId = userId;

    const [list, total] = await Promise.all([
      this.prisma.couponReceive.findMany({
        where,
        include: { coupon: true, user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.couponReceive.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
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

    await this.prisma.config.upsert({
      where: { key },
      update: { value: data, updatedAt: new Date() },
      create: { key, value: data, group: 'marketing' },
    });

    await this.logOperation(operatorId, 'save', 'sign_config', data.regionId || 'global', ip);
    return { success: true };
  }

  async getSignRecords(query: any) {
    const { page = 1, pageSize = 20, userId, regionId, startDate, endDate } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;
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
        take: Number(pageSize),
      }),
      this.prisma.checkIn.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
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
    return {
      success: true,
      data: config?.value || {
        enabled: true,
        inviterReward: 10,
        inviteeReward: 5,
        maxInvites: 100,
      },
    };
  }

  async saveShareInviteConfig(data: any, operatorId: string, ip: string) {
    await this.prisma.config.upsert({
      where: { key: 'share_invite_config' },
      update: { value: data, updatedAt: new Date() },
      create: { key: 'share_invite_config', value: data, group: 'marketing' },
    });

    await this.logOperation(operatorId, 'save', 'share_invite_config', 'global', ip);
    return { success: true };
  }

  async getShareInviteRecords(query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.shareInvite.findMany({
        include: {
          inviter: { select: { id: true, nickname: true, avatar: true } },
          invitee: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.shareInvite.count(),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  // ==================== 活动管理 ====================

  async getActivities(query: any) {
    const { page = 1, pageSize = 20, status, regionId, keyword } = query;
    const where: any = {};
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (keyword) where.title = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createActivity(data: any, operatorId: string, ip: string) {
    if (!data.title) throw new BadRequestException('活动标题不能为空');

    const activity = await this.prisma.activity.create({
      data: {
        title: data.title,
        description: data.description,
        cover: data.cover,
        location: data.location,
        startAt: data.startAt ? new Date(data.startAt) : new Date(),
        endAt: data.endAt ? new Date(data.endAt) : new Date(),
        maxPeople: data.maxPeople,
        fee: data.fee || 0,
        status: data.status || 'upcoming',
        regionId: data.regionId,
        typeId: data.typeId,
        visibility: data.visibility || 'public',
      },
    });

    await this.logOperation(operatorId, 'create', 'activity', activity.id, ip);
    return { success: true, data: activity };
  }

  async updateActivity(id: string, data: any, operatorId: string, ip: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('活动不存在');

    const updated = await this.prisma.activity.update({
      where: { id },
      data: {
        title: data.title ?? activity.title,
        description: data.description ?? activity.description,
        cover: data.cover ?? activity.cover,
        location: data.location ?? activity.location,
        startAt: data.startAt ? new Date(data.startAt) : activity.startAt,
        endAt: data.endAt ? new Date(data.endAt) : activity.endAt,
        maxPeople: data.maxPeople ?? activity.maxPeople,
        fee: data.fee ?? activity.fee,
        status: data.status ?? activity.status,
        visibility: data.visibility ?? activity.visibility,
      },
    });

    await this.logOperation(operatorId, 'update', 'activity', id, ip);
    return { success: true, data: updated };
  }

  async getActivityOrders(id: string, query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({
        where: { activityId: id },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.activityOrder.count({ where: { activityId: id } }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async getActivityUsers(id: string, query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.activityJoin.findMany({
        where: { activityId: id },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.activityJoin.count({ where: { activityId: id } }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  // ==================== 团购管理 ====================

  async getGroupBuys(query: any) {
    const { page = 1, pageSize = 20, status, keyword } = query;
    const where: any = {};
    if (status) where.status = status;
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.groupBuyPackage.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createGroupBuy(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('团购名称不能为空');

    const groupBuy = await this.prisma.groupBuyPackage.create({
      data: {
        name: data.name,
        description: data.description,
        cover: data.cover,
        price: data.price || 0,
        originPrice: data.originalPrice,
        stock: data.stock || 0,
        startAt: data.startAt ? new Date(data.startAt) : new Date(),
        endAt: data.endAt ? new Date(data.endAt) : new Date(),
        status: data.status || 'active',
        regionId: data.regionId,
        categoryId: data.categoryId,
        merchantId: data.merchantId,
      },
    });

    await this.logOperation(operatorId, 'create', 'group_buy', groupBuy.id, ip);
    return { success: true, data: groupBuy };
  }

  async updateGroupBuy(id: string, data: any, operatorId: string, ip: string) {
    const groupBuy = await this.prisma.groupBuyPackage.findUnique({ where: { id } });
    if (!groupBuy) throw new NotFoundException('团购不存在');

    const updated = await this.prisma.groupBuyPackage.update({
      where: { id },
      data: {
        name: data.name ?? groupBuy.name,
        description: data.description ?? groupBuy.description,
        cover: data.cover ?? groupBuy.cover,
        price: data.price ?? groupBuy.price,
        originPrice: data.originalPrice ?? groupBuy.originPrice,
        stock: data.stock ?? groupBuy.stock,
        startAt: data.startAt ? new Date(data.startAt) : groupBuy.startAt,
        endAt: data.endAt ? new Date(data.endAt) : groupBuy.endAt,
        status: data.status ?? groupBuy.status,
      },
    });

    await this.logOperation(operatorId, 'update', 'group_buy', id, ip);
    return { success: true, data: updated };
  }

  async getGroupBuyOrders(id: string, query: any) {
    const { page = 1, pageSize = 20 } = query;

    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({
        where: { packageId: id },
        include: { User: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.groupBuyOrder.count({ where: { packageId: id } }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  // ==================== 弹窗广告 ====================

  async getPopups(query: any) {
    const { page = 1, pageSize = 20, status, regionId } = query;
    const where: any = { position: 'popup' };
    if (status !== undefined && status !== '') where.status = Number(status);
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async createPopup(data: any, operatorId: string, ip: string) {
    if (!data.name) throw new BadRequestException('弹窗标题不能为空');

    const popup = await this.prisma.advertisement.create({
      data: {
        name: data.name,
        image: data.image,
        linkType: data.linkType || 'none',
        linkValue: data.link,
        position: 'popup',
        startTime: data.startAt ? new Date(data.startAt) : null,
        endTime: data.endAt ? new Date(data.endAt) : null,
        status: data.status !== undefined ? Number(data.status) : 1,
        regionId: data.regionId,
        createdBy: operatorId,
        updatedBy: operatorId,
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
      data: {
        name: data.name ?? popup.name,
        image: data.image ?? popup.image,
        linkType: data.linkType ?? popup.linkType,
        linkValue: data.link ?? popup.linkValue,
        startTime: data.startAt ? new Date(data.startAt) : popup.startTime,
        endTime: data.endAt ? new Date(data.endAt) : popup.endTime,
        status: data.status !== undefined ? Number(data.status) : popup.status,
        regionId: data.regionId ?? popup.regionId,
        updatedBy: operatorId,
      },
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
    const { page = 1, pageSize = 20, type } = query;
    const where: any = {};
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } };
  }

  async sendNotification(data: any, operatorId: string, ip: string) {
    if (!data.title || !data.content) throw new BadRequestException('标题和内容不能为空');

    const { targetType, targetUsers, title, content, type } = data;

    let userIds: string[] = [];

    if (targetType === 'all') {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      userIds = users.map(u => u.id);
    } else if (targetType === 'specific' && targetUsers?.length) {
      userIds = targetUsers;
    }

    // 批量创建通知
    const notifications = userIds.map(userId => ({
      userId,
      title,
      content,
      type: type || 'SYSTEM',
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
