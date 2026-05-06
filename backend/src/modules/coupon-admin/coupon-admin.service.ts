import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/services/prisma.service'
import { CouponQueryDto, CreateCouponDto, UpdateCouponDto, CouponUsageQueryDto } from './dto/coupon-admin.dto'

@Injectable()
export class CouponAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoupons(query: CouponQueryDto) {
    const { page = 1, pageSize = 20, keyword, type, status, regionId } = query
    const where: any = {}
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
      ]
    }
    if (type) where.type = type
    if (status) where.status = status
    if (regionId) where.regionId = regionId

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
        ...dto,
        receivedCount: 0,
        usedCount: 0,
      } as any,
    })
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    return this.prisma.coupon.update({
      where: { id },
      data: dto as any,
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
