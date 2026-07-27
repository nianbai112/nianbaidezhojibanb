import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { GrowthService } from '../growth/growth.service';
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
    private readonly growthService: GrowthService,
  ) {}

  // ==================== 操作日志 ====================
  private async logOp(adminId: string, action: string, module: string, targetId?: string, detail?: any, ip?: string) {
    try {
      await this.prisma.adminOperationLog.create({
        data: { accountId: adminId, action, module, targetId, targetType: module, detail, ip },
      });
    } catch { /* ignore */ }
  }

  private async runWithLock<T>(key: string, message: string, fn: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const locked = await this.redis.getLock(key, ttlSeconds);
    if (!locked) throw new BadRequestException(message);
    try {
      return await fn();
    } finally {
      await this.redis.releaseLock(key).catch(() => undefined);
    }
  }

  // ==================== 用户等级 ====================

  private normalizeRegionId(value?: string | null) {
    const text = String(value || '').trim();
    if (!text || text === '__global__') return null;
    return text;
  }

  private async invalidateGrowthProfileCaches() {
    await Promise.all([
      this.redis.delPattern('user:profile:v2:*').catch(() => undefined),
      this.redis.delPattern('user:profile:*').catch(() => undefined),
      this.redis.delPattern('post:feed:*').catch(() => undefined),
    ]);
  }

  async getLevelTitleOptions(regionId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    return this.prisma.userTitle.findMany({
      where: {
        isEnabled: true,
        OR: normalizedRegionId ? [{ regionId: normalizedRegionId }, { regionId: null }] : [{ regionId: null }],
      },
      select: { id: true, name: true, regionId: true, icon: true, image: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  private async assertLevelTitle(titleId: any, regionId?: string | null) {
    const id = String(titleId || '').trim();
    if (!id) return;
    const title = await this.prisma.userTitle.findFirst({
      where: {
        id,
        isEnabled: true,
        OR: regionId ? [{ regionId }, { regionId: null }] : [{ regionId: null }],
      },
      select: { id: true },
    });
    if (!title) throw new BadRequestException('请选择当前等级范围内已启用的称号');
  }

  private async attachLevelRegionNames<T extends any[]>(list: T): Promise<T> {
    const regionIds = Array.from(new Set(list.map((item: any) => item.regionId).filter(Boolean)));
    if (!regionIds.length) return list;
    const regions = await this.prisma.region.findMany({
      where: { id: { in: regionIds } },
      select: { id: true, name: true },
    });
    const regionMap = new Map(regions.map((region) => [region.id, region.name]));
    return list.map((item: any) => ({
      ...item,
      regionName: regionMap.get(item.regionId) || '',
      region_name: regionMap.get(item.regionId) || '',
    })) as T;
  }

  async getLevelRegionOptions() {
    return this.prisma.region.findMany({
      select: { id: true, name: true, code: true, isOpen: true },
      orderBy: [{ isOpen: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async getLevelList(q: UserLevelQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.regionId === '__global__') where.regionId = null;
    else if (q.regionId) where.regionId = q.regionId;
    if (q.keyword) where.levelName = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.userLevel.findMany({ where, orderBy: [{ regionId: 'asc' }, { levelNumber: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.userLevel.count({ where }),
    ]);
    return { list: await this.attachLevelRegionNames(list), total, page, pageSize };
  }

  async createLevel(dto: CreateUserLevelDto) {
    const data = this.normalizeLevelInput(dto) as any;
    if (Number(data.levelNumber) === 1) data.requiredExp = 0;
    await this.assertLevelTitle(data.levelTitleId, data.regionId);
    const created = await this.prisma.userLevel.create({ data });
    await this.invalidateGrowthProfileCaches();
    return created;
  }

  async updateLevel(id: string, dto: UpdateUserLevelDto) {
    const level = await this.prisma.userLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('等级不存在');
    const data = this.normalizeLevelInput(dto, false) as any;
    if (Number(data.levelNumber ?? level.levelNumber) === 1) data.requiredExp = 0;
    await this.assertLevelTitle(data.levelTitleId ?? level.levelTitleId, data.regionId ?? level.regionId);
    const updated = await this.prisma.userLevel.update({ where: { id }, data });
    await this.invalidateGrowthProfileCaches();
    return updated;
  }

  async deleteLevel(id: string) {
    const level = await this.prisma.userLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('等级不存在');
    const deleted = await this.prisma.userLevel.delete({ where: { id } });
    await this.invalidateGrowthProfileCaches();
    return deleted;
  }

  async getAllLevels(regionId?: string) {
    const where: any = { isActive: true };
    if (regionId === '__global__') where.regionId = null;
    else if (regionId) where.regionId = regionId;
    const list = await this.prisma.userLevel.findMany({ where, orderBy: { levelNumber: 'asc' } });
    return this.attachLevelRegionNames(list);
  }

  private normalizeLevelInput(dto: any, withDefaults = true) {
    const data: any = { ...dto };
    if (withDefaults || data.regionId !== undefined) {
      data.regionId = data.regionId === '__global__' ? null : data.regionId || null;
    }
    data.levelIcon = data.levelIcon ?? data.level_icon ?? data.icon ?? data.iconUrl ?? (withDefaults ? '' : undefined);
    data.levelBadgeImage = data.levelBadgeImage ?? data.level_badge_image ?? data.badgeImage ?? data.badge_image ?? (withDefaults ? '' : undefined);
    if (data.levelBenefits !== undefined) {
      const list = Array.isArray(data.levelBenefits) ? data.levelBenefits : [];
      const seen = new Set<string>();
      const benefits = list.slice(0, 3).map((item: any, index: number) => {
        const type = String(item?.type || item?.key || '').trim();
        if (!['identity', 'title', 'content_boost'].includes(type) || seen.has(type)) return null;
        seen.add(type);
        const value = type === 'content_boost' ? Math.max(0, Math.min(20, Math.trunc(Number(item?.value || 0)))) : undefined;
        return {
          id: String(item?.id || type), type, enabled: item?.enabled !== false, sortOrder: index,
          name: String(item?.name || '').trim().slice(0, 24), description: String(item?.description || '').trim().slice(0, 80),
          icon: String(item?.icon || '').trim(), titleId: type === 'title' ? String(item?.titleId || '').trim() : '', value,
        };
      }).filter(Boolean);
      if (!benefits.some((item: any) => item.type === 'identity')) benefits.unshift({ id: 'identity', type: 'identity', enabled: true, sortOrder: 0, name: '', description: '', icon: '', titleId: '' });
      data.levelBenefits = JSON.stringify(benefits.map((item: any, index: number) => ({ ...item, sortOrder: index })));
      const title = benefits.find((item: any) => item.type === 'title' && item.enabled && item.titleId);
      const boost = benefits.find((item: any) => item.type === 'content_boost' && item.enabled);
      data.levelTitleId = title?.titleId || null;
      data.contentBoostWeight = Number(boost?.value || 0);
    }
    if (withDefaults || data.levelTitleId !== undefined) data.levelTitleId = String(data.levelTitleId || '').trim() || null;
    if (withDefaults || data.contentBoostWeight !== undefined) data.contentBoostWeight = Math.max(0, Math.min(20, Math.trunc(Number(data.contentBoostWeight || 0))));
    delete data.level_icon;
    delete data.icon;
    delete data.iconUrl;
    delete data.level_badge_image;
    delete data.badgeImage;
    delete data.badge_image;
    delete data.levelMedalImage;
    delete data.level_medal_image;
    delete data.medalImage;
    delete data.medal_image;
    return data;
  }

  // ==================== 用户经验 ====================

  async getExperienceList(q: UserExperienceQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    const regionId = this.normalizeRegionId(q.regionId);
    if (regionId) where.regionId = regionId;
    else if (q.regionId === '__global__') where.regionId = null;
    if (q.userId) where.userId = q.userId;

    const [list, total] = await Promise.all([
      this.prisma.userExperience.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          region: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userExperience.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async addExperience(dto: CreateUserExperienceDto, operatorId: string, ip?: string) {
    const amount = Number(dto.changeAmount || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('经验变动不能为0');
    }
    const regionId = this.normalizeRegionId(dto.regionId);
    if (!regionId) {
      throw new BadRequestException('请选择经验归属区域');
    }
    const result: any = await this.growthService.awardExperience({
      userId: dto.userId,
      regionId,
      amount,
      reason: dto.reason || '后台调整',
      source: 'admin_adjust',
    });

    await this.logOp(operatorId, 'add_experience', 'user_experience', dto.userId, {
      changeAmount: dto.changeAmount,
      regionId,
      afterExp: result.currentExp,
      level: result.currentLevel?.levelName,
    }, ip);

    return {
      record: result.record,
      currentExp: result.currentExp,
      currentLevel: result.currentLevel,
      growthSummary: result,
    };
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
    const data = this.normalizeTagDefInput(dto);
    return this.prisma.userTagDefinition.create({ data });
  }

  async updateTagDef(id: string, dto: UpdateUserTagDefDto) {
    const def = await this.prisma.userTagDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('标签定义不存在');
    const data = this.normalizeTagDefInput(dto, false);
    return this.prisma.userTagDefinition.update({ where: { id }, data });
  }

  private normalizeTagDefInput(dto: any, withDefaults = true) {
    const data: any = { ...dto };
    if (data.name !== undefined && data.tagName === undefined) data.tagName = data.name;
    if (data.description !== undefined && data.tagDesc === undefined) data.tagDesc = data.description;
    delete data.name;
    delete data.description;
    if (data.tagName !== undefined) data.tagName = String(data.tagName).trim();
    if (data.tagDesc !== undefined) data.tagDesc = String(data.tagDesc || '').trim();
    if (withDefaults && (data.tagLevel === undefined || data.tagLevel === null)) data.tagLevel = 1;
    if (withDefaults && data.isActive === undefined) data.isActive = true;
    return data;
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
    if (regionId) where.OR = [{ regionId }, { regionId: null }];
    return this.prisma.userTagDefinition.findMany({ where, orderBy: { displayOrder: 'asc' } });
  }

  // ==================== 地址管理 ====================

  async getAddressList(q: AddressQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    if (q.regionId) where.regionId = q.regionId;
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

  async getGuidanceSettings() {
    const config = await this.prisma.config.findUnique({ where: { key: 'force_guidance_enabled' } });
    const enabled = config?.value === true;
    return {
      force_guidance_enabled: enabled,
      forceGuidanceEnabled: enabled,
    };
  }

  async saveGuidanceSettings(dto: Record<string, any>) {
    const enabled = dto?.force_guidance_enabled === true || dto?.forceGuidanceEnabled === true;
    await this.prisma.config.upsert({
      where: { key: 'force_guidance_enabled' },
      create: { key: 'force_guidance_enabled', group: 'user_guidance', value: enabled },
      update: { group: 'user_guidance', value: enabled },
    });
    return {
      success: true,
      force_guidance_enabled: enabled,
      forceGuidanceEnabled: enabled,
    };
  }

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
    return this.runWithLock(
      `admin:balance:${adminId}:clear`,
      '批量清空余额任务正在处理中，请稍后再试',
      () => this.batchBalanceClearUnlocked(dto, adminId, ip),
    );
  }

  private async batchBalanceClearUnlocked(dto: BatchBalanceClearDto, adminId: string, ip?: string) {
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
    return this.runWithLock(
      `admin:balance:${adminId}:add`,
      '批量增加余额任务正在处理中，请稍后再试',
      () => this.batchBalanceAddUnlocked(dto, adminId, ip),
    );
  }

  private async batchBalanceAddUnlocked(dto: BatchUserBalanceDto, adminId: string, ip?: string) {
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
    return this.runWithLock(
      `admin:balance:${adminId}:deduct`,
      '批量扣除余额任务正在处理中，请稍后再试',
      () => this.batchBalanceDeductUnlocked(dto, adminId, ip),
    );
  }

  private async batchBalanceDeductUnlocked(dto: BatchUserBalanceDto, adminId: string, ip?: string) {
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
    const regionId = this.normalizeRegionId(q.regionId);
    if (q.keyword) {
      where.user = { OR: [{ nickname: { contains: q.keyword } }, { phone: { contains: q.keyword } }] };
    }

    // Get users with their latest experience
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { ...where, status: { not: 'DELETED' } },
        select: {
          id: true, nickname: true, avatar: true, phone: true,
          experiences: {
            where: { regionId },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: { ...where, status: { not: 'DELETED' } } }),
    ]);

    const list = await Promise.all(users.map(async (u: any) => {
      const currentExp = u.experiences[0]?.afterExp || 0;
      const growth = await this.growthService.getUserGrowthSummary(u.id, regionId).catch(() => null);
      const currentLevel = growth?.currentLevel || null;
      const nextLevel = growth?.nextLevel || null;

      return {
        userId: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
        phone: u.phone,
        currentExp: growth?.currentExp ?? currentExp,
        currentLevelName: currentLevel?.levelName || u.experiences[0]?.afterLevel || '无等级',
        nextLevelName: nextLevel?.levelName || null,
        nextExp: nextLevel?.requiredExp || growth?.currentExp || currentExp,
        maxLevel: growth?.maxLevel ?? !nextLevel,
        levelConfigIncomplete: growth?.levelConfigIncomplete ?? false,
        currentLevel,
        nextLevel,
        progress: growth?.progress || 0,
        expToNextLevel: growth?.expToNextLevel || 0,
        growthSummary: growth,
      };
    }));

    return { list, total, page, pageSize };
  }
}
