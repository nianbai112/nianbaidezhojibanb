import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(data: any) {
    await this.prisma.trackingEvent.create({
      data: {
        eventName: data.eventName,
        userId: data.userId,
        sessionId: data.sessionId,
        regionId: data.regionId,
        pagePath: data.pagePath,
        targetId: data.targetId,
        targetType: data.targetType,
        params: data.params,
        ip: data.ip,
        ua: data.ua,
      },
    });
    return { success: true };
  }

  async trackBatch(events: any[], ip: string, ua: string) {
    if (!events?.length) return { success: true, count: 0 };

    const data = events.map((e) => ({
      eventName: e.eventName,
      userId: e.userId,
      sessionId: e.sessionId,
      regionId: e.regionId,
      pagePath: e.pagePath,
      targetId: e.targetId,
      targetType: e.targetType,
      params: e.params,
      ip,
      ua,
    }));

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
    const { regionId, startDate, endDate, limit = 50 } = query;

    const where: any = { eventName: 'search' };
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const searches = await this.prisma.trackingEvent.findMany({
      where,
      select: { params: true },
      take: 10000,
    });

    // Aggregate search keywords
    const keywords = new Map<string, number>();
    searches.forEach((s) => {
      const keyword = (s.params as any)?.keyword;
      if (keyword) {
        keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
      }
    });

    return {
      keywords: Array.from(keywords.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, Number(limit)),
    };
  }
}
