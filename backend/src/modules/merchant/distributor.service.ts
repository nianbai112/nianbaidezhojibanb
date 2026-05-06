import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class DistributorService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 分销商管理 ====================

  async getDistributorList(query: any) {
    const { page = 1, pageSize = 20, realName, phone, status, levelId } = query;
    const where: any = {};
    if (realName) where.realName = { contains: realName, mode: 'insensitive' };
    if (phone) where.phone = { contains: phone };
    if (status) where.status = status;
    if (levelId) where.levelId = levelId;

    const [list, total] = await Promise.all([
      this.prisma.mallDistributor.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, avatar: true, nickname: true } },
          level: { select: { id: true, name: true, level: true } },
          parent: { select: { id: true, realName: true } },
          _count: { select: { children: true } },
        },
      }),
      this.prisma.mallDistributor.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getDistributorDetail(id: string) {
    const d = await this.prisma.mallDistributor.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, avatar: true, nickname: true } },
        level: true,
        parent: { select: { id: true, realName: true, phone: true } },
        children: { select: { id: true, realName: true, phone: true, status: true } },
        _count: { select: { commissions: true, withdrawals: true } },
      },
    });
    if (!d) throw new NotFoundException('分销商不存在');
    return d;
  }

  async auditDistributor(id: string, dto: any) {
    const d = await this.prisma.mallDistributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('分销商不存在');
    if (!['approved', 'rejected'].includes(dto.status)) throw new BadRequestException('状态值无效');
    return this.prisma.mallDistributor.update({
      where: { id },
      data: { status: dto.status, remark: dto.remark },
    });
  }

  async updateDistributor(id: string, dto: any) {
    const d = await this.prisma.mallDistributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('分销商不存在');
    const data: any = {};
    if (dto.levelId !== undefined) data.levelId = dto.levelId;
    if (dto.remark !== undefined) data.remark = dto.remark;
    return this.prisma.mallDistributor.update({ where: { id }, data });
  }

  // ==================== 分销等级 ====================

  async getLevelList(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.distributorLevel.findMany({
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { level: 'asc' },
        include: { _count: { select: { distributors: true } } },
      }),
      this.prisma.distributorLevel.count(),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async createLevel(dto: any) {
    return this.prisma.distributorLevel.create({ data: dto });
  }

  async updateLevel(id: string, dto: any) {
    const level = await this.prisma.distributorLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('等级不存在');
    return this.prisma.distributorLevel.update({ where: { id }, data: dto });
  }

  async deleteLevel(id: string) {
    const level = await this.prisma.distributorLevel.findUnique({
      where: { id },
      include: { _count: { select: { distributors: true } } },
    });
    if (!level) throw new NotFoundException('等级不存在');
    if (level._count.distributors > 0) throw new BadRequestException('该等级下存在分销商，无法删除');
    return this.prisma.distributorLevel.delete({ where: { id } });
  }

  // ==================== 分销配置 ====================

  async getConfigList(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.distributorConfig.findMany({
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { key: 'asc' },
      }),
      this.prisma.distributorConfig.count(),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async updateConfig(key: string, dto: any) {
    return this.prisma.distributorConfig.upsert({
      where: { key },
      create: { key, value: dto.value, description: dto.description },
      update: { value: dto.value, description: dto.description },
    });
  }

  // ==================== 佣金记录 ====================

  async getCommissionList(query: any) {
    const { page = 1, pageSize = 20, distributorId, level, status } = query;
    const where: any = {};
    if (distributorId) where.distributorId = distributorId;
    if (level !== undefined) where.level = Number(level);
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.distributorCommission.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { distributor: { select: { id: true, realName: true, phone: true } } },
      }),
      this.prisma.distributorCommission.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  // ==================== 提现记录 ====================

  async getWithdrawalList(query: any) {
    const { page = 1, pageSize = 20, distributorId, status } = query;
    const where: any = {};
    if (distributorId) where.distributorId = distributorId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.distributorWithdrawal.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { distributor: { select: { id: true, realName: true, phone: true } } },
      }),
      this.prisma.distributorWithdrawal.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async processWithdrawal(id: string, dto: any) {
    const w = await this.prisma.distributorWithdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('提现记录不存在');
    if (!['processing', 'completed', 'rejected'].includes(dto.status)) throw new BadRequestException('状态值无效');

    const data: any = { status: dto.status, remark: dto.remark };
    if (dto.status === 'completed' || dto.status === 'rejected') {
      data.processedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.distributorWithdrawal.update({ where: { id }, data });

      if (dto.status === 'completed') {
        await tx.mallDistributor.update({
          where: { id: w.distributorId },
          data: {
            pendingEarnings: { decrement: w.amount },
            withdrawnEarnings: { increment: w.actualAmount },
          },
        });
      } else if (dto.status === 'rejected') {
        await tx.mallDistributor.update({
          where: { id: w.distributorId },
          data: {
            pendingEarnings: { decrement: w.amount },
            totalEarnings: { decrement: w.amount },
          },
        });
      }

      return result;
    });
  }
}
