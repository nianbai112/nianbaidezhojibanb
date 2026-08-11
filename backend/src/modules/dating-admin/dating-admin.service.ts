import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import { RedisService } from '../../common/services/redis.service'
import {
  DatingConfigQueryDto, UpdateDatingConfigDto,
  DatingProfileQueryDto, AuditDatingProfileDto,
  DatingMatchQueryDto,
  DatingPackageQueryDto, CreateDatingPackageDto, UpdateDatingPackageDto,
  DatingOrderQueryDto, RefundDatingOrderDto,
  DatingReportQueryDto, HandleDatingReportDto,
  DatingCacheClearDto,
} from './dto/dating-admin.dto'

@Injectable()
export class DatingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private cleanId(value?: string) {
    const text = String(value || '').trim()
    if (!text || text === 'undefined' || text === 'null') return undefined
    return text
  }

  private todayRange() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { start }
  }

  async getOverview(regionId?: string) {
    const cleanRegionId = this.cleanId(regionId)
    const { start } = this.todayRange()
    const profileWhere: any = cleanRegionId ? { regionId: cleanRegionId } : {}
    const matchWhere: any = cleanRegionId ? { regionId: cleanRegionId } : {}
    const reportWhere: any = cleanRegionId
      ? {
          target: {
            datingProfile: { is: { regionId: cleanRegionId } },
          },
        }
      : {}
    const orderWhere: any = cleanRegionId ? { package: { regionId: cleanRegionId } } : {}

    const [totalProfiles, pendingProfiles, openedProfiles, todayLikes, matchedCount, pendingReports, paidOrders, paidAmount] = await Promise.all([
      this.prisma.datingProfile.count({ where: profileWhere }),
      this.prisma.datingProfile.count({ where: { ...profileWhere, auditStatus: 'pending' } }),
      this.prisma.datingProfile.count({ where: { ...profileWhere, auditStatus: 'approved', isOpen: true } }),
      this.prisma.match.count({ where: { ...matchWhere, status: { in: ['PENDING', 'MATCHED'] as any }, createdAt: { gte: start } } }),
      this.prisma.match.count({ where: { ...matchWhere, status: 'MATCHED' as any } }),
      this.prisma.datingReport.count({ where: { ...reportWhere, status: 'pending' } }),
      this.prisma.datingOrder.count({ where: { ...orderWhere, status: 'paid' } }),
      this.prisma.datingOrder.aggregate({ where: { ...orderWhere, status: 'paid' }, _sum: { amount: true } }),
    ])

    return {
      totalProfiles,
      pendingProfiles,
      openedProfiles,
      todayLikes,
      matchedCount,
      pendingReports,
      paidOrders,
      paidAmount: Number(paidAmount._sum.amount || 0),
    }
  }

  // ==================== Config ====================

  async getConfigs(query: DatingConfigQueryDto) {
    const { page = 1, pageSize = 20, regionId } = query
    const where: any = {}
    if (regionId) where.regionId = regionId

    const [list, total] = await Promise.all([
      this.prisma.datingConfig.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { region: { select: { id: true, name: true } } },
      }),
      this.prisma.datingConfig.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async updateConfig(id: string, dto: UpdateDatingConfigDto) {
    const item = await this.prisma.datingConfig.update({ where: { id }, data: dto as any })
    await this.clearDatingCache()
    return item
  }

  // ==================== Profile ====================

  async getProfiles(query: DatingProfileQueryDto) {
    const { page = 1, pageSize = 20, keyword, auditStatus, gender, regionId } = query
    const where: any = {}
    if (auditStatus) where.auditStatus = auditStatus
    if (gender) where.gender = gender
    if (regionId) where.regionId = regionId
    if (keyword) {
      where.OR = [
        { displayName: { contains: keyword } },
        { bio: { contains: keyword } },
        { school: { contains: keyword } },
        { major: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
      ]
    }

    const [list, total] = await Promise.all([
      this.prisma.datingProfile.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              uid: true,
              nickname: true,
              avatar: true,
              phone: true,
              profile: {
                select: {
                  gender: true,
                  birthday: true,
                  school: true,
                  major: true,
                  grade: true,
                  bio: true,
                },
              },
            },
          },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.datingProfile.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async auditProfile(id: string, dto: AuditDatingProfileDto & { status?: string }) {
    const auditStatus = dto.auditStatus || dto.status
    if (!auditStatus) throw new BadRequestException('审核状态不能为空')
    const data: any = { auditStatus }
    if (dto.auditRemark !== undefined) data.auditRemark = dto.auditRemark
    if (auditStatus === 'rejected') data.isOpen = false
    return this.prisma.datingProfile.update({ where: { id }, data })
  }

  // ==================== Match ====================

  async getMatches(query: DatingMatchQueryDto) {
    const { page = 1, pageSize = 20, userId, status, matchType, startDate, endDate, regionId } = query as any
    const where: any = {}
    if (userId) where.OR = [{ userId }, { targetId: userId }]
    if (status) where.status = status
    if (matchType) where.matchType = matchType
    if (regionId) where.regionId = regionId
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z')
    }

    const [list, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true, datingProfile: true } },
          target: { select: { id: true, uid: true, nickname: true, avatar: true, datingProfile: true } },
        },
      }),
      this.prisma.match.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  // ==================== Package ====================

  async getPackages(query: DatingPackageQueryDto) {
    const { page = 1, pageSize = 20, regionId } = query
    const where: any = {}
    if (regionId) where.regionId = regionId

    const [list, total] = await Promise.all([
      this.prisma.datingPackage.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { sortOrder: 'asc' },
        include: { region: { select: { id: true, name: true } } },
      }),
      this.prisma.datingPackage.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async createPackage(dto: CreateDatingPackageDto) {
    return this.prisma.datingPackage.create({ data: dto as any })
  }

  async updatePackage(id: string, dto: UpdateDatingPackageDto) {
    return this.prisma.datingPackage.update({ where: { id }, data: dto as any })
  }

  async deletePackage(id: string) {
    await this.prisma.datingPackage.delete({ where: { id } })
    return { success: true }
  }

  // ==================== Order ====================

  async getOrders(query: DatingOrderQueryDto) {
    const { page = 1, pageSize = 20, status, userId, orderNo, startDate, endDate } = query
    const where: any = {}
    if (status) where.status = status
    if (userId) where.userId = userId
    if (orderNo) where.orderNo = { contains: orderNo }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z')
    }

    const [list, total] = await Promise.all([
      this.prisma.datingOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          package: { select: { id: true, name: true } },
        },
      }),
      this.prisma.datingOrder.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async refundOrder(id: string, dto: RefundDatingOrderDto) {
    const order = await this.prisma.datingOrder.findUnique({
      where: { id },
      include: { package: true },
    })
    if (!order) throw new BadRequestException('订单不存在')
    if (order.status === 'refunded') return order

    return this.prisma.$transaction(async (tx) => {
      const amount = Number(order.amount || 0)
      const packageCount = order.package?.matchCount || 0
      const quota = await tx.datingQuota.findUnique({ where: { userId: order.userId } })
      if (quota && packageCount > 0) {
        await tx.datingQuota.update({
          where: { userId: order.userId },
          data: {
            remainingCount: Math.max(0, quota.remainingCount - Math.min(quota.remainingCount, packageCount)),
            totalPurchased: Math.max(0, quota.totalPurchased - packageCount),
          },
        })
      }

      if (amount > 0 && order.payChannel === 'balance') {
        const beforeWallet = await tx.wallet.findUnique({ where: { userId: order.userId } })
        const nextBalance = Number(beforeWallet?.balance || 0) + amount
        await tx.wallet.upsert({
          where: { userId: order.userId },
          create: { userId: order.userId, balance: amount, totalIn: amount },
          update: { balance: { increment: amount }, totalIn: { increment: amount } },
        })
        await tx.walletTransaction.create({
          data: {
            userId: order.userId,
            type: 'REFUND',
            amount,
            balance: nextBalance,
            channel: 'BALANCE',
            orderNo: order.orderNo,
            description: `对象匹配订单退款：${order.package?.name || order.orderNo}`,
            status: 'SUCCESS',
          } as any,
        })
      }

      return tx.datingOrder.update({
        where: { id },
        data: { status: 'refunded', refundReason: dto.reason, refundTime: new Date() },
      })
    })
  }

  // ==================== Report ====================

  async getReports(query: DatingReportQueryDto) {
    const { page = 1, pageSize = 20, status, regionId } = query
    const where: any = {}
    if (status) where.status = status
    if (regionId) {
      where.target = { datingProfile: { is: { regionId } } }
    }

    const [list, total] = await Promise.all([
      this.prisma.datingReport.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, uid: true, nickname: true, avatar: true } },
          target: { select: { id: true, uid: true, nickname: true, avatar: true, datingProfile: true } },
        },
      }),
      this.prisma.datingReport.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async handleReport(id: string, dto: HandleDatingReportDto & { action?: string }) {
    const status = dto.status || (dto.action === 'ignored' ? 'rejected' : dto.action === 'resolved' ? 'resolved' : undefined)
    if (!status) throw new BadRequestException('处理状态不能为空')
    return this.prisma.datingReport.update({
      where: { id },
      data: { status, result: dto.result || dto.action || status, handledAt: new Date() },
    })
  }

  // ==================== Cache ====================

  async getCacheInfo() {
    const client = this.redis.getClient()
    const keys = await client.keys('dating:*')
    const items: { key: string; ttl: number }[] = []
    for (const key of keys) {
      const ttl = await client.ttl(key)
      items.push({ key, ttl })
    }
    return {
      status: items.length > 0 ? 'active' : 'empty',
      count: items.length,
      total: items.length,
      lastUpdated: new Date().toISOString(),
      keys: items,
    }
  }

  async clearCache(dto: DatingCacheClearDto) {
    const client = this.redis.getClient()
    if (dto.key) {
      await client.del(dto.key)
    } else {
      const keys = await client.keys('dating:*')
      if (keys.length > 0) await client.del(...keys)
    }
    return { success: true }
  }

  private async clearDatingCache() {
    const client = this.redis.getClient()
    const keys = await client.keys('dating:*')
    if (keys.length > 0) await client.del(...keys)
  }
}
