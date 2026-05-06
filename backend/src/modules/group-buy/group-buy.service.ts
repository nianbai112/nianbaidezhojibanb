import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class GroupBuyService {
  constructor(private readonly prisma: PrismaService) {}

  // ================= 概览统计 (Overview) =================
  async getAdminStats(regionId?: string) {
    const pkgWhere: any = regionId ? { regionId } : {};
    const orderWhere: any = regionId ? { Package: { regionId } } : {};

    const totalPackages = await this.prisma.groupBuyPackage.count({ where: pkgWhere });
    const activePackages = await this.prisma.groupBuyPackage.count({ where: { ...pkgWhere, status: 'active' } });

    const totalOrders = await this.prisma.groupBuyOrder.count({ where: orderWhere });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await this.prisma.groupBuyOrder.count({
      where: { ...orderWhere, createdAt: { gte: today } }
    });

    const totalRevenueResult = await this.prisma.groupBuyOrder.aggregate({
      _sum: { amount: true },
      where: { status: 'paid', ...orderWhere }
    });
    const totalRevenue = totalRevenueResult._sum.amount || 0;

    // 核销率
    const verifiedCount = await this.prisma.groupBuyOrder.count({
      where: { ...orderWhere, verifyStatus: 'verified' }
    });
    const verifyRate = totalOrders > 0 ? (verifiedCount / totalOrders * 100).toFixed(1) : '0';

    // 退款率
    const refundedCount = await this.prisma.groupBuyOrder.count({
      where: { ...orderWhere, status: 'refunded' }
    });
    const refundRate = totalOrders > 0 ? (refundedCount / totalOrders * 100).toFixed(1) : '0';

    // Last 7 days trend
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));

      const count = await this.prisma.groupBuyOrder.count({
        where: { ...orderWhere, createdAt: { gte: start, lte: end } }
      });
      trends.push({ date: start.toISOString().split('T')[0], count });
    }

    // Top 10 packages by sales
    const topPackages = await this.prisma.groupBuyPackage.findMany({
      where: pkgWhere,
      orderBy: { soldCount: 'desc' },
      take: 10,
      select: { id: true, name: true, soldCount: true, price: true }
    });

    return {
      totalPackages, activePackages, totalOrders, todayOrders,
      totalRevenue, verifyRate, refundRate, trends, topPackages
    };
  }

  // ================= 配置 (Config) =================
  async getAdminConfig(regionId: string) {
    if (!regionId) throw new BadRequestException('regionId is required');
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new BadRequestException('Region not found');
    const settings: any = region.settings || {};
    return {
      isOpen: true,
      requireAudit: false,
      commissionRate: 5,
      regionCommissionRate: 2,
      description: '',
      ...(settings.groupBuyConfig || {})
    };
  }

  async updateAdminConfig(regionId: string, dto: any) {
    if (!regionId) throw new BadRequestException('regionId is required');
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new BadRequestException('Region not found');

    const settings: any = region.settings || {};
    settings.groupBuyConfig = { ...settings.groupBuyConfig, ...dto };

    await this.prisma.region.update({
      where: { id: regionId },
      data: { settings }
    });
    return settings.groupBuyConfig;
  }

  // ================= 分类管理 (Category) =================
  async getAdminCategories(query: any) {
    const { page = 1, limit = 20, regionId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.groupBuyCategory.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { sortOrder: 'asc' }
      }),
      this.prisma.groupBuyCategory.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createCategory(dto: any) {
    return this.prisma.groupBuyCategory.create({ data: dto as any });
  }

  async updateCategory(id: string, dto: any) {
    return this.prisma.groupBuyCategory.update({ where: { id }, data: dto as any });
  }

  async deleteCategory(id: string) {
    const count = await this.prisma.groupBuyPackage.count({ where: { categoryId: id } });
    if (count > 0) throw new BadRequestException('分类下存在套餐，无法删除');
    return this.prisma.groupBuyCategory.delete({ where: { id } });
  }

  // ================= 套餐管理 (Package) =================
  async getAdminPackages(query: any) {
    const { page = 1, limit = 20, regionId, categoryId, merchantId, keyword, status } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.groupBuyPackage.findMany({
        where,
        include: { Category: true, Merchant: { select: { id: true, name: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.groupBuyPackage.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createPackage(dto: any) {
    return this.prisma.groupBuyPackage.create({ data: dto as any });
  }

  async updatePackage(id: string, dto: any) {
    return this.prisma.groupBuyPackage.update({ where: { id }, data: dto as any });
  }

  async deletePackage(id: string) {
    return this.prisma.groupBuyPackage.delete({ where: { id } });
  }

  // ================= 订单管理 (Order) =================
  async getAdminOrders(query: any) {
    const { page = 1, limit = 20, regionId, orderNo, status, startAt, endAt } = query;
    const where: any = {};
    if (regionId) where.Package = { regionId };
    if (orderNo) where.orderNo = { contains: orderNo };
    if (status) where.status = status;
    if (startAt || endAt) {
      where.createdAt = {};
      if (startAt) where.createdAt.gte = new Date(startAt);
      if (endAt) where.createdAt.lte = new Date(endAt);
    }

    const [list, total] = await Promise.all([
      this.prisma.groupBuyOrder.findMany({
        where,
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          Package: { select: { id: true, name: true } }
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.groupBuyOrder.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getOrderDetail(id: string) {
    return this.prisma.groupBuyOrder.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, avatar: true, phone: true } },
        Package: { select: { id: true, name: true, cover: true, price: true } }
      }
    });
  }

  async verifyOrder(id: string, code: string) {
    const order = await this.prisma.groupBuyOrder.findUnique({ where: { id } });
    if (!order) throw new BadRequestException('订单不存在');
    if (order.status !== 'paid') throw new BadRequestException('订单状态不正确，仅已支付订单可核销');
    if (order.verifyStatus === 'verified') throw new BadRequestException('该订单已核销');
    if (order.verifyCode && order.verifyCode !== code) throw new BadRequestException('核销码错误');

    return this.prisma.groupBuyOrder.update({
      where: { id },
      data: { verifyStatus: 'verified', verifyTime: new Date(), status: 'completed' }
    });
  }

  async refundOrder(id: string, reason: string, amount?: number) {
    const order = await this.prisma.groupBuyOrder.findUnique({ where: { id } });
    if (!order) throw new BadRequestException('订单不存在');
    if (['refunding', 'refunded'].includes(order.status)) throw new BadRequestException('订单已在退款流程中');
    if (order.verifyStatus === 'verified') throw new BadRequestException('已核销订单不可退款');

    const refundAmount = amount || Number(order.amount);
    return this.prisma.groupBuyOrder.update({
      where: { id },
      data: {
        status: 'refunding',
        refundReason: reason,
        refundAmount,
        refundTime: new Date()
      }
    });
  }

  // ================= 评价管理 (Review) =================
  async getAdminReviews(query: any) {
    const { page = 1, limit = 20, regionId, rating, status } = query;
    const where: any = {};
    if (regionId) where.Package = { regionId };
    if (rating) where.rating = Number(rating);
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.groupBuyReview.findMany({
        where,
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          Package: { select: { id: true, name: true } },
          Order: { select: { id: true, orderNo: true } }
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.groupBuyReview.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async auditReview(id: string, status: string) {
    const updateData: any = { status };
    if (status === 'hidden') updateData.isHidden = true;
    else if (status === 'approved') updateData.isHidden = false;
    return this.prisma.groupBuyReview.update({ where: { id }, data: updateData });
  }

  async replyReview(id: string, reply: string) {
    return this.prisma.groupBuyReview.update({
      where: { id },
      data: { reply, replyAt: new Date() }
    });
  }

  async deleteReview(id: string) {
    return this.prisma.groupBuyReview.delete({ where: { id } });
  }
}
