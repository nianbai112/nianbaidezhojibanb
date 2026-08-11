import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveIdentity(userId?: string) {
    if (!userId) return { userId: null, regionId: null };
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { regionId: true },
    });
    return { userId, regionId: profile?.regionId || null };
  }

  private normalizeEvent(data: any, identity: { userId: string | null; regionId: string | null }, ip: string, ua: string) {
    const eventName = String(data?.eventName || '').trim().slice(0, 64);
    if (!eventName) return null;

    const rawParams = data?.params && typeof data.params === 'object' && !Array.isArray(data.params)
      ? data.params
      : {};
    const params = { ...rawParams };
    if (eventName === 'search') {
      const keyword = String(params.keyword || '').trim().slice(0, 100);
      // 搜索词榜只接受可追溯的登录用户，匿名请求不进入运营统计。
      if (!identity.userId || !keyword) return null;
      params.keyword = keyword;
    }

    return {
      eventName,
      userId: identity.userId,
      sessionId: String(data?.sessionId || '').trim().slice(0, 128) || null,
      regionId: identity.regionId,
      pagePath: String(data?.pagePath || '').trim().slice(0, 255) || null,
      targetId: String(data?.targetId || '').trim().slice(0, 128) || null,
      targetType: String(data?.targetType || '').trim().slice(0, 64) || null,
      params,
      ip,
      ua: String(ua || '').slice(0, 512),
    };
  }

  async trackEvent(data: any, userId?: string) {
    const identity = await this.resolveIdentity(userId);
    const event = this.normalizeEvent(data, identity, data?.ip || '', data?.ua || '');
    if (!event) return { success: true, dropped: true };
    await this.prisma.trackingEvent.create({
      data: event,
    });
    return { success: true };
  }

  async trackBatch(events: any[], ip: string, ua: string, userId?: string) {
    if (!events?.length) return { success: true, count: 0 };

    const identity = await this.resolveIdentity(userId);
    const data = events.slice(0, 50)
      .map((event) => this.normalizeEvent(event, identity, ip, ua))
      .filter(Boolean) as any[];
    if (!data.length) return { success: true, count: 0, dropped: true };

    await this.prisma.trackingEvent.createMany({ data });
    return { success: true, count: data.length };
  }

  async getEvents(query: any) {
    const {
      page = 1,
      pageSize = 50,
      eventName,
      userId,
      regionId,
      pagePath,
      startDate,
      endDate,
    } = query;

    const where: any = {};
    if (eventName) where.eventName = eventName;
    if (userId) where.userId = userId;
    if (regionId) where.regionId = regionId;
    if (pagePath) where.pagePath = pagePath;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [list, total] = await Promise.all([
      this.prisma.trackingEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.trackingEvent.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getFunnel(query: any) {
    const { steps, regionId, startDate, endDate } = query;
    const eventNames = steps ? steps.split(',') : ['page_view', 'content_click', 'order_create', 'order_pay'];

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const results = await Promise.all(
      eventNames.map(async (eventName: string) => {
        const where: any = { eventName };
        if (regionId) where.regionId = regionId;
        if (startDate || endDate) where.createdAt = dateFilter;

        const count = await this.prisma.trackingEvent.count({ where });
        const uniqueUsers = await this.prisma.trackingEvent.findMany({
          where,
          select: { userId: true },
          distinct: ['userId'],
        });

        return {
          eventName,
          count,
          uniqueUsers: uniqueUsers.length,
        };
      }),
    );

    return { funnel: results };
  }

  async getPathAnalysis(query: any) {
    const { userId, sessionId, regionId, startDate, endDate } = query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (sessionId) where.sessionId = sessionId;
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const events = await this.prisma.trackingEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: {
        userId: true,
        sessionId: true,
        pagePath: true,
        eventName: true,
        createdAt: true,
      },
    });

    // Group by session and create paths
    const sessions = new Map<string, any[]>();
    events.forEach((e: any) => {
      const key = e.sessionId || e.userId || 'unknown';
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key)!.push(e);
    });

    const paths = Array.from(sessions.values()).map((events) => ({
      steps: events.map((e) => ({
        page: e.pagePath,
        event: e.eventName,
        time: e.createdAt,
      })),
    }));

    return { paths: paths.slice(0, 100) };
  }

  async getPageHeatmap(query: any) {
    const { pagePath, regionId, startDate, endDate } = query;

    const where: any = { eventName: 'button_click' };
    if (pagePath) where.pagePath = pagePath;
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const clicks = await this.prisma.trackingEvent.findMany({
      where,
      select: {
        targetId: true,
        targetType: true,
        params: true,
      },
      take: 10000,
    });

    // Aggregate click counts by target
    const heatmap = new Map<string, number>();
    clicks.forEach((c) => {
      const key = c.targetId || (c.params as any)?.elementId || 'unknown';
      heatmap.set(key, (heatmap.get(key) || 0) + 1);
    });

    return {
      elements: Array.from(heatmap.entries())
        .map(([elementId, count]) => ({ elementId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
    };
  }

  async getSearchKeywords(query: any) {
    const { regionId, startDate, endDate, keyword, limit = 50 } = query;

    const where: any = { eventName: 'search' };
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const searches = await this.prisma.trackingEvent.findMany({
      where,
      select: { params: true, createdAt: true, regionId: true },
      take: 10000,
      orderBy: { createdAt: 'desc' },
    });

    const keywordFilter = String(keyword || '').trim();
    const keywords = new Map<string, { keyword: string; count: number; latestAt: Date | null; regionIds: Set<string>; types: Set<string> }>();
    searches.forEach((s) => {
      const itemKeyword = String((s.params as any)?.keyword || '').trim();
      if (!itemKeyword) return;
      if (keywordFilter && !itemKeyword.includes(keywordFilter)) return;
      const existed = keywords.get(itemKeyword) || { keyword: itemKeyword, count: 0, latestAt: null, regionIds: new Set<string>(), types: new Set<string>() };
      existed.count += 1;
      if (!existed.latestAt || s.createdAt > existed.latestAt) existed.latestAt = s.createdAt;
      if (s.regionId) existed.regionIds.add(s.regionId);
      const type = String((s.params as any)?.type || (s.params as any)?.searchType || '').trim();
      if (type) existed.types.add(type);
      keywords.set(itemKeyword, existed);
    });

    const allItems = Array.from(keywords.values())
      .map((item) => ({
        keyword: item.keyword,
        count: item.count,
        latestAt: item.latestAt?.toISOString?.() || null,
        regionCount: item.regionIds.size,
        types: Array.from(item.types),
      }))
      .sort((a, b) => b.count - a.count);
    const list = allItems.slice(0, Number(limit));

    return {
      keywords: list,
      totalKeywords: keywords.size,
      totalSearches: allItems.reduce((sum, item) => sum + item.count, 0),
    };
  }
}
