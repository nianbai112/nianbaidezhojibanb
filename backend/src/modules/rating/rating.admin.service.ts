import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class RatingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Dashboard ====================

  async getDashboard(regionId?: string) {
    const itemWhere: any = {};
    if (regionId) itemWhere.regionId = regionId;

    const [totalRatings, avgScoreResult, totalItems, totalCategories, recentRatings] = await Promise.all([
      this.prisma.userRating.count({ where: regionId ? { regionId } : {} }),
      this.prisma.userRating.aggregate({
        where: regionId ? { regionId } : {},
        _avg: { score: true },
      }),
      this.prisma.ratingItem.count({ where: itemWhere }),
      this.prisma.ratingCategory.count(),
      this.prisma.userRating.findMany({
        where: regionId ? { regionId } : {},
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          item: { select: { id: true, name: true } },
          User: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
    ]);

    // Score distribution (1-5)
    const distribution: number[] = [];
    for (let score = 1; score <= 5; score++) {
      const count = await this.prisma.userRating.count({
        where: { ...(regionId ? { regionId } : {}), score },
      });
      distribution.push(count);
    }

    return {
      totalRatings,
      avgScore: avgScoreResult._avg.score ? Math.round(avgScoreResult._avg.score * 100) / 100 : 0,
      totalItems,
      totalCategories,
      scoreDistribution: distribution,
      recentRatings,
    };
  }

  // ==================== Category CRUD ====================

  async getCategories(query: any) {
    const { page = 1, limit = 20, regionId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.ratingCategory.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.ratingCategory.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createCategory(dto: any) {
    return this.prisma.ratingCategory.create({ data: dto });
  }

  async updateCategory(id: string, dto: any) {
    const cat = await this.prisma.ratingCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    return this.prisma.ratingCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.ratingCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!cat) throw new NotFoundException('分类不存在');
    if (cat._count.items > 0) throw new BadRequestException('该分类下存在评分项目，无法删除');
    return this.prisma.ratingCategory.delete({ where: { id } });
  }

  // ==================== Item CRUD ====================

  async getItems(query: any) {
    const { page = 1, limit = 20, categoryId, regionId, keyword, status } = query;
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.ratingItem.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { sortOrder: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      }),
      this.prisma.ratingItem.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async createItem(dto: any) {
    return this.prisma.ratingItem.create({ data: dto });
  }

  async updateItem(id: string, dto: any) {
    const item = await this.prisma.ratingItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('评分项目不存在');
    return this.prisma.ratingItem.update({ where: { id }, data: dto });
  }

  async deleteItem(id: string) {
    const item = await this.prisma.ratingItem.findUnique({
      where: { id },
      include: { _count: { select: { ratings: true } } },
    });
    if (!item) throw new NotFoundException('评分项目不存在');
    if (item._count.ratings > 0) throw new BadRequestException('该项目下存在评分记录，无法删除');
    return this.prisma.ratingItem.delete({ where: { id } });
  }

  // ==================== Rating Records ====================

  async getRecords(query: any) {
    const { page = 1, limit = 20, itemId, userId, regionId, scoreMin, scoreMax, keyword } = query;
    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;
    if (scoreMin !== undefined) where.score = { ...(where.score || {}), gte: Number(scoreMin) };
    if (scoreMax !== undefined) where.score = { ...(where.score || {}), lte: Number(scoreMax) };
    if (keyword) {
      where.OR = [
        { content: { contains: keyword, mode: 'insensitive' } },
        { User: { nickname: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.userRating.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          item: { select: { id: true, name: true, categoryId: true } },
          User: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.userRating.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async deleteRecord(id: string) {
    const record = await this.prisma.userRating.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('评分记录不存在');

    await this.prisma.userRating.delete({ where: { id } });

    // Recalculate item stats
    const stats = await this.prisma.userRating.aggregate({
      where: { itemId: record.itemId },
      _avg: { score: true },
      _count: true,
    });
    await this.prisma.ratingItem.update({
      where: { id: record.itemId },
      data: {
        avgScore: stats._avg.score || 0,
        ratingCount: stats._count,
      },
    });

    return { message: '已删除' };
  }

  // ==================== Replies ====================

  async getReplies(query: any) {
    const { page = 1, limit = 20, ratingId, userId, status } = query;
    const where: any = {};
    if (ratingId) where.ratingId = ratingId;
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.ratingReply.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          rating: { select: { id: true, score: true, item: { select: { id: true, name: true } } } },
          user: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.ratingReply.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async auditReply(id: string, dto: any) {
    const reply = await this.prisma.ratingReply.findUnique({ where: { id } });
    if (!reply) throw new NotFoundException('回复不存在');
    return this.prisma.ratingReply.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async deleteReply(id: string) {
    const reply = await this.prisma.ratingReply.findUnique({ where: { id } });
    if (!reply) throw new NotFoundException('回复不存在');
    return this.prisma.ratingReply.delete({ where: { id } });
  }

  // ==================== Region Settings ====================

  async getSettings(query: any) {
    const { page = 1, limit = 50 } = query;

    const [regions, total] = await Promise.all([
      this.prisma.region.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.region.count(),
    ]);

    const regionIds = regions.map((r) => r.id);
    const settings = await this.prisma.ratingRegionSetting.findMany({
      where: { regionId: { in: regionIds } },
    });
    const settingsMap = new Map(settings.map((s) => [s.regionId, s]));

    const list = regions.map((r) => {
      const setting = settingsMap.get(r.id);
      return {
        regionId: r.id,
        regionName: r.name,
        enableRating: setting?.enableRating ?? true,
        enableDynamic: setting?.enableDynamic ?? true,
        requireLoginToRate: setting?.requireLoginToRate ?? true,
        createdAt: setting?.createdAt || null,
        updatedAt: setting?.updatedAt || null,
      };
    });

    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async getSetting(regionId: string) {
    const setting = await this.prisma.ratingRegionSetting.findUnique({ where: { regionId } });
    return setting || { regionId, enableRating: true, enableDynamic: true, requireLoginToRate: true };
  }

  async updateSetting(regionId: string, dto: any) {
    return this.prisma.ratingRegionSetting.upsert({
      where: { regionId },
      update: dto,
      create: { regionId, ...dto },
    });
  }
}
