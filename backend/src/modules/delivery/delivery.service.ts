import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { CreateDeliveryOrderDto, UpdateLocationDto, DeliveryQueryDto } from './dto/delivery.dto';
import { DeliveryOrderStatus } from '@prisma/client';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async myOrders(userId: string, query: DeliveryQueryDto) {
    const { status, page = 1, pageSize = 20 } = query;
    const where: any = { userId };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async orderPool(query: DeliveryQueryDto) {
    const { regionId, type, page = 1, pageSize = 20 } = query;
    const where: any = { status: DeliveryOrderStatus.PENDING_ACCEPT };
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async createOrder(userId: string, dto: CreateDeliveryOrderDto) {
    const orderNo = `DEL${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const order = await this.prisma.deliveryOrder.create({
      data: {
        orderNo,
        userId,
        ...dto,
        status: DeliveryOrderStatus.PENDING_PAY,
      },
    });

    return order;
  }

  async acceptOrder(id: string, riderId: string) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== DeliveryOrderStatus.PENDING_ACCEPT) {
      throw new BadRequestException('订单不可接单');
    }

    // 检查骑手身份
    const rider = await this.prisma.rider.findUnique({ where: { userId: riderId } });
    if (!rider || rider.verifyStatus !== 'approved') {
      throw new ForbiddenException('非认证骑手');
    }

    return this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        riderId,
        status: DeliveryOrderStatus.ACCEPTED,
        acceptTime: new Date(),
      },
    });
  }

  async completeOrder(id: string, userId: string) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');

    // 用户或骑手都可以标记完成
    if (order.userId !== userId && order.riderId !== userId) {
      throw new ForbiddenException('无权操作');
    }

    return this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: DeliveryOrderStatus.COMPLETED,
        completeTime: new Date(),
      },
    });
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException('骑手信息不存在');

    await this.prisma.rider.update({
      where: { userId },
      data: {
        lat: dto.lat,
        lng: dto.lng,
        locationUpdatedAt: new Date(),
      },
    });

    // 发布到 Redis 用于实时追踪
    await this.redis.hset(`rider:location`, userId, JSON.stringify({ lat: dto.lat, lng: dto.lng, time: Date.now() }));

    return { success: true };
  }
}
