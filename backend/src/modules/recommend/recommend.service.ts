import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class RecommendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private defaultSlots() {
    return [
      { id: 'home-hot', name: '首页热门推荐', position: 'home', limit: 10, status: 'active' },
      { id: 'post-related', name: '帖子相关推荐', position: 'post_detail', limit: 6, status: 'active' },
      { id: 'merchant-nearby', name: '附近商家推荐', position: 'merchant', limit: 8, status: 'active' },
    ];
  }

  private async readSlots() {
    const config = await this.prisma.config.findUnique({ where: { key: 'recommend_slots' } });
    const value = config?.value as any;
    return Array.isArray(value?.list) ? value.list : this.defaultSlots();
  }

  private async saveSlots(list: any[], operatorId?: string) {
    await this.prisma.config.upsert({
      where: { key: 'recommend_slots' },
      update: { value: { list }, group: 'recommend', updatedBy: operatorId },
      create: { key: 'recommend_slots', value: { list }, group: 'recommend', createdBy: operatorId, updatedBy: operatorId },
    });
    return list;
  }

  async getSlots() {
    const list = await this.readSlots();
    return { list, total: list.length };
  }

  async createSlot(data: any, operatorId?: string) {
    const list = await this.readSlots();
    const item = {
      id: data.id || `slot_${Date.now()}`,
      name: data.name || '未命名推荐位',
      position: data.position || 'home',
      limit: Number(data.limit || 10),
      status: data.status || 'active',
      remark: data.remark || '',
    };
    await this.saveSlots([item, ...list], operatorId);
    return { success: true, data: item };
  }

  async updateSlot(id: string, data: any, operatorId?: string) {
    const list = await this.readSlots();
    const next = list.map((slot: any) =>
      String(slot.id) === String(id)
        ? { ...slot, ...data, id: slot.id, limit: data.limit !== undefined ? Number(data.limit) : slot.limit }
        : slot,
    );
    await this.saveSlots(next, operatorId);
    return { success: true, data: next.find((slot: any) => String(slot.id) === String(id)) || null };
  }

  private calculateHeatScore(item: any, weights: any): number {
    const {
      likeWeight = 1,
      viewWeight = 0.1,
      commentWeight = 2,
      favoriteWeight = 1.5,
      shareWeight = 3,
    } = weights;

    return (
      (item.likeCount || 0) * likeWeight +
      (item.viewCount || 0) * viewWeight +
      (item.commentCount || 0) * commentWeight +
      (item.favoriteCount || 0) * favoriteWeight +
      (item.shareCount || 0) * shareWeight
    );
  }

  private applyTimeDecay(score: number, createdAt: Date, decayHours: number = 72): number {
    const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    const decayFactor = Math.max(0, 1 - hoursOld / decayHours);
    return score * decayFactor;
  }

  private async getStrategyForTarget(targetType: string, regionId?: string) {
    const strategy = await this.prisma.recommendStrategy.findFirst({
      where: {
        targetType,
        isEnabled: true,
        ...(regionId ? { regionId } : { regionId: null }),
      },
    });

    return (
      strategy || {
        weights: {
          heat: 0.3,
          time: 0.25,
          interest: 0.15,
          follow: 0.15,
          behavior: 0.1,
          manual: 0.05,
        },
        filters: { blacklist: true, sensitive: true, region: true },
        rankRules: { timeDecay: 72, diversity: true, freshness: 24 },
      }
    );
  }

  private async getManualControls(targetType: string, regionId?: string) {
    const controls = await this.prisma.recommendControl.findMany({
      where: {
        targetType,
        ...(regionId ? {} : {}),
      },
    });

    const result: Record<string, any> = {};
    controls.forEach((c) => {
      result[c.targetId] = c;
    });
    return result;
  }

  async getFeed(query: any, userId?: string) {
    const { regionId, page = 1, pageSize = 20 } = query;
    const strategy = await this.getStrategyForTarget('post', regionId);
    const controls = await this.getManualControls('post', regionId);

    // Get posts from pool
    const poolItems = await this.prisma.recommendPool.findMany({
      where: {
        targetType: 'post',
        ...(regionId ? { regionId } : {}),
        ...(query.expireAt ? { expireAt: { gt: new Date() } } : {}),
      },
      orderBy: { score: 'desc' },
      skip: (page - 1) * pageSize,
      take: Number(pageSize) * 2, // Get more for filtering
    });

    // Get actual post data
    const postIds = poolItems.map((p) => p.targetId);
    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds }, status: 'PUBLISHED' },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        media: { take: 3 },
      },
    });

    // Apply manual controls
    const filtered = posts
      .filter((p) => {
        const control = controls[p.id];
        if (control?.action === 'block') return false;
        return true;
      })
      .map((p) => {
        const poolItem = poolItems.find((pi) => pi.targetId === p.id);
        const control = controls[p.id];
        let score = poolItem?.score || 0;

        if (control?.action === 'boost') score += control.value || 100;
        if (control?.action === 'downrank') score *= 0.5;
        if (control?.action === 'pin') score = 999999;

        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Number(pageSize));

    return {
      list: filtered,
      total: filtered.length,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  async getRecommendPosts(query: any, userId?: string) {
    return this.getFeed(query, userId);
  }

  async getRecommendMerchants(query: any, userId?: string) {
    const { regionId, page = 1, pageSize = 20 } = query;

    const where: any = { status: 'approved' };
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getRecommendProducts(query: any, userId?: string) {
    const { regionId, page = 1, pageSize = 20 } = query;

    const where: any = { status: 'active' };
    if (regionId) where.merchant = { regionId };

    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { merchant: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getRecommendTopics(query: any, userId?: string) {
    return this.getTopics(query);
  }

  async getTopics(query: any) {
    const { regionId, page = 1, pageSize = 20 } = query;
    const region_id = query.region_id || regionId;
    const circle_id = query.circle_id;
    const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
    const sortBy = query.sortBy || query.sort || 'heat';
    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.max(1, Math.min(100, Number(pageSize) || 20));
    const where: any = { status: 'active' };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }
    if (region_id) {
      where.circles = { some: { circle: { regionId: region_id } } };
    }
    if (circle_id) {
      where.circles = { some: { circleId: circle_id } };
    }

    const orderBy =
      sortBy === 'latest'
        ? [{ createdAt: 'desc' as const }]
        : sortBy === 'follow'
          ? [{ followCount: 'desc' as const }, { postCount: 'desc' as const }]
          : [{ isHot: 'desc' as const }, { postCount: 'desc' as const }, { followCount: 'desc' as const }];

    const [list, total] = await Promise.all([
      this.prisma.topic.findMany({
        where,
        include: {
          circles: {
            include: { circle: { select: { id: true, name: true, regionId: true, icon: true } } },
          },
        },
        orderBy,
        skip: (pageNum - 1) * take,
        take,
      }),
      this.prisma.topic.count({ where }),
    ]);

    const data = list.map((topic) => this.toMiniTopic(topic));
    return { data, list: data, total, page: pageNum, pageSize: take };
  }

  async getTopicDetail(id: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id },
      include: {
        circles: {
          include: { circle: { select: { id: true, name: true, regionId: true, icon: true } } },
        },
      },
    });
    return topic ? this.toMiniTopic(topic) : null;
  }

  async updateTopic(id: string, dto: any) {
    const topic = await this.prisma.topic.update({
      where: { id },
      data: {
        name: dto.name ?? dto.title,
        description: dto.description,
        cover: dto.cover || dto.icon,
        isHot: dto.isHot ?? dto.is_hot,
        status: dto.status,
      },
      include: {
        circles: {
          include: { circle: { select: { id: true, name: true, regionId: true, icon: true } } },
        },
      },
    });
    return this.toMiniTopic(topic);
  }

  private toMiniTopic(topic: any) {
    const firstCircle = topic.circles?.[0]?.circle;
    return {
      id: topic.id,
      topic_id: topic.id,
      name: topic.name,
      title: topic.name,
      cover: topic.cover || firstCircle?.icon || '',
      description: topic.description || '',
      post_count: Number(topic.postCount || 0),
      postCount: Number(topic.postCount || 0),
      follow_count: Number(topic.followCount || 0),
      followCount: Number(topic.followCount || 0),
      heat: Number(topic.postCount || 0) + Number(topic.followCount || 0),
      is_hot: !!topic.isHot,
      isHot: !!topic.isHot,
      status: topic.status,
      circle_id: firstCircle?.id || '',
      circle_name: firstCircle?.name || '',
      region_id: firstCircle?.regionId || '',
      created_at: topic.createdAt,
      createdAt: topic.createdAt,
    };
  }

  async getStrategy(query: any) {
    const { targetType, regionId } = query;
    const where: any = {};
    if (targetType) where.targetType = targetType;
    if (regionId) where.regionId = regionId;

    const strategies = await this.prisma.recommendStrategy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { list: strategies };
  }

  async updateStrategy(data: any, operatorId: string) {
    const { id, ...updateData } = data;

    if (id) {
      await this.prisma.recommendStrategy.update({
        where: { id },
        data: { ...updateData, updatedAt: new Date() },
      });
    } else {
      await this.prisma.recommendStrategy.create({
        data: { ...updateData, createdBy: operatorId },
      });
    }

    return { success: true };
  }

  async debugRecommend(userId: string, query: any) {
    const { targetType = 'post', regionId } = query;

    // Get user behavior
    const [likes, favorites, follows, browseHistory] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { targetId: true, targetType: true },
      }),
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { targetId: true, targetType: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      this.prisma.browseHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { targetId: true, targetType: true },
      }),
    ]);

    // Get user tags
    const userTags = await this.prisma.userTag.findMany({
      where: { userId },
      select: { name: true },
    });

    return {
      userId,
      behavior: {
        likes: likes.length,
        favorites: favorites.length,
        follows: follows.length,
        browseHistory: browseHistory.length,
      },
      interests: userTags.map((t) => t.name),
      recentTargets: {
        likes: likes.slice(0, 10).map((l) => l.targetId),
        favorites: favorites.slice(0, 10).map((f) => f.targetId),
        browse: browseHistory.slice(0, 10).map((b) => b.targetId),
      },
    };
  }

  async rebuildPool(data: any, operatorId: string) {
    const { targetType = 'post', regionId } = data;

    // Clear existing pool
    const deleteWhere: any = { targetType };
    if (regionId) deleteWhere.regionId = regionId;
    await this.prisma.recommendPool.deleteMany({ where: deleteWhere });

    // Get strategy
    const strategy = await this.getStrategyForTarget(targetType, regionId);
    const weights = (strategy as any).weights || { heat: 0.3, time: 0.25 };

    // Build new pool based on target type
    let items: any[] = [];

    if (targetType === 'post') {
      const where: any = { status: 'PUBLISHED' };
      if (regionId) where.regionId = regionId;

      const posts = await this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      items = posts.map((p) => {
        const heatScore = this.calculateHeatScore(p, weights);
        const timeDecayed = this.applyTimeDecay(
          heatScore,
          p.createdAt,
          (strategy as any).rankRules?.timeDecay || 72,
        );
        return {
          targetType: 'post',
          targetId: p.id,
          regionId: p.regionId,
          score: timeDecayed,
          factors: { heat: heatScore, createdAt: p.createdAt },
        };
      });
    }

    // Sort by score and insert
    items.sort((a, b) => b.score - a.score);

    if (items.length > 0) {
      // Set expiration (7 days from now)
      const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      items = items.map((i) => ({ ...i, expireAt }));

      await this.prisma.recommendPool.createMany({
        data: items.slice(0, 10000), // Limit pool size
      });
    }

    return { success: true, count: items.length };
  }

  async getPool(query: any) {
    const { targetType, regionId, page = 1, pageSize = 50 } = query;

    const where: any = {};
    if (targetType) where.targetType = targetType;
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.recommendPool.findMany({
        where,
        orderBy: { score: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.recommendPool.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async controlRecommend(data: any, operatorId: string) {
    const { targetType, targetId, action, reason, value, expireAt } = data;

    await this.prisma.recommendControl.upsert({
      where: {
        targetType_targetId_action: { targetType, targetId, action },
      },
      update: {
        reason,
        value: value || 0,
        expireAt: expireAt ? new Date(expireAt) : null,
        createdBy: operatorId,
      },
      create: {
        targetType,
        targetId,
        action,
        reason,
        value: value || 0,
        expireAt: expireAt ? new Date(expireAt) : null,
        createdBy: operatorId,
      },
    });

    return { success: true };
  }
}
