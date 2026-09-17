import { randomInt } from 'node:crypto'
import { assertCouponConfiguration } from '../../common/coupon-policy'
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import { CouponQueryDto, CreateCouponDto, UpdateCouponDto, CouponUsageQueryDto, RandomCouponGrantDto } from './dto/coupon-admin.dto'

@Injectable()
export class CouponAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeBusinessScope(scope: any) {
    const value = String(scope || '').trim().toLowerCase()
    return ['all', 'shop', 'mall', 'errand', 'activity', 'membership'].includes(value) ? value : 'all'
  }

  private normalizeCouponPayload(dto: any, current?: any) {
    assertCouponConfiguration({ ...current, ...dto })
    return {
      ...dto,
      businessScope: dto?.businessScope !== undefined
        ? this.normalizeBusinessScope(dto?.businessScope)
        : this.normalizeBusinessScope(current?.businessScope || 'all'),
    }
  }

  async randomGrant(couponId: string, dto: RandomCouponGrantDto, accountId: string, ip?: string) {
    if (!Number.isSafeInteger(dto.count) || dto.count < 1 || dto.count > 1000) {
      throw new BadRequestException('每批发放人数必须为 1 至 1000 的整数')
    }
    const reason = String(dto.reason || '').trim()
    if (!reason) throw new BadRequestException('请填写发放原因')
    // The coupon lock serializes stock/limit checks with other issuance paths.
    // Persist the request ID and receipts atomically so retries cannot issue twice.
    return this.prisma.$transaction(async tx => {
      const lock = await tx.coupon.updateMany({ where: { id: couponId }, data: { receivedCount: { increment: 0 } } })
      if (lock.count !== 1) throw new NotFoundException('优惠券不存在')
      const previous = await tx.adminOperationLog.findUnique({ where: { id: dto.batchId } })
      if (previous) {
        const detail = previous.detail as any
        if (previous.action !== 'GRANT_COUPON' || previous.accountId !== accountId || detail?.couponId !== couponId || detail?.count !== dto.count || detail?.reason !== reason) {
          throw new BadRequestException('批次编号已使用，请重新创建发放批次')
        }
        return { batchId: dto.batchId, count: detail.count, repeated: true, recipients: detail.recipients || [] }
      }
      const coupon = await tx.coupon.findUnique({ where: { id: couponId } })
      const now = new Date()
      if (!coupon || coupon.status !== 'active' || coupon.startAt > now || coupon.endAt <= now) {
        throw new BadRequestException('优惠券未启用、不在领取期内或已过期')
      }
      if (coupon.totalCount - coupon.receivedCount < dto.count) throw new BadRequestException('优惠券剩余库存不足，本批次未发放')
      // Reservoir sampling gives every eligible user equal probability with bounded memory.
      const selectedUsers: Array<{ id: string; uid: number; publicUid: number | null }> = []
      let eligible = 0
      let cursor: string | undefined
      while (true) {
        const users = await tx.user.findMany({
          where: { status: 'ACTIVE', deletedAt: null, userType: 1, systemRole: null },
          orderBy: { id: 'asc' }, take: 1000,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, uid: true, publicUid: true, _count: { select: { coupons: { where: { couponId } } } } },
        })
        for (const user of users) {
          if (user._count.coupons >= coupon.limitPerUser) continue
          eligible++
          if (selectedUsers.length < dto.count) selectedUsers.push(user)
          else {
            const slot = randomInt(eligible)
            if (slot < dto.count) selectedUsers[slot] = user
          }
        }
        if (users.length < 1000) break
        cursor = users[users.length - 1].id
      }
      if (eligible < dto.count) throw new BadRequestException(`符合条件的用户只有 ${eligible} 人，本批次未发放，请减少人数`)
      // Lock recipients in a stable order; concurrent account disabling cannot slip through.
      selectedUsers.sort((a, b) => a.id.localeCompare(b.id))
      const selected = selectedUsers.map(user => user.id)
      const recipients = selectedUsers.map(user => ({ userId: user.id, uid: user.publicUid || user.uid, status: 'success' }))
      const valid = await tx.user.updateMany({
        where: { id: { in: selected }, status: 'ACTIVE', deletedAt: null, userType: 1, systemRole: null },
        data: { banVersion: { increment: 0 } },
      })
      if (valid.count !== dto.count) throw new BadRequestException('用户状态发生变化，本批次未发放，请重试')
      const reserved = await tx.coupon.updateMany({
        where: { id: couponId, status: 'active', receivedCount: coupon.receivedCount, endAt: { gt: new Date() } },
        data: { receivedCount: { increment: dto.count } },
      })
      if (reserved.count !== 1) throw new BadRequestException('优惠券状态发生变化，本批次未发放')
      await tx.couponReceive.createMany({ data: selected.map(userId => ({ couponId, userId, status: 'unused' })) })
      await tx.adminOperationLog.create({ data: {
        id: dto.batchId, accountId, action: 'GRANT_COUPON', module: 'coupon',
        targetId: couponId, targetType: 'coupon', ip,
        detail: { batchId: dto.batchId, couponId, couponName: coupon.name, count: dto.count, reason, userIds: selected, recipients, eligible },
      } })
      return { batchId: dto.batchId, count: dto.count, repeated: false, recipients }
    }, { isolationLevel: 'ReadCommitted', timeout: 60000 })
  }

  async getCoupons(query: CouponQueryDto) {
    const { page = 1, pageSize = 20, keyword, type, status, regionId, businessScope } = query
    const where: any = {}
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ]
    }
    if (type) where.type = type
    if (status) where.status = status
    if (regionId) where.regionId = regionId
    if (businessScope) where.businessScope = this.normalizeBusinessScope(businessScope)

    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          region: { select: { id: true, name: true } },
          merchant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.coupon.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }

  async getCouponById(id: string) {
    return this.prisma.coupon.findUnique({
      where: { id },
      include: {
        region: { select: { id: true, name: true } },
        merchant: { select: { id: true, name: true } },
      },
    })
  }

  async createCoupon(dto: CreateCouponDto) {
    return this.prisma.coupon.create({
      data: {
        ...this.normalizeCouponPayload(dto),
        receivedCount: 0,
        usedCount: 0,
      } as any,
    })
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const current = await this.prisma.coupon.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('优惠券不存在')
    const data = this.normalizeCouponPayload(dto, current)
    return this.prisma.$transaction(async tx => {
      const saved = await tx.coupon.updateMany({
        where: { id, receivedCount: { lte: Number(dto.totalCount ?? current.totalCount) } }, data: data as any,
      })
      if (saved.count !== 1) throw new BadRequestException('已领取数量发生变化，总量不能小于已领取数量，请刷新后重试')
      return tx.coupon.findUnique({ where: { id } })
    })
  }

  async deleteCoupon(id: string) {
    const count = await this.prisma.couponReceive.count({ where: { couponId: id } })
    if (count > 0) {
      return this.prisma.coupon.update({ where: { id }, data: { status: 'deleted' } })
    }
    await this.prisma.coupon.delete({ where: { id } })
    return { success: true }
  }

  async toggleCouponStatus(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } })
    if (!coupon) throw new Error('Coupon not found')
    const newStatus = coupon.status === 'active' ? 'inactive' : 'active'
    if (newStatus === 'active') assertCouponConfiguration(coupon)
    return this.prisma.coupon.update({ where: { id }, data: { status: newStatus } })
  }

  async copyCoupon(id: string) {
    const source = await this.prisma.coupon.findUnique({ where: { id } })
    if (!source) throw new Error('Coupon not found')
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = source as any
    return this.prisma.coupon.create({
      data: {
        ...rest,
        name: (rest.name || '') + ' (副本)',
        receivedCount: 0,
        usedCount: 0,
        status: 'inactive',
        code: rest.code ? rest.code + '_copy' : null,
      } as any,
    })
  }

  async getCouponUsages(query: CouponUsageQueryDto) {
    const { page = 1, pageSize = 20, couponId, userId, status, startDate, endDate } = query
    const where: any = {}
    if (couponId) where.couponId = couponId
    if (userId) where.userId = userId
    if (status) where.status = status
    if (startDate || endDate) {
      where.usedAt = {}
      if (startDate) where.usedAt.gte = new Date(startDate)
      if (endDate) where.usedAt.lte = new Date(endDate + 'T23:59:59.999Z')
    }

    const [list, total] = await Promise.all([
      this.prisma.couponReceive.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          coupon: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.couponReceive.count({ where }),
    ])
    return { list, total, page: +page, pageSize: +pageSize }
  }
}
