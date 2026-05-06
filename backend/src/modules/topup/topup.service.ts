import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class TopupService {
  constructor(private readonly prisma: PrismaService) {}

  async getPackages(regionId: string) {
    return this.prisma.topupPackage.findMany({ where: { regionId, isShow: true }, orderBy: { sortOrder: 'asc' } });
  }

  async createTopupOrder(userId: string, dto: any) {
    const orderNo = `TOP${Date.now()}`;
    return this.prisma.topupOrder.create({ data: { userId, packageId: dto.package_id, amount: dto.amount, orderNo } });
  }

  async getPaymentInfo(orderId: string) {
    return this.prisma.topupOrder.findUnique({ where: { id: orderId } });
  }

  async getUserOrders(userId: string) {
    return this.prisma.topupOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async cancelOrder(orderId: string, userId: string) {
    return this.prisma.topupOrder.update({ where: { id: orderId }, data: { status: 'cancelled' } });
  }

  async getRechargeHistory(userId: string, query: any) {
    const { page = 1, limit = 20, status } = query;
    const where: any = { userId };
    if (status) where.status = status;
    return this.prisma.recharge.findMany({ where, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } });
  }

  async createRechargeOrder(userId: string, dto: any) {
    return this.prisma.recharge.create({ data: { userId, amount: dto.amount, channel: dto.channel, orderNo: `REC${Date.now()}` } });
  }

  async checkWechatBinding(userId: string) {
    return { isBound: true };
  }
}
