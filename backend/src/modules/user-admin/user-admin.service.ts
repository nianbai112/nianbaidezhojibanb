import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  UserLevelQueryDto, CreateUserLevelDto, UpdateUserLevelDto,
  UserExperienceQueryDto, CreateUserExperienceDto,
  UserTagDefQueryDto, CreateUserTagDefDto, UpdateUserTagDefDto,
  AddressQueryDto,
  UserGuidanceQueryDto, CreateUserGuidanceDto, UpdateUserGuidanceDto,
  BatchBalanceClearDto, BatchUserBalanceDto,
} from './dto/user-admin.dto';

@Injectable()
export class UserAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ==================== 操作日志 ====================
  private async logOp(adminId: string, action: string, module: string, targetId?: string, detail?: any, ip?: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: { accountId: adminId, action, module, targetId, targetType: module, detail, ip },
      });
    } catch { /* ignore */ }
  }

  // ==================== 用户等级 ====================

  async getLevelList(q: UserLevelQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.regionId) where.regionId = q.regionId;
    if (q.keyword) where.levelName = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.userLevel.findMany({ where, orderBy: [{ regionId: 'asc' }, { levelNumber: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.userLevel.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async createLevel(dto: CreateUserLevelDto) {
    return this.prisma.userLevel.create({ data: dto as any });
  }

  async updateLevel(id: string, dto: UpdateUserLevelDto) {
    const level = await this.prisma.userLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('等级不存在');
    return this.prisma.userLevel.update({ where: { id }, data: dto as any });
  }

  async deleteLevel(id: string) {
    const level = await this.prisma.userLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('等级不存在');
    return this.prisma.userLevel.delete({ where: { id } });
  }

  async getAllLevels(regionId?: string) {
    const where: any = { isActive: true };
    if (regionId) where.regionId = regionId;
    return this.prisma.userLevel.findMany({ where, orderBy: { levelNumber: 'asc' } });
  }

  // ==================== 用户经验 ====================

  async getExperienceList(q: UserExperienceQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.userId) where.userId = q.userId;

    const [list, total] = await Promise.all([
      this.prisma.userExperience.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userExperience.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async addExperience(dto: CreateUserExperienceDto, operatorId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId }, include: { experiences: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!user) throw new NotFoundException('用户不存在');

    // Calculate current exp and level
    const totalExp = dto.changeAmount; // relative change handled below
    const currentExp = user.experiences[0]?.afterExp || 0;
    const newExp = Math.max(0, currentExp + dto.changeAmount);

    // Determine level based on experience
    const levels = await this.prisma.userLevel.findMany({
      where: { isActive: true },
      orderBy: { levelNumber: 'asc' },
    });

    let currentLevel: any = null;
    let newLevel: any = null;
    for (const lv of levels) {
      if (currentExp >= lv.requiredExp) currentLevel = lv;
      if (newExp >= lv.requiredExp) newLevel = lv;
    }

    const record = await this.prisma.userExperience.create({
      data: {
        userId: dto.userId,
        changeAmount: dto.changeAmount,
        reason: dto.reason,
        beforeLevel: currentLevel?.levelName || '无等级',
        afterLevel: newLevel?.levelName || '无等级',
        beforeExp: currentExp,
        afterExp: newExp,
      },
    });

    await this.logOp(operatorId, 'add_experience', 'user_experience', dto.userId, { changeAmount: dto.changeAmount, afterExp: newExp, level: newLevel?.levelName }, ip);

    return { record, currentExp: newExp, currentLevel: newLevel };
  }

  // ==================== 用户标签定义 ====================

  async getTagDefList(q: UserTagDefQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.regionId) where.regionId = q.regionId;
    if (q.keyword) where.tagName = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.userTagDefinition.findMany({ where, orderBy: [{ regionId: 'asc' }, { displayOrder: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.userTagDefinition.count({ where }),
    ]);

    // Add usage counts
    const listWithCount: any[] = [];
    for (const def of list) {
      const cnt = await this.prisma.userTag.count({ where: { name: def.tagName } });
      listWithCount.push({ ...def, usedCount: cnt });
    }

    return { list: listWithCount, total, page, pageSize };
  }

  async createTagDef(dto: CreateUserTagDefDto) {
    return this.prisma.userTagDefinition.create({ data: dto as any });
  }

  async updateTagDef(id: string, dto: UpdateUserTagDefDto) {
    const def = await this.prisma.userTagDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('标签定义不存在');
    return this.prisma.userTagDefinition.update({ where: { id }, data: dto as any });
  }

  async deleteTagDef(id: string) {
    const def = await this.prisma.userTagDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('标签定义不存在');
    // Remove all user tags with this name
    await this.prisma.userTag.deleteMany({ where: { name: def.tagName } });
    return this.prisma.userTagDefinition.delete({ where: { id } });
  }

  async getAllTagDefs(regionId?: string) {
    const where: any = { isActive: true };
    if (regionId) where.regionId = regionId;
    return this.prisma.userTagDefinition.findMany({ where, orderBy: { displayOrder: 'asc' } });
  }

  // ==================== 地址管理 ====================

  async getAddressList(q: AddressQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    if (q.keyword) {
      where.OR = [
        { name: { contains: q.keyword } },
        { phone: { contains: q.keyword } },
        { detail: { contains: q.keyword } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.address.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.address.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async getAddressDetail(id: string) {
    const addr = await this.prisma.address.findUnique({
      where: { id },
      include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } },
    });
    if (!addr) throw new NotFoundException('地址不存在');
    return addr;
  }

  async deleteAddress(id: string, adminId: string, ip?: string) {
    const addr = await this.prisma.address.findUnique({ where: { id } });
    if (!addr) throw new NotFoundException('地址不存在');
    await this.prisma.address.delete({ where: { id } });
    await this.logOp(adminId, 'delete_address', 'address', id, { userId: addr.userId, detail: addr.detail }, ip);
    return { success: true };
  }

  // ==================== 用户引导 ====================

  async getGuidanceList(q: UserGuidanceQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.regionId) where.regionId = q.regionId;

    const [list, total] = await Promise.all([
      this.prisma.userGuidancePage.findMany({ where, orderBy: [{ regionId: 'asc' }, { sortOrder: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.userGuidancePage.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async createGuidance(dto: CreateUserGuidanceDto) {
    return this.prisma.userGuidancePage.create({ data: dto as any });
  }

  async updateGuidance(id: string, dto: UpdateUserGuidanceDto) {
    const page = await this.prisma.userGuidancePage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('引导页不存在');
    return this.prisma.userGuidancePage.update({ where: { id }, data: dto as any });
  }

  async deleteGuidance(id: string) {
    const page = await this.prisma.userGuidancePage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('引导页不存在');
    return this.prisma.userGuidancePage.delete({ where: { id } });
  }

  async getGuidanceByRegion(regionId: string) {
    const pages = await this.prisma.userGuidancePage.findMany({
      where: { regionId, isShow: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Also fetch available tags for the region
    const tags = await this.prisma.userTagDefinition.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    return { pages, tags };
  }

  // ==================== 余额批量操作 ====================

  async batchBalanceClear(dto: BatchBalanceClearDto, adminId: string, ip?: string) {
    if (!dto.userIds || dto.userIds.length === 0) {
      throw new BadRequestException('请选择用户');
    }

    let totalAmount = 0;
    let successCount = 0;
    const errors: string[] = [];

    for (const userId of dto.userIds) {
      try {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance.toNumber() <= 0) continue;

        const amount = wallet.balance.toNumber();
        totalAmount += amount;

        // Clear balance
        await this.prisma.wallet.update({
          where: { userId },
          data: { balance: 0 },
        });

        // Record transaction
        await this.prisma.walletTransaction.create({
          data: {
            userId,
            type: 'PENALTY',
            amount,
            balance: 0,
            description: `管理员批量清空余额${dto.reason ? `：${dto.reason}` : ''}`,
          },
        });

        successCount++;
      } catch (e: any) {
        errors.push(`${userId}: ${e.message}`);
      }
    }

    // Log the batch operation
    await this.prisma.userBalanceLog.create({
      data: {
        operatorId: adminId,
        action: 'batch_clear',
        userIds: dto.userIds,
        reason: dto.reason,
        userCount: successCount,
        totalAmount,
        ip,
      },
    });

    await this.logOp(adminId, 'batch_balance_clear', 'user_balance', undefined, { userCount: dto.userIds.length, successCount, totalAmount, reason: dto.reason }, ip);

    return { successCount, totalAmount, errors: errors.length > 0 ? errors : undefined };
  }

  async batchBalanceAdd(dto: BatchUserBalanceDto, adminId: string, ip?: string) {
    if (!dto.userIds || dto.userIds.length === 0) throw new BadRequestException('请选择用户');
    if (!dto.amount) throw new BadRequestException('请输入金额');

    let successCount = 0;
    let totalAmount = 0;
    const errors: string[] = [];

    for (const userId of dto.userIds) {
      try {
        const wallet = await this.prisma.wallet.upsert({
          where: { userId },
          create: { userId, balance: dto.amount },
          update: { balance: { increment: dto.amount } },
        });

        await this.prisma.walletTransaction.create({
          data: {
            userId,
            type: 'RECHARGE',
            amount: dto.amount,
            balance: wallet.balance.toNumber(),
            description: `管理员批量增加余额${dto.reason ? `：${dto.reason}` : ''}`,
          },
        });

        totalAmount += dto.amount;
        successCount++;
      } catch (e: any) {
        errors.push(`${userId}: ${e.message}`);
      }
    }

    await this.prisma.userBalanceLog.create({
      data: {
        operatorId: adminId,
        action: 'batch_add',
        userIds: dto.userIds,
        amount: dto.amount,
        reason: dto.reason,
        userCount: successCount,
        totalAmount,
        ip,
      },
    });

    await this.logOp(adminId, 'batch_balance_add', 'user_balance', undefined, { userCount: dto.userIds.length, successCount, totalAmount, reason: dto.reason }, ip);

    return { successCount, totalAmount, errors: errors.length > 0 ? errors : undefined };
  }

  async batchBalanceDeduct(dto: BatchUserBalanceDto, adminId: string, ip?: string) {
    if (!dto.userIds || dto.userIds.length === 0) throw new BadRequestException('请选择用户');
    if (!dto.amount) throw new BadRequestException('请输入金额');

    let successCount = 0;
    let totalAmount = 0;
    const errors: string[] = [];

    for (const userId of dto.userIds) {
      try {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) continue;

        await this.prisma.wallet.update({
          where: { userId },
          data: { balance: { decrement: dto.amount } },
        });

        await this.prisma.walletTransaction.create({
          data: {
            userId,
            type: 'PENALTY',
            amount: dto.amount,
            balance: wallet.balance.toNumber() - dto.amount,
            description: `管理员批量扣除余额${dto.reason ? `：${dto.reason}` : ''}`,
          },
        });

        totalAmount += dto.amount;
        successCount++;
      } catch (e: any) {
        errors.push(`${userId}: ${e.message}`);
      }
    }

    await this.prisma.userBalanceLog.create({
      data: {
        operatorId: adminId,
        action: 'batch_deduct',
        userIds: dto.userIds,
        amount: dto.amount,
        reason: dto.reason,
        userCount: successCount,
        totalAmount,
        ip,
      },
    });

    await this.logOp(adminId, 'batch_balance_deduct', 'user_balance', undefined, { userCount: dto.userIds.length, successCount, totalAmount, reason: dto.reason }, ip);

    return { successCount, totalAmount, errors: errors.length > 0 ? errors : undefined };
  }

  async getBalanceLogs(q: any) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.action) where.action = q.action;

    const [list, total] = await Promise.all([
      this.prisma.userBalanceLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userBalanceLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ==================== 用户等级查询 ====================

  async getUserLevels(q: any) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.keyword) {
      where.user = { OR: [{ nickname: { contains: q.keyword } }, { phone: { contains: q.keyword } }] };
    }

    // Get users with their latest experience
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { ...where, status: { not: 'DELETED' } },
        select: {
          id: true, nickname: true, avatar: true, phone: true,
          experiences: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: { ...where, status: { not: 'DELETED' } } }),
    ]);

    // Enrich with level info
    const allLevels = await this.prisma.userLevel.findMany({ where: { isActive: true }, orderBy: { levelNumber: 'asc' } });

    const list = users.map((u: any) => {
      const currentExp = u.experiences[0]?.afterExp || 0;
      const currentLevelName = u.experiences[0]?.afterLevel || '无等级';
      // Find next level
      const currentLevelIdx = allLevels.findIndex((l: any) => l.levelName === currentLevelName);
      const nextLevel = currentLevelIdx >= 0 && currentLevelIdx < allLevels.length - 1 ? allLevels[currentLevelIdx + 1] : null;
      const nextExp = nextLevel?.requiredExp || currentExp;

      return {
        userId: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
        phone: u.phone,
        currentExp,
        currentLevelName,
        nextLevelName: nextLevel?.levelName || null,
        nextExp,
        maxLevel: !nextLevel,
      };
    });

    return { list, total, page, pageSize };
  }
}
