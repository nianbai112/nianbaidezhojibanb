import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ActivityAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Activity CRUD ====================

  async getActivities(query: any) {
    const { page = 1, limit = 20, regionId, status, keyword, typeId, clubId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (typeId) where.typeId = typeId;
    if (clubId) where.clubId = clubId;
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          type: { select: { id: true, name: true } },
          club: { select: { id: true, name: true } },
          _count: { select: { joins: true, orders: true, packages: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getActivityDetail(id: string) {
    const item = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        type: true,
        club: true,
        packages: true,
        rewards: true,
        _count: { select: { joins: true, orders: true } },
      },
    });
    if (!item) throw new NotFoundException('活动不存在');
    return item;
  }

  async createActivity(dto: any) {
    if (dto.endAt && dto.startAt && new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }
    if (dto.signEndAt && dto.signStartAt && new Date(dto.signEndAt) <= new Date(dto.signStartAt)) {
      throw new BadRequestException('报名截止时间必须晚于报名开始时间');
    }
    return this.prisma.activity.create({
      data: {
        ...dto,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        signStartAt: dto.signStartAt ? new Date(dto.signStartAt) : undefined,
        signEndAt: dto.signEndAt ? new Date(dto.signEndAt) : undefined,
      },
    });
  }

  async updateActivity(id: string, dto: any) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('活动不存在');
    const data: any = { ...dto };
    if (data.startAt) data.startAt = new Date(data.startAt);
    if (data.endAt) data.endAt = new Date(data.endAt);
    if (data.signStartAt) data.signStartAt = new Date(data.signStartAt);
    if (data.signEndAt) data.signEndAt = new Date(data.signEndAt);
    delete data.id;
    return this.prisma.activity.update({ where: { id }, data });
  }

  async deleteActivity(id: string) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('活动不存在');
    const orderCount = await this.prisma.activityOrder.count({ where: { activityId: id } });
    if (orderCount > 0) throw new BadRequestException('该活动有关联订单，无法删除');
    return this.prisma.activity.delete({ where: { id } });
  }

  // ==================== Activity Type CRUD ====================

  async getTypes(query: any) {
    const { page = 1, limit = 20, regionId, keyword, isActive } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive;

    const [list, total] = await Promise.all([
      this.prisma.activityType.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { activities: true } } },
      }),
      this.prisma.activityType.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createType(dto: any) {
    return this.prisma.activityType.create({ data: dto });
  }

  async updateType(id: string, dto: any) {
    const existing = await this.prisma.activityType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('活动类型不存在');
    return this.prisma.activityType.update({ where: { id }, data: dto });
  }

  async deleteType(id: string) {
    const existing = await this.prisma.activityType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('活动类型不存在');
    const count = await this.prisma.activity.count({ where: { typeId: id } });
    if (count > 0) throw new BadRequestException('该类型有关联活动，无法删除');
    return this.prisma.activityType.delete({ where: { id } });
  }

  // ==================== Package CRUD ====================

  async getPackages(query: any) {
    const { page = 1, limit = 20, activityId } = query;
    const where: any = {};
    if (activityId) where.activityId = activityId;

    const [list, total] = await Promise.all([
      this.prisma.activityPackage.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { activity: { select: { id: true, title: true } } },
      }),
      this.prisma.activityPackage.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createPackage(dto: any) {
    const activity = await this.prisma.activity.findUnique({ where: { id: dto.activityId } });
    if (!activity) throw new NotFoundException('活动不存在');
    return this.prisma.activityPackage.create({
      data: {
        ...dto,
        saleStartAt: dto.saleStartAt ? new Date(dto.saleStartAt) : undefined,
        saleEndAt: dto.saleEndAt ? new Date(dto.saleEndAt) : undefined,
      },
    });
  }

  async updatePackage(id: string, dto: any) {
    const existing = await this.prisma.activityPackage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('套餐不存在');
    const data: any = { ...dto };
    if (data.saleStartAt) data.saleStartAt = new Date(data.saleStartAt);
    if (data.saleEndAt) data.saleEndAt = new Date(data.saleEndAt);
    delete data.id;
    return this.prisma.activityPackage.update({ where: { id }, data });
  }

  async deletePackage(id: string) {
    const existing = await this.prisma.activityPackage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('套餐不存在');
    const orderCount = await this.prisma.activityOrder.count({ where: { packageId: id } });
    if (orderCount > 0) throw new BadRequestException('该套餐有关联订单，无法删除');
    return this.prisma.activityPackage.delete({ where: { id } });
  }

  // ==================== Order Management ====================

  async getOrders(query: any) {
    const { page = 1, limit = 20, activityId, orderNo, payStatus, orderStatus, refundStatus, userId, keyword } = query;
    const where: any = {};
    if (activityId) where.activityId = activityId;
    if (orderNo) where.orderNo = { contains: orderNo };
    if (payStatus) where.payStatus = payStatus;
    if (orderStatus) where.orderStatus = orderStatus;
    if (refundStatus) where.refundStatus = refundStatus;
    if (userId) where.userId = userId;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { user: { nickname: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.activityOrder.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          activity: { select: { id: true, title: true } },
          package: { select: { id: true, name: true } },
          tickets: true,
        },
      }),
      this.prisma.activityOrder.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getOrderDetail(id: string) {
    const item = await this.prisma.activityOrder.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        activity: { select: { id: true, title: true, startAt: true, endAt: true } },
        package: true,
        tickets: true,
      },
    });
    if (!item) throw new NotFoundException('订单不存在');
    return item;
  }

  async auditRefund(id: string, dto: any) {
    const order = await this.prisma.activityOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.orderStatus !== 'paid' || !order.refundStatus) {
      throw new BadRequestException('该订单不在退款申请状态');
    }
    const data: any = { refundStatus: dto.status };
    if (dto.reason) data.refundReason = dto.reason;
    if (dto.status === 'rejected') {
      data.refundStatus = null;
      data.refundReason = dto.reason || '退款已拒绝';
    }
    return this.prisma.activityOrder.update({ where: { id }, data });
  }

  // ==================== Reward CRUD ====================

  async getRewards(query: any) {
    const { page = 1, limit = 20, activityId, regionId } = query;
    const where: any = {};
    if (activityId) where.activityId = activityId;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.activityReward.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { activity: { select: { id: true, title: true } } },
      }),
      this.prisma.activityReward.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createReward(dto: any) {
    return this.prisma.activityReward.create({ data: dto });
  }

  async updateReward(id: string, dto: any) {
    const existing = await this.prisma.activityReward.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('奖励不存在');
    return this.prisma.activityReward.update({ where: { id }, data: dto });
  }

  async deleteReward(id: string) {
    const existing = await this.prisma.activityReward.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('奖励不存在');
    return this.prisma.activityReward.delete({ where: { id } });
  }

  // ==================== Participants ====================

  async getParticipants(activityId: string, page = 1, limit = 20) {
    const where = { activityId, status: 'joined' };
    const [list, total] = await Promise.all([
      this.prisma.activityJoin.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } },
      }),
      this.prisma.activityJoin.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }
}
