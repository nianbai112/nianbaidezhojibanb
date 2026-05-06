import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import {
  RiderQueryDto, AuditRiderDto, RiderStatusDto,
  DeliveryOrderQueryDto, AssignOrderDto, CancelOrderDto,
  UpdateFeeConfigDto,
  UpdatePageConfigDto,
  UpdateRewardPunishDto,
} from './dto/errand-admin.dto'

@Injectable()
export class ErrandAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Rider ====================

  async getRiders(query: RiderQueryDto) {
    const { page = 1, pageSize = 20, keyword, auditStatus, status, regionId } = query
    const where: any = {}
    if (auditStatus) where.verifyStatus = auditStatus
    if (status) where.status = status
    if (regionId) where.regionId = regionId
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
        { User: { nickname: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    const [list, total] = await Promise.all([
      this.prisma.regionRider.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
      }),
      this.prisma.regionRider.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async getRiderDetail(id: string) {
    const r = await this.prisma.regionRider.findUnique({
      where: { id },
      include: { User: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    })
    if (!r) throw new NotFoundException('骑手不存在')
    return r
  }

  async auditRider(id: string, dto: AuditRiderDto) {
    const data: any = { verifyStatus: dto.status }
    return this.prisma.regionRider.update({ where: { id }, data })
  }

  async updateRiderStatus(id: string, dto: RiderStatusDto) {
    return this.prisma.regionRider.update({ where: { id }, data: { status: dto.status } })
  }

  async getRiderRecords(id: string, query: any) {
    const { page = 1, pageSize = 20 } = query
    const where: any = { riderId: id }
    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { User: { select: { id: true, nickname: true } } },
      }),
      this.prisma.errandOrder.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  // ==================== Order ====================

  async getOrders(query: DeliveryOrderQueryDto) {
    const { page = 1, pageSize = 20, orderNo, status, userId, riderId, regionId, startDate, endDate } = query
    const where: any = {}
    if (orderNo) where.orderNo = { contains: orderNo }
    if (status) where.status = status
    if (userId) where.userId = userId
    if (riderId) where.riderId = riderId
    if (regionId) where.regionId = regionId
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z')
    }

    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, phone: true } },
          RegionRider: { select: { id: true, realName: true, phone: true } },
        },
      }),
      this.prisma.errandOrder.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async getOrderDetail(id: string) {
    const o = await this.prisma.errandOrder.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, phone: true, avatar: true } },
        RegionRider: { select: { id: true, realName: true, phone: true } },
      },
    })
    if (!o) throw new NotFoundException('订单不存在')
    return o
  }

  async cancelOrder(id: string, dto: CancelOrderDto) {
    return this.prisma.errandOrder.update({
      where: { id },
      data: { status: 'cancelled', cancelReason: dto.reason, cancelTime: new Date() },
    })
  }

  async assignOrder(id: string, dto: AssignOrderDto) {
    return this.prisma.errandOrder.update({
      where: { id },
      data: { riderId: dto.riderId, status: 'accepted', acceptTime: new Date() },
    })
  }

  async getOrderTimeline(id: string) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id },
      select: {
        id: true, orderNo: true, status: true,
        createdAt: true, acceptTime: true, pickupTime: true,
        deliverTime: true, completeTime: true, cancelTime: true,
        cancelReason: true,
      },
    })
    if (!order) throw new NotFoundException('订单不存在')
    return order
  }

  // ==================== Fee Config ====================

  async getFeeConfig(regionId: string) {
    let config = await this.prisma.errandConfig.findUnique({ where: { regionId } })
    if (!config) {
      config = await this.prisma.errandConfig.create({ data: { regionId } as any })
    }
    return config
  }

  async updateFeeConfig(regionId: string, dto: UpdateFeeConfigDto) {
    return this.prisma.errandConfig.upsert({
      where: { regionId },
      update: dto as any,
      create: { regionId, ...dto } as any,
    })
  }

  // ==================== Page Config ====================

  async getPageConfig(regionId: string) {
    let config = await this.prisma.errandPageConfig.findUnique({ where: { regionId } })
    if (!config) {
      config = await this.prisma.errandPageConfig.create({ data: { regionId } })
    }
    return config
  }

  async updatePageConfig(regionId: string, dto: UpdatePageConfigDto) {
    return this.prisma.errandPageConfig.upsert({
      where: { regionId },
      update: dto as any,
      create: { regionId, ...dto },
    })
  }

  // ==================== Reward/Punish ====================

  async getRewardPunish(regionId: string) {
    let config = await this.prisma.errandRewardPunish.findUnique({ where: { regionId } })
    if (!config) {
      config = await this.prisma.errandRewardPunish.create({ data: { regionId } })
    }
    return config
  }

  async updateRewardPunish(regionId: string, dto: UpdateRewardPunishDto) {
    return this.prisma.errandRewardPunish.upsert({
      where: { regionId },
      update: dto as any,
      create: { regionId, ...dto },
    })
  }
}
