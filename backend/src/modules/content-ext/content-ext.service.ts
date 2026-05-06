import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ContentExtService {
  constructor(private readonly prisma: PrismaService) {}

  // =================== 匿名身份 ===================
  async getAnonymousIdentities(query: any) {
    const { page = 1, limit = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.anonymousIdentity.findMany({
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.anonymousIdentity.count(),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createAnonymousIdentity(dto: { name: string; avatar?: string }) {
    if (!dto.name) throw new BadRequestException('名称不能为空');
    return this.prisma.anonymousIdentity.create({ data: dto });
  }

  async updateAnonymousIdentity(id: string, dto: { name?: string; avatar?: string }) {
    return this.prisma.anonymousIdentity.update({ where: { id }, data: dto });
  }

  async deleteAnonymousIdentity(id: string) {
    return this.prisma.anonymousIdentity.delete({ where: { id } });
  }

  // =================== 笔记海报配置 ===================
  async getPosterConfig() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'content.poster_config' } });
    return (cfg?.value as any) || {
      bgColor: '#ffffff',
      logoUrl: '',
      footerText: '扫码查看更多',
      qrcodePosition: 'bottom-right',
    };
  }

  async updatePosterConfig(dto: any) {
    await this.prisma.config.upsert({
      where: { key: 'content.poster_config' },
      update: { value: dto },
      create: { key: 'content.poster_config', value: dto, group: 'content', desc: '笔记海报配置' },
    });
    return { success: true };
  }

  // =================== 奖励设置 ===================
  async getRewardConfig() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'content.reward_config' } });
    return (cfg?.value as any) || {
      dailyCheckInReward: 10,
      continuousBonus: [0, 0, 0, 5, 5, 5, 20], // 连续7天奖励加成
      postPublishReward: 5,
      commentReward: 2,
      firstPostReward: 50,
    };
  }

  async updateRewardConfig(dto: any) {
    await this.prisma.config.upsert({
      where: { key: 'content.reward_config' },
      update: { value: dto },
      create: { key: 'content.reward_config', value: dto, group: 'content', desc: '用户奖励设置' },
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
    return this.prisma.notification.delete({ where: { id } });
  }
}
