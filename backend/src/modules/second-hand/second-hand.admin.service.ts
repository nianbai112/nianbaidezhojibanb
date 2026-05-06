import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class SecondHandAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 商品管理 ====================

  async getProductList(query: any) {
    const { page = 1, pageSize = 20, keyword, status, regionId, category } = query;
    const where: any = {};
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' };
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (category) where.category = { contains: category, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.secondHand.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.secondHand.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getProductDetail(id: string) {
    const item = await this.prisma.secondHand.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        region: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('商品不存在');
    return item;
  }

  async updateProductStatus(id: string, dto: any) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    return this.prisma.secondHand.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async deleteProduct(id: string) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    return this.prisma.secondHand.delete({ where: { id } });
  }

  // ==================== 订单管理 ====================

  async getOrderList(query: any) {
    const { page = 1, pageSize = 20, orderNo, status, buyerId, sellerId } = query;
    const where: any = {};
    if (orderNo) where.orderNo = { contains: orderNo };
    if (status) where.status = status;
    if (buyerId) where.buyerId = buyerId;
    if (sellerId) where.sellerId = sellerId;

    const [list, total] = await Promise.all([
      this.prisma.secondHandOrder.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true } } },
      }),
      this.prisma.secondHandOrder.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getOrderDetail(id: string) {
    const order = await this.prisma.secondHandOrder.findUnique({
      where: { id },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  // ==================== 区域配置 ====================

  async getRegionSettingsList(query: any) {
    const { page = 1, pageSize = 20, regionId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.secondHandRegionSetting.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { region: { select: { name: true } } },
      }),
      this.prisma.secondHandRegionSetting.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getRegionSetting(regionId: string) {
    const settings = await this.prisma.secondHandRegionSetting.findUnique({
      where: { regionId },
      include: { region: { select: { name: true } } },
    });
    return settings || { regionId, enableSecondHand: true, maxListings: null, requirePhone: true, requireAudit: false };
  }

  async upsertRegionSetting(regionId: string, dto: any) {
    const r = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!r) throw new NotFoundException('区域不存在');
    return this.prisma.secondHandRegionSetting.upsert({
      where: { regionId },
      create: { regionId, ...dto } as any,
      update: dto as any,
    });
  }
}
