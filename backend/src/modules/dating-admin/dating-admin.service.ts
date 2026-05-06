import { Injectable } from '@nestjs/common'
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
    const { page = 1, pageSize = 20, keyword, auditStatus, gender } = query
    const where: any = {}
    if (auditStatus) where.auditStatus = auditStatus
    if (gender) {
      where.user = { profile: { gender } }
    }
    if (keyword) {
      where.user = {
        ...where.user,
        OR: [
          { nickname: { contains: keyword, mode: 'insensitive' } },
          { profile: { school: { contains: keyword, mode: 'insensitive' } } },
        ],
      }
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
              nickname: true,
              avatar: true,
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
        },
      }),
      this.prisma.datingProfile.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async auditProfile(id: string, dto: AuditDatingProfileDto) {
    const data: any = { auditStatus: dto.auditStatus }
    if (dto.auditRemark !== undefined) data.auditRemark = dto.auditRemark
    if (dto.auditStatus === 'rejected') data.isOpen = false
    return this.prisma.datingProfile.update({ where: { id }, data })
  }

  // ==================== Match ====================

  async getMatches(query: DatingMatchQueryDto) {
    const { page = 1, pageSize = 20, userId, status, matchType, startDate, endDate } = query
    const where: any = {}
    if (userId) where.OR = [{ userId }, { targetId: userId }]
    if (status) where.status = status
    if (matchType) where.matchType = matchType
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
          user: { select: { id: true, nickname: true, avatar: true } },
          target: { select: { id: true, nickname: true, avatar: true } },
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
    return this.prisma.datingOrder.update({
      where: { id },
      data: { status: 'refunded', refundReason: dto.reason, refundTime: new Date() },
    })
  }

  // ==================== Report ====================

  async getReports(query: DatingReportQueryDto) {
    const { page = 1, pageSize = 20, status } = query
    const where: any = {}
    if (status) where.status = status

    const [list, total] = await Promise.all([
      this.prisma.datingReport.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, nickname: true, avatar: true } },
          target: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.datingReport.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async handleReport(id: string, dto: HandleDatingReportDto) {
    return this.prisma.datingReport.update({
      where: { id },
      data: { status: dto.status, result: dto.result, handledAt: new Date() },
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
    return { keys: items, total: items.length }
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
