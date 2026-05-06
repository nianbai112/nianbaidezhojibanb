import { Injectable, NotFoundException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ErrandService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(regionId: string) {
    return this.prisma.errandConfig.findUnique({ where: { regionId } });
  }

  async getItemSizes(regionId: string, applyTo: string) {
    return this.prisma.errandItemSize.findMany({ where: { regionId, ...(applyTo && { applyTo }) }, orderBy: { sortOrder: 'asc' } });
  }

  async getPickupPoints(regionId: string, type: string) {
    return this.prisma.errandPickupPoint.findMany({ where: { regionId, ...(type && { type }) } });
  }

  async createOrder(userId: string, dto: any) {
    const orderNo = `ERR${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return this.prisma.errandOrder.create({ data: { orderNo, userId, ...dto } });
  }

  async payOrder(userId: string, dto: any) {
    const { orderId, payChannel } = dto;
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new BadRequestException('无权支付该订单');
    if (order.status !== 'pending_pay') throw new BadRequestException('订单状态不允许支付');
    return this.prisma.errandOrder.update({
      where: { id: orderId },
      data: { status: 'pending_accept', payChannel, payTime: new Date() },
    });
  }

  async acceptOrder(orderId: string, userId: string) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: { riderId: userId, status: 'accepted', acceptTime: new Date() } });
  }

  async updateRiderStatus(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: { status: dto.status } });
  }

  async refundOrder(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: { refundStatus: 'refunding' } });
  }

  async getUserOrders(userId: string, query: any) {
    const { page = 1, limit = 20, filter_type, region_id } = query;
    const where: any = { userId };
    if (filter_type) where.type = filter_type;
    if (region_id) where.regionId = region_id;
    return this.prisma.errandOrder.findMany({ where, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } });
  }

  async getRegionCompletedOrders(query: any) {
    const { region_id, limit = 20 } = query;
    return this.prisma.errandOrder.findMany({ where: { regionId: region_id, status: 'completed' }, take: Number(limit), orderBy: { completeTime: 'desc' } });
  }

  async getPageConfig(regionId: string) {
    return { title: '跑腿', regionId };
  }

  async receiveOrder(userId: string, dto: any) {
    const { order_id } = dto;
    if (!order_id) throw new NotFoundException('order_id 必填');
    const order = await this.prisma.errandOrder.findUnique({ where: { id: order_id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new NotFoundException('无权操作该订单');
    return this.prisma.errandOrder.update({
      where: { id: order_id },
      data: { status: 'completed', completeTime: new Date() },
    });
  }

  async getDeliveryOrdersList(userId: string, query: any) {
    return this.prisma.errandOrder.findMany({ where: { riderId: userId }, orderBy: { createdAt: 'desc' } });
  }

  async updateDeliveryOrder(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: dto });
  }

  async returnToPool(orderId: string, userId: string, dto: any) {
    return this.prisma.errandOrder.update({ where: { id: orderId }, data: { riderId: null, status: 'pending_accept' } });
  }

  async getRiderInfo(userId: string) {
    return this.prisma.regionRider.findUnique({ where: { userId } });
  }

  async updateRiderInfo(userId: string, dto: any) {
    return this.prisma.regionRider.update({ where: { userId }, data: dto });
  }

  async getOrderStats(userId: string) {
    const total = await this.prisma.errandOrder.count({ where: { riderId: userId } });
    const today = await this.prisma.errandOrder.count({ where: { riderId: userId, createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } });
    return { total, today };
  }

  async applyRider(userId: string, dto: any) {
    return this.prisma.regionRider.create({ data: { userId, regionId: dto.region_id, realName: dto.real_name, idCard: dto.id_card, phone: dto.phone } });
  }

  async updateLocation(userId: string, dto: any) {
    return this.prisma.regionRider.update({ where: { userId }, data: { lat: dto.lat, lng: dto.lng, locationUpdatedAt: new Date() } });
  }

  async getRiderLocation(riderId: string) {
    return this.prisma.regionRider.findUnique({ where: { id: riderId }, select: { lat: true, lng: true, locationUpdatedAt: true } });
  }

  async requestTransfer(orderId: string, userId: string, dto: any) {
    return this.prisma.transferRequest.create({ data: { orderId, fromRiderId: userId, toRiderId: dto.target_rider_id } });
  }

  async getTransferRequests(userId: string) {
    return this.prisma.transferRequest.findMany({ where: { toRiderId: userId, status: 'pending' } });
  }

  async respondToTransfer(transferId: string, userId: string, dto: any) {
    return this.prisma.transferRequest.update({ where: { id: transferId }, data: { status: dto.action } });
  }

  async getRegionRiders() {
    return this.prisma.regionRider.findMany({ where: { status: 'online' } });
  }

  async getMyIncentiveRecords(userId: string, query: any) {
    const { page = 1, pageSize = 20 } = query;
    return this.prisma.incentiveRecord.findMany({ where: { userId }, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } });
  }

  // ================= 后台管理 (Admin) =================
  async getAdminConfig(regionId: string) {
    if (!regionId) throw new BadRequestException('regionId is required');
    let config = await this.prisma.errandConfig.findUnique({ where: { regionId } });
    if (!config) {
      config = await this.prisma.errandConfig.create({ data: { regionId } });
    }
    return config;
  }

  async updateAdminConfig(regionId: string, dto: any) {
    if (!regionId) throw new BadRequestException('regionId is required');
    return this.prisma.errandConfig.upsert({
      where: { regionId },
      update: dto,
      create: { regionId, ...dto },
    });
  }

  async getAdminItemSizes(query: any) {
    const { page = 1, limit = 20, regionId } = query;
    const where = regionId ? { regionId } : {};
    const [list, total] = await Promise.all([
      this.prisma.errandItemSize.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.errandItemSize.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createItemSize(dto: any) {
    return this.prisma.errandItemSize.create({ data: dto });
  }

  async updateItemSize(id: string, dto: any) {
    return this.prisma.errandItemSize.update({ where: { id }, data: dto });
  }

  async deleteItemSize(id: string) {
    return this.prisma.errandItemSize.delete({ where: { id } });
  }

  async getAdminPickupPoints(query: any) {
    const { page = 1, limit = 20, regionId } = query;
    const where = regionId ? { regionId } : {};
    const [list, total] = await Promise.all([
      this.prisma.errandPickupPoint.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.errandPickupPoint.count({ where })
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createPickupPoint(dto: any) {
    return this.prisma.errandPickupPoint.create({ data: dto });
  }

  async updatePickupPoint(id: string, dto: any) {
    return this.prisma.errandPickupPoint.update({ where: { id }, data: dto });
  }

  async deletePickupPoint(id: string) {
    return this.prisma.errandPickupPoint.delete({ where: { id } });
  }

  async getAdminStats(regionId: string) {
    const where = regionId ? { regionId } : {};
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [totalOrders, todayOrders, activeRiders, completedOrders, incomeResult] = await Promise.all([
      this.prisma.errandOrder.count({ where }),
      this.prisma.errandOrder.count({ where: { ...where, createdAt: { gte: todayStart } } }),
      this.prisma.regionRider.count({ where: { ...where, status: 'online' } }),
      this.prisma.errandOrder.count({ where: { ...where, status: 'completed' } }),
      this.prisma.errandOrder.aggregate({
        where: { ...where, status: 'completed' },
        _sum: { payAmount: true },
      }),
    ]);

    const totalIncome = incomeResult._sum?.payAmount || 0;
    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 10000) / 100 : 0;

    // 按天统计近 7 天订单趋势
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      const count = await this.prisma.errandOrder.count({
        where: { ...where, createdAt: { gte: start, lte: end } }
      });
      trends.push({
        date: start.toISOString().split('T')[0],
        count
      });
    }

    return { totalOrders, todayOrders, activeRiders, completedOrders, totalIncome, completionRate, trends };
  }
}
