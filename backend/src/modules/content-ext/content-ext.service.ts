import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ContentExtService {
  constructor(private readonly prisma: PrismaService) {}

  // =================== 匿名身份 ===================
  async getAnonymousIdentities(query: any) {
    const { page = 1, limit = 20 } = query;
    const regionId = String(query.regionId || query.region_id || '').trim();
    if (!regionId) throw new BadRequestException('请选择区域');
    const where = { regionId };
    const [list, total] = await Promise.all([
      this.prisma.anonymousIdentity.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.anonymousIdentity.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createAnonymousIdentity(dto: { name: string; avatar?: string; regionId?: string; region_id?: string }) {
    if (!dto.name) throw new BadRequestException('名称不能为空');
    const regionId = String(dto.regionId || dto.region_id || '').trim();
    if (!regionId) throw new BadRequestException('请选择区域');
    return this.prisma.anonymousIdentity.create({ data: { name: dto.name.trim(), avatar: dto.avatar || null, regionId } });
  }

  async updateAnonymousIdentity(id: string, dto: { name?: string; avatar?: string; regionId?: string; region_id?: string }) {
    const regionId = String(dto.regionId || dto.region_id || '').trim();
    if (!regionId) throw new BadRequestException('请选择区域');
    const result = await this.prisma.anonymousIdentity.updateMany({
      where: { id, regionId },
      data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.avatar !== undefined ? { avatar: dto.avatar || null } : {}) },
    });
    if (!result.count) throw new NotFoundException('匿名身份不存在或不属于当前区域');
    return this.prisma.anonymousIdentity.findFirst({ where: { id, regionId } });
  }

  async deleteAnonymousIdentity(id: string, regionId: string) {
    if (!regionId) throw new BadRequestException('请选择区域');
    const result = await this.prisma.anonymousIdentity.deleteMany({ where: { id, regionId } });
    if (!result.count) throw new NotFoundException('匿名身份不存在或不属于当前区域');
    return { success: true };
  }

  // =================== 笔记海报配置 ===================
  private normalizePosterConfig(value: any = {}) {
    const raw = value && typeof value === 'object' ? value : {};
    return {
      version: Math.max(1, Number(raw.version) || 1),
      bgColor: String(raw.bgColor || '#ffffff'),
      backgroundUrl: String(raw.backgroundUrl || ''),
      frameUrl: String(raw.frameUrl || ''),
      logoUrl: String(raw.logoUrl || ''),
      textPlaceholderUrl: String(raw.textPlaceholderUrl || ''),
      qrcodeFrameUrl: String(raw.qrcodeFrameUrl || ''),
      ctaText: String(raw.ctaText || raw.footerText || '扫码查看笔记'),
      footerText: String(raw.footerText || raw.ctaText || '扫码查看笔记'),
      qrcodePosition: String(raw.qrcodePosition || 'bottom-right'),
      safeAreas: raw.safeAreas && typeof raw.safeAreas === 'object' ? raw.safeAreas : {},
      regionOverrides: raw.regionOverrides && typeof raw.regionOverrides === 'object' ? raw.regionOverrides : {},
    };
  }

  async getPosterConfig() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'content.poster_config' } });
    return this.normalizePosterConfig(cfg?.value);
  }

  async updatePosterConfig(dto: any) {
    const current = await this.getPosterConfig();
    const next = this.normalizePosterConfig({ ...current, ...(dto || {}) });
    next.version = current.version + 1;
    await this.prisma.config.upsert({
      where: { key: 'content.poster_config' },
      update: { value: next },
      create: { key: 'content.poster_config', value: next, group: 'content', desc: '笔记海报配置' },
    });
    return { success: true };
  }

  // =================== 奖励设置 ===================
  async getRewardConfig() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'content.reward_config' } });
    return (cfg?.value as any) || {
      postPublishReward: 5,
      commentReward: 2,
      firstPostReward: 50,
    };
  }

  async updateRewardConfig(dto: any) {
    const contentRewards = { ...(dto || {}) };
    delete contentRewards.dailyCheckInReward;
    delete contentRewards.continuousBonus;
    await this.prisma.config.upsert({
      where: { key: 'content.reward_config' },
      update: { value: contentRewards },
      create: { key: 'content.reward_config', value: contentRewards, group: 'content', desc: '用户奖励设置' },
    });
    return { success: true };
  }

  async getBadges(query: any) {
    const { page = 1, limit = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.badge.findMany({
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.badge.count(),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createBadge(dto: any) {
    return this.prisma.badge.create({ data: dto });
  }

  async deleteBadge(id: string) {
    return this.prisma.badge.delete({ where: { id } });
  }

  // =================== 通知记录 ===================
  async getNotifications(query: any) {
    const { page = 1, limit = 20, userId, type } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async deleteNotification(id: string) {
    void id;
    throw new BadRequestException('通知属于投递历史，后台不可物理删除');
  }
}
