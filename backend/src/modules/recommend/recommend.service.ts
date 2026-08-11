import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class RecommendService {
  private readonly recommendCacheTtl = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private toInt(value: any, fallback: number, min = 1, max = 500) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  private toNumber(value: any) {
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeTargetType(value: any) {
    const targetType = String(value || 'post');
    const map: Record<string, string> = {
      posts: 'post',
      note: 'post',
      notes: 'post',
      merchant: 'merchant',
      merchants: 'merchant',
      product: 'product',
      products: 'product',
      topic: 'topic',
      topics: 'topic',
      activity: 'activity',
      activities: 'activity',
      secondhand: 'secondhand',
      second_hand: 'secondhand',
    };
    return map[targetType] || targetType;
  }

  private stablePayload(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stablePayload(item)).join(',')}]`;
    return Object.keys(value)
      .sort()
      .map((key) => `${key}:${this.stablePayload(value[key])}`)
      .join('|');
  }

  private cacheKey(scope: string, query: any, userId?: string) {
    const raw = this.stablePayload({ query: query || {}, userId: userId || '' });
    return `recommend:${scope}:${Buffer.from(raw).toString('base64url')}`;
  }

  private async getCached<T>(key: string): Promise<T | null> {
    return this.redis.getJson<T>(key).catch(() => null);
  }

  private async setCached(key: string, value: unknown, ttl = this.recommendCacheTtl) {
    await this.redis.setJson(key, value, ttl).catch(() => undefined);
  }

  private async clearRecommendCache() {
    await this.redis.delPattern('recommend:*').catch(() => undefined);
  }

  private targetTypeLabel(type: string) {
    const map: Record<string, string> = {
      post: '笔记/帖子',
      merchant: '商家',
      product: '商品',
      topic: '话题',
      activity: '活动',
      secondhand: '二手',
    };
    return map[type] || type;
  }

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
    await this.clearRecommendCache();
    return list;
  }

  async getSlots() {
    const list = await this.readSlots();
    return { list, total: list.length };
  }

  async getDashboard(query: any) {
    const regionId = query.regionId || undefined;
    const poolWhere: any = {};
    if (regionId) poolWhere.regionId = regionId;
    const activePoolWhere = {
      ...poolWhere,
      OR: [{ expireAt: null }, { expireAt: { gt: new Date() } }],
    };
    const expiredPoolWhere = {
      ...poolWhere,
      expireAt: { lte: new Date() },
    };

    const [
      strategiesTotal,
      strategiesEnabled,
      poolTotal,
      activePoolTotal,
      expiredPoolTotal,
      manualControls,
      runningTests,
      allTests,
      slots,
      recentPool,
      typeRows,
    ] = await Promise.all([
      this.prisma.recommendStrategy.count({ where: regionId ? { regionId } : {} }),
      this.prisma.recommendStrategy.count({ where: { isEnabled: true, ...(regionId ? { regionId } : {}) } }),
      this.prisma.recommendPool.count({ where: poolWhere }),
      this.prisma.recommendPool.count({ where: activePoolWhere }),
      this.prisma.recommendPool.count({ where: expiredPoolWhere }),
      this.prisma.recommendControl.count(),
      this.prisma.aBTest.count({ where: { status: 'running', ...(regionId ? { regionId } : {}) } }),
      this.prisma.aBTest.count({ where: regionId ? { regionId } : {} }),
      this.readSlots(),
      this.prisma.recommendPool.findMany({
        where: poolWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.recommendPool.groupBy({
        by: ['targetType'],
        where: poolWhere,
        _count: { _all: true },
        _avg: { score: true },
        _max: { score: true },
      }),
    ]);

    const targetCounts = await this.getRecommendTargetCounts(regionId);
    const enrichedRecent = await this.enrichPoolItems(recentPool);
    const byType = typeRows.map((row) => ({
      targetType: row.targetType,
      label: this.targetTypeLabel(row.targetType),
      count: row._count._all,
      avgScore: Number((row._avg.score || 0).toFixed(2)),
      maxScore: Number((row._max.score || 0).toFixed(2)),
    }));

    return {
      summary: {
        strategiesTotal,
        strategiesEnabled,
        poolTotal,
        activePoolTotal,
        expiredPoolTotal,
        manualControls,
        runningTests,
        allTests,
        slotsTotal: slots.length,
      },
      byType,
      targetCounts,
      recentPool: enrichedRecent,
      health: {
        hasStrategy: strategiesEnabled > 0,
        hasActivePool: activePoolTotal > 0,
        hasSlots: slots.length > 0,
        hasRunningExperiment: runningTests > 0,
      },
    };
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
    const cacheKey = this.cacheKey('feed', query, userId);
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

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

    const result = {
      list: filtered,
      total: filtered.length,
      page: Number(page),
      pageSize: Number(pageSize),
    };
    await this.setCached(cacheKey, result);
    return result;
  }

  async getRecommendPosts(query: any, userId?: string) {
    return this.getFeed(query, userId);
  }

  async getRecommendMerchants(query: any, userId?: string) {
    const cacheKey = this.cacheKey('merchants', query, userId);
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

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

    const result = { list, total, page: Number(page), pageSize: Number(pageSize) };
    await this.setCached(cacheKey, result);
    return result;
  }

  async getRecommendProducts(query: any, userId?: string) {
    const cacheKey = this.cacheKey('products', query, userId);
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

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

    const result = { list, total, page: Number(page), pageSize: Number(pageSize) };
    await this.setCached(cacheKey, result);
    return result;
  }

  async getRecommendTopics(query: any, userId?: string) {
    return this.getTopics(query);
  }

  async getTopics(query: any) {
    const cacheKey = this.cacheKey('topics', query);
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

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
    const result = { data, list: data, total, page: pageNum, pageSize: take };
    await this.setCached(cacheKey, result);
    return result;
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

  async updateTopic(id: string, dto: any, userId?: string) {
    const existing = await this.prisma.topic.findUnique({
      where: { id },
      include: { circles: { select: { circleId: true } } },
    });
    if (!existing) throw new NotFoundException('话题不存在');
    const circleIds = (existing.circles || []).map((item) => item.circleId).filter(Boolean);
    const manager = userId && circleIds.length
      ? await this.prisma.circleMember.findFirst({
          where: {
            userId,
            circleId: { in: circleIds },
            role: { in: ['OWNER', 'ADMIN'] },
            status: { in: ['active', 'muted'] },
          },
          select: { id: true },
        })
      : null;
    if (!manager) throw new ForbiddenException('只有圈主或管理员可以修改话题');
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
    await this.clearRecommendCache();
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

    await this.clearRecommendCache();
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
    const targetType = this.normalizeTargetType(data.targetType);
    const { regionId } = data;

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
    } else if (targetType === 'merchant') {
      const where: any = { status: 'approved' };
      if (regionId) where.regionId = regionId;

      const merchants = await this.prisma.merchant.findMany({
        where,
        orderBy: [{ saleCount: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
        take: 3000,
      });

      items = merchants.map((merchant) => {
        const heatScore = this.toNumber(merchant.saleCount) * 2 + this.toNumber(merchant.rating) * 10;
        const score = this.applyTimeDecay(heatScore, merchant.createdAt, (strategy as any).rankRules?.timeDecay || 168);
        return {
          targetType: 'merchant',
          targetId: merchant.id,
          regionId: merchant.regionId,
          score,
          factors: { saleCount: merchant.saleCount, rating: merchant.rating, createdAt: merchant.createdAt },
        };
      });
    } else if (targetType === 'product') {
      const where: any = { status: 'on_sale' };
      if (regionId) where.merchant = { regionId };

      const products = await this.prisma.product.findMany({
        where,
        include: { merchant: { select: { regionId: true } } },
        orderBy: [{ isHot: 'desc' }, { saleCount: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 5000,
      });

      items = products.map((product) => {
        const heatScore = this.toNumber(product.saleCount) * 2 + (product.isHot ? 50 : 0) + Math.max(0, this.toNumber(product.stock)) * 0.02;
        const score = this.applyTimeDecay(heatScore, product.createdAt, (strategy as any).rankRules?.timeDecay || 168);
        return {
          targetType: 'product',
          targetId: product.id,
          regionId: product.merchant?.regionId || null,
          score,
          factors: { saleCount: product.saleCount, isHot: product.isHot, stock: product.stock, createdAt: product.createdAt },
        };
      });
    } else if (targetType === 'topic') {
      const topics = await this.prisma.topic.findMany({
        where: { status: 'active' },
        orderBy: [{ isHot: 'desc' }, { postCount: 'desc' }, { followCount: 'desc' }, { createdAt: 'desc' }],
        take: 3000,
      });

      items = topics.map((topic) => {
        const heatScore = this.toNumber(topic.postCount) * 2 + this.toNumber(topic.followCount) + (topic.isHot ? 80 : 0);
        const score = this.applyTimeDecay(heatScore, topic.createdAt, (strategy as any).rankRules?.timeDecay || 720);
        return {
          targetType: 'topic',
          targetId: topic.id,
          regionId: regionId || null,
          score,
          factors: { postCount: topic.postCount, followCount: topic.followCount, isHot: topic.isHot, createdAt: topic.createdAt },
        };
      });
    } else if (targetType === 'activity') {
      const where: any = { status: { in: ['upcoming', 'signup', 'ongoing'] } };
      if (regionId) where.regionId = regionId;

      const activities = await this.prisma.activity.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { joinCount: 'desc' }, { startAt: 'asc' }],
        take: 3000,
      });

      items = activities.map((activity) => {
        const startDistanceHours = activity.startAt ? Math.abs(activity.startAt.getTime() - Date.now()) / (1000 * 60 * 60) : 999;
        const upcomingBoost = Math.max(0, 120 - startDistanceHours);
        const score = this.toNumber(activity.joinCount) * 3 + upcomingBoost + Math.max(0, 100 - this.toNumber(activity.sortOrder));
        return {
          targetType: 'activity',
          targetId: activity.id,
          regionId: activity.regionId,
          score,
          factors: { joinCount: activity.joinCount, startAt: activity.startAt, sortOrder: activity.sortOrder },
        };
      });
    } else if (targetType === 'secondhand') {
      const where: any = { status: 'ON_SALE' as any };
      if (regionId) where.regionId = regionId;

      const secondhands = await this.prisma.secondHand.findMany({
        where,
        orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
        take: 3000,
      });

      items = secondhands.map((item) => {
        const heatScore = this.toNumber(item.viewCount) + Math.max(0, 500 - this.toNumber(item.price)) * 0.03;
        const score = this.applyTimeDecay(heatScore, item.createdAt, (strategy as any).rankRules?.timeDecay || 168);
        return {
          targetType: 'secondhand',
          targetId: item.id,
          regionId: item.regionId,
          score,
          factors: { viewCount: item.viewCount, price: item.price, createdAt: item.createdAt },
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

    await this.clearRecommendCache();
    return { success: true, count: items.length };
  }

  async getPool(query: any) {
    const { targetType, regionId } = query;
    const page = this.toInt(query.page, 1);
    const pageSize = this.toInt(query.pageSize, 50, 1, 200);

    const where: any = {};
    if (targetType) where.targetType = this.normalizeTargetType(targetType);
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

    return {
      list: await this.enrichPoolItems(list),
      total,
      page,
      pageSize,
    };
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

    await this.clearRecommendCache();
    return { success: true };
  }

  private async getRecommendTargetCounts(regionId?: string) {
    const [
      posts,
      merchants,
      products,
      topics,
      activities,
      secondhands,
    ] = await Promise.all([
      this.prisma.post.count({
        where: { status: 'PUBLISHED', deletedAt: null, ...(regionId ? { regionId } : {}) },
      }),
      this.prisma.merchant.count({
        where: { status: 'approved', ...(regionId ? { regionId } : {}) },
      }),
      this.prisma.product.count({
        where: { status: 'on_sale', ...(regionId ? { merchant: { regionId } } : {}) },
      }),
      this.prisma.topic.count({ where: { status: 'active' } }),
      this.prisma.activity.count({
        where: { status: { in: ['upcoming', 'signup', 'ongoing'] }, ...(regionId ? { regionId } : {}) },
      }),
      this.prisma.secondHand.count({
        where: { status: 'ON_SALE' as any, ...(regionId ? { regionId } : {}) },
      }),
    ]);

    return [
      { targetType: 'post', label: '笔记/帖子', count: posts },
      { targetType: 'merchant', label: '商家', count: merchants },
      { targetType: 'product', label: '商品', count: products },
      { targetType: 'topic', label: '话题', count: topics },
      { targetType: 'activity', label: '活动', count: activities },
      { targetType: 'secondhand', label: '二手', count: secondhands },
    ];
  }

  private async enrichPoolItems(list: any[]) {
    if (!list.length) return [];
    const idsByType = list.reduce((acc, item) => {
      const type = this.normalizeTargetType(item.targetType);
      if (!acc[type]) acc[type] = [];
      acc[type].push(item.targetId);
      return acc;
    }, {} as Record<string, string[]>);

    const [
      posts,
      merchants,
      products,
      topics,
      activities,
      secondhands,
      regions,
    ] = await Promise.all([
      idsByType.post?.length
        ? this.prisma.post.findMany({
          where: { id: { in: idsByType.post } },
          select: { id: true, title: true, content: true, viewCount: true, likeCount: true, commentCount: true, status: true },
        })
        : Promise.resolve([] as any[]),
      idsByType.merchant?.length
        ? this.prisma.merchant.findMany({
          where: { id: { in: idsByType.merchant } },
          select: { id: true, name: true, logo: true, rating: true, saleCount: true, status: true },
        })
        : Promise.resolve([] as any[]),
      idsByType.product?.length
        ? this.prisma.product.findMany({
          where: { id: { in: idsByType.product } },
          select: { id: true, name: true, images: true, price: true, saleCount: true, status: true, merchant: { select: { name: true } } },
        })
        : Promise.resolve([] as any[]),
      idsByType.topic?.length
        ? this.prisma.topic.findMany({
          where: { id: { in: idsByType.topic } },
          select: { id: true, name: true, cover: true, postCount: true, followCount: true, status: true },
        })
        : Promise.resolve([] as any[]),
      idsByType.activity?.length
        ? this.prisma.activity.findMany({
          where: { id: { in: idsByType.activity } },
          select: { id: true, title: true, cover: true, joinCount: true, status: true, startAt: true },
        })
        : Promise.resolve([] as any[]),
      idsByType.secondhand?.length
        ? this.prisma.secondHand.findMany({
          where: { id: { in: idsByType.secondhand } },
          select: { id: true, title: true, images: true, price: true, viewCount: true, status: true },
        })
        : Promise.resolve([] as any[]),
      this.prisma.region.findMany({
        where: { id: { in: Array.from(new Set(list.map((item) => item.regionId).filter(Boolean))) as string[] } },
        select: { id: true, name: true },
      }),
    ]) as [any[], any[], any[], any[], any[], any[], any[]];

    const map = new Map<string, any>();
    posts.forEach((item) => map.set(`post:${item.id}`, {
      name: item.title || String(item.content || '').slice(0, 32) || '未命名帖子',
      subtitle: `浏览 ${item.viewCount || 0} / 点赞 ${item.likeCount || 0} / 评论 ${item.commentCount || 0}`,
      status: item.status,
    }));
    merchants.forEach((item) => map.set(`merchant:${item.id}`, {
      name: item.name,
      image: item.logo,
      subtitle: `评分 ${item.rating || 0} / 销量 ${item.saleCount || 0}`,
      status: item.status,
    }));
    products.forEach((item) => {
      const images = Array.isArray(item.images) ? item.images : [];
      map.set(`product:${item.id}`, {
        name: item.name,
        image: images[0] || '',
        subtitle: `${item.merchant?.name || '未知商家'} / ￥${this.toNumber(item.price).toFixed(2)} / 销量 ${item.saleCount || 0}`,
        status: item.status,
      });
    });
    topics.forEach((item) => map.set(`topic:${item.id}`, {
      name: item.name,
      image: item.cover,
      subtitle: `帖子 ${item.postCount || 0} / 关注 ${item.followCount || 0}`,
      status: item.status,
    }));
    activities.forEach((item) => map.set(`activity:${item.id}`, {
      name: item.title,
      image: item.cover,
      subtitle: `报名 ${item.joinCount || 0} / ${item.startAt ? new Date(item.startAt).toLocaleDateString('zh-CN') : '-'}`,
      status: item.status,
    }));
    secondhands.forEach((item) => {
      const images = Array.isArray(item.images) ? item.images : [];
      map.set(`secondhand:${item.id}`, {
        name: item.title,
        image: images[0] || '',
        subtitle: `￥${this.toNumber(item.price).toFixed(2)} / 浏览 ${item.viewCount || 0}`,
        status: item.status,
      });
    });
    const regionMap = new Map(regions.map((item) => [item.id, item.name]));

    return list.map((item) => {
      const type = this.normalizeTargetType(item.targetType);
      return {
        ...item,
        targetType: type,
        targetTypeLabel: this.targetTypeLabel(type),
        regionName: item.regionId ? regionMap.get(item.regionId) || item.regionId : '全局',
        target: map.get(`${type}:${item.targetId}`) || {
          name: item.targetId,
          subtitle: '目标已删除或不可见',
          status: 'missing',
        },
      };
    });
  }
}
