import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import {
  RiderQueryDto, AuditRiderDto, RiderStatusDto,
  DeliveryOrderQueryDto, AssignOrderDto, CancelOrderDto,
  UpdateFeeConfigDto,
  UpdatePageConfigDto,
  UpdateRewardPunishDto,
} from './dto/errand-admin.dto'
import {
  ERRAND_EXTENDED_CONFIG_GROUP,
  buildMiniErrandConfig,
  errandExtendedConfigKey,
  mergeErrandExtendedConfig,
  normalizeErrandExtendedConfig,
  splitErrandConfigPayload,
} from '../errand/errand-config.util'

@Injectable()
export class ErrandAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveConfigRegionId(regionId?: string) {
    const value = typeof regionId === 'string' ? regionId.trim() : ''
    return value || 'global'
  }

  private normalizeOrderStatus(status?: string) {
    const value = String(status || '').trim()
    if (!value) return ''
    const map: Record<string, string> = {
      PENDING_PAY: 'pending_pay',
      PENDING_ACCEPT: 'pending_accept',
      ACCEPTED: 'accepted',
      IN_PROGRESS: 'in_progress',
      ARRIVED: 'arrived',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      REFUNDING: 'refunding',
      REFUNDED: 'refunded',
    }
    return map[value] || value.toLowerCase()
  }

  private normalizeOrderType(type?: string) {
    const value = String(type || '').trim()
    const map: Record<string, string> = {
      express_pickup: 'pickup',
      pickup: 'pickup',
      express_send: 'deliver',
      deliver: 'deliver',
      food_delivery: 'meal',
      meal: 'meal',
      custom_task: 'universal',
      universal: 'universal',
    }
    return map[value] || value || ''
  }

  private normalizeRiderStatus(status?: string) {
    const value = String(status || '').trim()
    return value ? value.toLowerCase() : ''
  }

  private numberValue(value: any, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  private async getExtendedConfig(regionId: string, basePrice = 0) {
    const saved = await this.prisma.config.findUnique({
      where: { key: errandExtendedConfigKey(regionId) },
    }).catch(() => null)
    return normalizeErrandExtendedConfig(saved?.value, basePrice)
  }

  private async saveExtendedConfig(regionId: string, value: any, basePrice = 0) {
    const current = await this.prisma.config.findUnique({
      where: { key: errandExtendedConfigKey(regionId) },
    }).catch(() => null)
    const normalized = mergeErrandExtendedConfig(current?.value, value, basePrice)
    await this.prisma.config.upsert({
      where: { key: errandExtendedConfigKey(regionId) },
      update: { value: normalized, group: ERRAND_EXTENDED_CONFIG_GROUP },
      create: {
        key: errandExtendedConfigKey(regionId),
        value: normalized,
        group: ERRAND_EXTENDED_CONFIG_GROUP,
        desc: '跑腿扩展运营配置',
      },
    })
    return normalized
  }

  private formatOrder(row: any) {
    const user = row.User || row.user || null
    const rider = row.RegionRider || row.rider || null
    return {
      ...row,
      user,
      rider,
      userName: user?.nickname || '',
      userPhone: user?.phone || '',
      riderName: rider?.realName || '',
      riderPhone: rider?.phone || '',
      serviceType: row.type,
      amount: Number(row.payAmount ?? row.price ?? 0),
      price: Number(row.price ?? 0),
      payAmount: Number(row.payAmount ?? 0),
      tip: Number(row.tip ?? 0),
    }
  }

  // ==================== Rider ====================

  async getRiders(query: RiderQueryDto) {
    const { page = 1, pageSize = 20, keyword, auditStatus, status, regionId } = query
    const where: any = {}
    if (auditStatus) where.verifyStatus = auditStatus
    if (status) where.status = this.normalizeRiderStatus(status)
    if (regionId) where.regionId = regionId
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
        { User: { is: { nickname: { contains: keyword, mode: 'insensitive' } } } },
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
    return this.prisma.regionRider.update({ where: { id }, data: { status: this.normalizeRiderStatus(dto.status) } })
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
    const { page = 1, pageSize = 20, orderNo, status, type, userId, riderId, regionId, startDate, endDate } = query as any
    const where: any = {}
    const keyword = String((query as any).keyword || orderNo || '').trim()
    const riderKeyword = String((query as any).rider || '').trim()
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { title: { contains: keyword } },
        { description: { contains: keyword } },
        { User: { is: { nickname: { contains: keyword, mode: 'insensitive' } } } },
        { User: { is: { phone: { contains: keyword } } } },
      ]
    }
    if (status) where.status = this.normalizeOrderStatus(status)
    const orderType = this.normalizeOrderType(type)
    if (orderType) where.type = orderType
    if (userId) where.userId = userId
    if (riderId) where.riderId = riderId
    if (regionId) where.regionId = regionId
    if (riderKeyword) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { RegionRider: { is: { realName: { contains: riderKeyword, mode: 'insensitive' } } } },
            { RegionRider: { is: { phone: { contains: riderKeyword } } } },
          ],
        },
      ]
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(String(endDate).includes('T') ? endDate : `${endDate}T23:59:59.999Z`)
    }

    const [list, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, phone: true, avatar: true } },
          RegionRider: { select: { id: true, userId: true, realName: true, phone: true } },
        },
      }),
      this.prisma.errandOrder.count({ where }),
    ])
    return { list: list.map(row => this.formatOrder(row)), total, page: +page, pageSize: +pageSize }
  }

  async getOrderDetail(id: string) {
    const o = await this.prisma.errandOrder.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, phone: true, avatar: true } },
        RegionRider: { select: { id: true, userId: true, realName: true, phone: true } },
      },
    })
    if (!o) throw new NotFoundException('订单不存在')
    return this.formatOrder(o)
  }

  async cancelOrder(id: string, dto: CancelOrderDto) {
    return this.prisma.errandOrder.update({
      where: { id },
      data: { status: 'cancelled', cancelReason: dto.reason, cancelTime: new Date() },
    })
  }

  async assignOrder(id: string, dto: AssignOrderDto) {
    if (!dto.riderId) throw new BadRequestException('请选择骑手')
    const rider = await this.prisma.regionRider.findFirst({
      where: { OR: [{ id: dto.riderId }, { userId: dto.riderId }] },
    })
    if (!rider) throw new NotFoundException('骑手不存在')
    return this.prisma.errandOrder.update({
      where: { id },
      data: { riderId: rider.userId, status: 'accepted', acceptTime: new Date() },
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

  async getFeeConfig(regionId?: string) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandConfig.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandConfig.create({ data: { regionId: configRegionId } as any })
    }
    const extended = await this.getExtendedConfig(configRegionId, this.numberValue(config.basePrice, 0))
    return {
      ...config,
      ...extended,
      miniConfig: buildMiniErrandConfig(config, extended),
    }
  }

  async updateFeeConfig(regionId: string | undefined, dto: UpdateFeeConfigDto) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    const { scalar, extended } = splitErrandConfigPayload(dto)
    const config = await this.prisma.errandConfig.upsert({
      where: { regionId: configRegionId },
      update: scalar as any,
      create: { regionId: configRegionId, ...scalar } as any,
    })
    if (Object.keys(extended).length) {
      await this.saveExtendedConfig(configRegionId, extended, this.numberValue(config.basePrice, 0))
    }
    return this.getFeeConfig(configRegionId)
  }

  // ==================== Page Config ====================

  async getPageConfig(regionId?: string) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandPageConfig.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandPageConfig.create({ data: { regionId: configRegionId } })
    }
    return config
  }

  async updatePageConfig(regionId: string | undefined, dto: UpdatePageConfigDto) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    return this.prisma.errandPageConfig.upsert({
      where: { regionId: configRegionId },
      update: dto as any,
      create: { regionId: configRegionId, ...dto },
    })
  }

  // ==================== Reward/Punish ====================

  async getRewardPunish(regionId?: string) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    let config = await this.prisma.errandRewardPunish.findUnique({ where: { regionId: configRegionId } })
    if (!config) {
      config = await this.prisma.errandRewardPunish.create({ data: { regionId: configRegionId } })
    }
    return config
  }

  async updateRewardPunish(regionId: string | undefined, dto: UpdateRewardPunishDto) {
    const configRegionId = this.resolveConfigRegionId(regionId)
    return this.prisma.errandRewardPunish.upsert({
      where: { regionId: configRegionId },
      update: dto as any,
      create: { regionId: configRegionId, ...dto },
    })
  }
}
