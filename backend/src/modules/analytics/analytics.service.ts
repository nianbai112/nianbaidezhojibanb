import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../common/services/prisma.service';
import { RiderLearningStore } from './rider-learning-store';
import { RiderAiAdvisoryService } from './rider-ai-advisory.service';

@Injectable()
export class AnalyticsService {
  private riderAiScheduleRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly riderLearningStore: RiderLearningStore,
    private readonly riderAiAdvisory: RiderAiAdvisoryService,
  ) {}

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseDate(value: any, endOfDay = false): Date | undefined {
    if (!value) return undefined;
    const raw = String(value);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const date = new Date(dateOnly ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private getDateRange(query: any) {
    const now = new Date();
    const startDate = this.parseDate(query.startDate) || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endDate = this.parseDate(query.endDate, true) || now;
    if (startDate > endDate) return { startDate: endDate, endDate: startDate };
    return { startDate, endDate };
  }

  private userRegionWhere(regionId?: string) {
    if (!regionId) return {};
    return {
      OR: [
        { profile: { is: { region: regionId } } },
        { addresses: { some: { regionId } } },
      ],
    };
  }

  private orderRegionWhere(regionId?: string) {
    return regionId ? { merchant: { regionId } } : {};
  }

  private createdRange(startDate: Date, endDate: Date) {
    return { gte: startDate, lte: endDate };
  }

  private sumValue(agg: any, field: string) {
    return this.toNumber(agg?._sum?.[field]);
  }

  private productStatusText(status: string) {
    const map: Record<string, string> = {
      PENDING: '待审核',
      ON_SALE: '在售',
      SOLD: '已售出',
      OFFLINE: '已下架',
      REJECTED: '未通过',
    };
    return map[status] || status || '未知';
  }

  private async paymentAmountByBizType(startDate: Date, endDate: Date, bizType: string, regionId?: string) {
    const where: any = {
      bizType,
      status: 'paid',
      createdAt: this.createdRange(startDate, endDate),
    };

    if (regionId) {
      if (bizType === 'order') {
        const ids = await this.prisma.order.findMany({ where: this.orderRegionWhere(regionId), select: { id: true } });
        where.bizId = { in: ids.map((item) => item.id) };
      } else if (bizType === 'errand_order') {
        const ids = await this.prisma.errandOrder.findMany({ where: { regionId }, select: { id: true } });
        where.bizId = { in: ids.map((item) => item.id) };
      } else if (bizType === 'mall_order') {
        const merchants = await this.prisma.mallMerchant.findMany({ where: { regionId }, select: { id: true } }).catch(() => []);
        const ids = merchants.length
          ? await this.prisma.mallOrder.findMany({ where: { merchantId: { in: merchants.map((item) => item.id) } }, select: { id: true } })
          : [];
        where.bizId = { in: ids.map((item) => item.id) };
      } else if (bizType === 'second_hand') {
        const products = await this.prisma.secondHand.findMany({ where: { regionId }, select: { id: true } });
        const orders = products.length
          ? await this.prisma.secondHandOrder.findMany({ where: { productId: { in: products.map((item) => item.id) } }, select: { id: true } })
          : [];
        where.bizId = { in: orders.map((item) => item.id) };
      }
    }

    const agg = await this.prisma.paymentOrder.aggregate({ where, _sum: { amount: true }, _count: true });
    return { count: agg._count, amount: this.sumValue(agg, 'amount') };
  }

  private async countAndAmount(model: string, amountField: string, where: any, completedWhere: any) {
    const [total, newCount, completed, amountAgg] = await Promise.all([
      (this.prisma as any)[model].count({ where }),
      (this.prisma as any)[model].count({ where }),
      (this.prisma as any)[model].count({ where: completedWhere }),
      (this.prisma as any)[model].aggregate({ where: completedWhere, _sum: { [amountField]: true } }),
    ]);
    return {
      total,
      new: newCount,
      completed,
      amount: this.sumValue(amountAgg, amountField),
    };
  }

  private commentRegionWhere(regionId?: string) {
    return regionId ? { post: { regionId } } : {};
  }

  private likeRegionWhere(regionId?: string) {
    return regionId ? { targetType: 'post', post: { regionId } } : {};
  }

  private async getDailyTrend(model: string, dateField: string, startDate: Date, endDate: Date, where: any = {}) {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const trend = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const count = await (this.prisma as any)[model].count({
        where: {
          ...where,
          [dateField]: { gte: dayStart, lt: dayEnd },
        },
      });

      trend.push({
        date: dayStart.toISOString().split('T')[0],
        count,
      });
    }

    return trend;
  }

  private async getDailyAmountTrend(model: string, dateField: string, amountField: string, startDate: Date, endDate: Date, where: any = {}) {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const trend = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const agg = await (this.prisma as any)[model].aggregate({
        where: {
          ...where,
          [dateField]: { gte: dayStart, lt: dayEnd },
        },
        _sum: { [amountField]: true },
        _count: true,
      });

      trend.push({
        date: dayStart.toISOString().split('T')[0],
        count: agg._count,
        amount: Number(agg._sum?.[amountField] || 0),
      });
    }

    return trend;
  }

  private calcGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  private percent(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 10000) / 100;
  }

  private normalizeStatus(value: any): string {
    return String(value || '').trim().toLowerCase();
  }

  private safeDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private minutesBetween(start: any, end: any): number | null {
    const startDate = this.safeDate(start);
    const endDate = this.safeDate(end);
    if (!startDate || !endDate || endDate < startDate) return null;
    return Math.round(((endDate.getTime() - startDate.getTime()) / 60000) * 100) / 100;
  }

  private parseRemark(value: any): any {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private finishTimeOf(order: any): Date | null {
    return this.safeDate(order.completeTime || order.receiveTime || order.deliverTime || order.cancelTime);
  }

  private expectedDeadlineOf(order: any, fallbackMinutes: number): Date | null {
    const remark = this.parseRemark(order.remark);
    const candidates = [
      order.expectedDeliveryTime,
      order.expected_delivery_time,
      order.appointmentTime,
      order.appointment_time,
      remark.delivery_time,
      remark.estimated_delivery_time,
      remark.expected_delivery_time,
      remark.appointment_time,
      remark.dispatch_estimated_latest_time,
      remark.estimated_delivery?.latest_at,
    ];
    const explicit = candidates.map((item) => this.safeDate(item)).find(Boolean) || null;
    if (explicit) return explicit;
    const createdAt = this.safeDate(order.createdAt);
    return createdAt ? new Date(createdAt.getTime() + fallbackMinutes * 60000) : null;
  }

  private computeFulfillmentMetrics(orders: any[] = [], riskEvents: any[] = [], options: { fallbackMinutes: number }) {
    const acceptedStatuses = new Set(['accepted', 'in_progress', 'arrived', 'shipped', 'delivered', 'received', 'completed']);
    const completedStatuses = new Set(['completed', 'received']);
    const cancelledStatuses = new Set(['cancelled', 'refunded']);
    const orderIds = new Set(orders.map((order) => order.id).filter(Boolean));
    const incidentOrderIds = new Set(
      riskEvents
        .filter((event) => orderIds.has(event.orderId))
        .filter((event) => !['info', 'notice'].includes(this.normalizeStatus(event.eventLevel)))
        .map((event) => event.orderId),
    );
    let acceptedOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let timeoutOrders = 0;
    let acceptMinutesTotal = 0;
    let acceptMinutesCount = 0;
    let deliveryMinutesTotal = 0;
    let deliveryMinutesCount = 0;

    orders.forEach((order) => {
      const status = this.normalizeStatus(order.status);
      const accepted = !!order.acceptTime || acceptedStatuses.has(status);
      const completed = completedStatuses.has(status);
      const cancelled = cancelledStatuses.has(status);
      if (accepted) acceptedOrders += 1;
      if (completed) completedOrders += 1;
      if (cancelled) cancelledOrders += 1;

      const deadline = this.expectedDeadlineOf(order, options.fallbackMinutes);
      const finishTime = this.finishTimeOf(order);
      if (deadline && finishTime && finishTime.getTime() > deadline.getTime()) {
        timeoutOrders += 1;
      }

      const acceptMinutes = this.minutesBetween(order.createdAt, order.acceptTime);
      if (acceptMinutes !== null) {
        acceptMinutesTotal += acceptMinutes;
        acceptMinutesCount += 1;
      }
      const deliveryMinutes = this.minutesBetween(order.acceptTime || order.createdAt, this.finishTimeOf(order));
      if (deliveryMinutes !== null) {
        deliveryMinutesTotal += deliveryMinutes;
        deliveryMinutesCount += 1;
      }
    });

    const totalOrders = orders.length;
    return {
      total_orders: totalOrders,
      accepted_orders: acceptedOrders,
      completed_orders: completedOrders,
      cancelled_orders: cancelledOrders,
      timeout_orders: timeoutOrders,
      incident_orders: incidentOrderIds.size,
      acceptance_rate: this.percent(acceptedOrders, totalOrders),
      completion_rate: this.percent(completedOrders, totalOrders),
      cancel_rate: this.percent(cancelledOrders, totalOrders),
      timeout_rate: this.percent(timeoutOrders, totalOrders),
      incident_rate: this.percent(incidentOrderIds.size, totalOrders),
      average_accept_minutes: acceptMinutesCount ? Math.round((acceptMinutesTotal / acceptMinutesCount) * 100) / 100 : 0,
      average_delivery_minutes: deliveryMinutesCount ? Math.round((deliveryMinutesTotal / deliveryMinutesCount) * 100) / 100 : 0,
    };
  }

  private combineFulfillmentMetrics(parts: any[]) {
    const total = parts.reduce((sum, item) => sum + this.toNumber(item.total_orders), 0);
    const accepted = parts.reduce((sum, item) => sum + this.toNumber(item.accepted_orders), 0);
    const completed = parts.reduce((sum, item) => sum + this.toNumber(item.completed_orders), 0);
    const cancelled = parts.reduce((sum, item) => sum + this.toNumber(item.cancelled_orders), 0);
    const timeout = parts.reduce((sum, item) => sum + this.toNumber(item.timeout_orders), 0);
    const incident = parts.reduce((sum, item) => sum + this.toNumber(item.incident_orders), 0);
    return {
      total_orders: total,
      accepted_orders: accepted,
      completed_orders: completed,
      cancelled_orders: cancelled,
      timeout_orders: timeout,
      incident_orders: incident,
      acceptance_rate: this.percent(accepted, total),
      completion_rate: this.percent(completed, total),
      cancel_rate: this.percent(cancelled, total),
      timeout_rate: this.percent(timeout, total),
      incident_rate: this.percent(incident, total),
    };
  }

  private buildFulfillmentAttentionItems(metrics: any) {
    const items: string[] = [];
    if (metrics.acceptance_rate && metrics.acceptance_rate < 80) {
      items.push(`接单成功率 ${metrics.acceptance_rate}%，建议检查价格、推送范围和骑手在线供给`);
    }
    if (metrics.timeout_rate > 10) {
      items.push(`超时率 ${metrics.timeout_rate}%，建议校准 ETA、预约时间和高峰期缓冲`);
    }
    if (metrics.cancel_rate > 10) {
      items.push(`取消率 ${metrics.cancel_rate}%，建议排查未支付、无人接单和任务描述不清`);
    }
    if (metrics.incident_rate > 1) {
      items.push(`风险事故率 ${metrics.incident_rate}%，建议收紧高风险任务证据和叠单规则`);
    }
    return items;
  }

  private async getRiderFulfillmentMetrics(regionId: string | undefined, startDate: Date, endDate: Date) {
    const errandWhere: any = {
      ...(regionId ? { regionId } : {}),
      createdAt: this.createdRange(startDate, endDate),
      status: { not: 'pending_pay' },
      refundStatus: { notIn: ['refunding', 'refunded'] },
    };
    const takeawayWhere: any = {
      ...(regionId ? { merchant: { regionId } } : {}),
      deliveryMode: { in: ['platform_rider', 'rider_delivery'] as any },
      createdAt: this.createdRange(startDate, endDate),
      status: { not: 'PENDING_PAY' } as any,
      refundStatus: { notIn: ['refunding', 'refunded'] },
    };

    const [errandOrders, takeawayOrders] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: errandWhere,
        select: {
          id: true,
          status: true,
          createdAt: true,
          acceptTime: true,
          deliverTime: true,
          completeTime: true,
          cancelTime: true,
          remark: true,
        },
      }),
      this.prisma.order.findMany({
        where: takeawayWhere,
        select: {
          id: true,
          status: true,
          createdAt: true,
          acceptTime: true,
          deliverTime: true,
          receiveTime: true,
          completeTime: true,
          cancelTime: true,
          remark: true,
        },
      }).catch(() => []),
    ]);
    const orderIds = [...errandOrders, ...takeawayOrders].map((order: any) => order.id).filter(Boolean);
    const riskEvents = orderIds.length && (this.prisma as any).deliveryRiskEvent?.findMany
      ? await (this.prisma as any).deliveryRiskEvent.findMany({
        where: {
          orderId: { in: orderIds },
          createdAt: this.createdRange(startDate, endDate),
        },
        select: {
          id: true,
          orderId: true,
          orderType: true,
          eventLevel: true,
        },
      }).catch(() => [])
      : [];
    const errandMetrics = this.computeFulfillmentMetrics(errandOrders, riskEvents, { fallbackMinutes: 90 });
    const takeawayMetrics = this.computeFulfillmentMetrics(takeawayOrders, riskEvents, { fallbackMinutes: 60 });
    const overall = this.combineFulfillmentMetrics([errandMetrics, takeawayMetrics]);
    return {
      errand: errandMetrics,
      takeaway: takeawayMetrics,
      overall,
      attention_items: this.buildFulfillmentAttentionItems(overall),
    };
  }

  async getOverview(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const prevEnd = startDate;
    const userWhere = this.userRegionWhere(regionId);
    const postWhere = regionId ? { regionId } : {};
    const orderWhere = this.orderRegionWhere(regionId);
    const merchantWhere = regionId ? { regionId } : {};

    const [
      totalUsers, newUsers, prevNewUsers,
      totalPosts, newPosts, prevNewPosts,
      totalOrders, newOrders, prevNewOrders,
      totalMerchants, activeMerchants, newMerchants,
      todayOrders, yesterdayOrders,
      todayGmv, yesterdayGmv,
      totalGmv,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.user.count({ where: { ...userWhere, createdAt: { gte: prevStart, lte: prevEnd } } as any }),
      this.prisma.post.count({ where: postWhere }),
      this.prisma.post.count({ where: { ...postWhere, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.post.count({ where: { ...postWhere, createdAt: { gte: prevStart, lte: prevEnd } } }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.count({ where: { ...orderWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.order.count({ where: { ...orderWhere, createdAt: { gte: prevStart, lte: prevEnd } } as any }),
      this.prisma.merchant.count({ where: merchantWhere }),
      this.prisma.merchant.count({ where: { ...merchantWhere, status: 'approved' } }),
      this.prisma.merchant.count({ where: { ...merchantWhere, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.order.count({ where: { ...orderWhere, createdAt: { gte: today } } as any }),
      this.prisma.order.count({ where: { ...orderWhere, createdAt: { gte: yesterday, lt: today } } as any }),
      this.prisma.order.aggregate({ where: { ...orderWhere, status: 'COMPLETED', createdAt: { gte: today } } as any, _sum: { payAmount: true } }),
      this.prisma.order.aggregate({ where: { ...orderWhere, status: 'COMPLETED', createdAt: { gte: yesterday, lt: today } } as any, _sum: { payAmount: true } }),
      this.prisma.order.aggregate({ where: { ...orderWhere, status: 'COMPLETED' } as any, _sum: { payAmount: true } }),
    ]);

    return {
      success: true,
      data: {
        users: { total: totalUsers, new: newUsers, trend: this.calcGrowth(newUsers, prevNewUsers) },
        content: { totalPosts, newPosts, trend: this.calcGrowth(newPosts, prevNewPosts) },
        orders: { total: totalOrders, new: newOrders, today: todayOrders, yesterday: yesterdayOrders, trend: this.calcGrowth(newOrders, prevNewOrders) },
        merchants: { total: totalMerchants, active: activeMerchants, new: newMerchants },
        gmv: {
          today: this.toNumber(todayGmv._sum.payAmount),
          yesterday: this.toNumber(yesterdayGmv._sum.payAmount),
          total: this.toNumber(totalGmv._sum.payAmount),
        },
      },
    };
  }

  async getUserAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;

    const where: any = this.userRegionWhere(regionId);

    const [totalUsers, newUsers, activeUsers, certifiedUsers, pendingCerts, rejectedCerts, botUsers] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.user.count({ where: { ...where, lastLoginAt: { gte: startDate } } }),
      this.prisma.user.count({ where: { ...where, studentVerify: { status: 'APPROVED' } } }),
      this.prisma.studentVerify.count({ where: { status: 'PENDING', ...(regionId ? { user: where } : {}) } as any }),
      this.prisma.studentVerify.count({ where: { status: 'REJECTED', ...(regionId ? { user: where } : {}) } as any }),
      this.prisma.user.count({ where: { ...where, userType: 4 } }),
    ]);

    const trend = await this.getDailyTrend('user', 'createdAt', startDate, endDate, where);

    return {
      success: true,
      data: {
        total: totalUsers,
        new: newUsers,
        active: activeUsers,
        certified: certifiedUsers,
        pendingCerts,
        rejectedCerts,
        botUsers,
        realUsers: Math.max(0, totalUsers - botUsers),
        certRate: totalUsers > 0 ? Math.round(certifiedUsers / totalUsers * 10000) / 100 : 0,
        trend,
      },
    };
  }

  async getContentAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;

    const where: any = {};
    if (regionId) where.regionId = regionId;

    const commentWhere = this.commentRegionWhere(regionId);
    const likeWhere = this.likeRegionWhere(regionId);
    const reportWhere = regionId ? { post: { regionId } } : {};

    const [totalPosts, newPosts, totalComments, newComments, totalLikes, newLikes, pendingReports, totalReports] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.count({ where: { ...where, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.comment.count({ where: commentWhere as any }),
      this.prisma.comment.count({ where: { ...commentWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.like.count({ where: likeWhere as any }),
      this.prisma.like.count({ where: { ...likeWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.report.count({ where: { ...reportWhere, status: 'pending' } as any }),
      this.prisma.report.count({ where: { ...reportWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
    ]);

    const postTrend = await this.getDailyTrend('post', 'createdAt', startDate, endDate, where);
    const commentTrend = await this.getDailyTrend('comment', 'createdAt', startDate, endDate, commentWhere);
    const likeTrend = await this.getDailyTrend('like', 'createdAt', startDate, endDate, likeWhere);

    return {
      success: true,
      data: {
        posts: { total: totalPosts, new: newPosts },
        comments: { total: totalComments, new: newComments },
        likes: { total: totalLikes, new: newLikes },
        reports: { pending: pendingReports, total: totalReports },
        postTrend,
        commentTrend,
        likeTrend,
      },
    };
  }

  async getOrderAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;

    const where: any = this.orderRegionWhere(regionId);

    const [totalOrders, newOrders, completedOrders, cancelledOrders, refundingOrders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.order.count({ where: { ...where, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED', createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.order.count({ where: { ...where, refundStatus: { in: ['refunding', 'refunded'] } } as any }),
    ]);

    const [gmv, refundAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...where, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } as any,
        _sum: { payAmount: true },
      }),
      this.prisma.refund.aggregate({
        where: { status: 'completed', createdAt: { gte: startDate, lte: endDate }, ...(regionId ? { order: where } : {}) } as any,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const gmvAmount = this.toNumber(gmv?._sum?.payAmount);
    const refundAmount = this.toNumber(refundAgg._sum?.amount);
    const refundRate = gmvAmount > 0 ? Math.round(refundAmount / gmvAmount * 10000) / 100 : 0;

    const orderTrend = await this.getDailyTrend('order', 'createdAt', startDate, endDate, where);
    const gmvTrend = await this.getDailyAmountTrend('order', 'createdAt', 'payAmount', startDate, endDate, { ...where, status: 'COMPLETED' });

    const orderCreatedWhere = { ...where, createdAt: { gte: startDate, lte: endDate } } as any;
    const errandWhere = { ...(regionId ? { regionId } : {}), createdAt: { gte: startDate, lte: endDate } } as any;
    const mallMerchantIds = regionId
      ? (await this.prisma.mallMerchant.findMany({ where: { regionId }, select: { id: true } }).catch(() => [])).map((item) => item.id)
      : [];
    const mallWhere = {
      ...(regionId ? { merchantId: { in: mallMerchantIds } } : {}),
      createdAt: { gte: startDate, lte: endDate },
    } as any;
    let secondHandWhere: any = { createdAt: { gte: startDate, lte: endDate } };
    if (regionId) {
      const products = await this.prisma.secondHand.findMany({ where: { regionId }, select: { id: true } });
      secondHandWhere.productId = { in: products.map((item) => item.id) };
    }

    const [takeawayPaid, errandPaid, mallPaid, secondHandPaid, errand, mall, secondHandCount, secondHandCompleted] = await Promise.all([
      this.paymentAmountByBizType(startDate, endDate, 'order', regionId),
      this.paymentAmountByBizType(startDate, endDate, 'errand_order', regionId),
      this.paymentAmountByBizType(startDate, endDate, 'mall_order', regionId),
      this.paymentAmountByBizType(startDate, endDate, 'second_hand', regionId),
      this.countAndAmount('errandOrder', 'payAmount', errandWhere, { ...errandWhere, status: 'completed' }),
      this.countAndAmount('mallOrder', 'payAmount', mallWhere, { ...mallWhere, status: 'completed' }),
      this.prisma.secondHandOrder.count({ where: secondHandWhere }),
      this.prisma.secondHandOrder.count({ where: { ...secondHandWhere, status: { in: ['paid', 'shipped', 'completed'] } } }),
    ]);

    const businessBreakdown = [
      { key: 'takeaway', name: '商家/外卖', orders: newOrders, completed: completedOrders, gmv: takeawayPaid.amount || gmvAmount, paidCount: takeawayPaid.count },
      { key: 'errand', name: '跑腿', orders: errand.new, completed: errand.completed, gmv: errandPaid.amount || errand.amount, paidCount: errandPaid.count },
      { key: 'mall', name: '商城', orders: mall.new, completed: mall.completed, gmv: mallPaid.amount || mall.amount, paidCount: mallPaid.count },
      { key: 'second_hand', name: '二手交易', orders: secondHandCount, completed: secondHandCompleted, gmv: secondHandPaid.amount, paidCount: secondHandPaid.count },
    ];

    return {
      success: true,
      data: {
        total: businessBreakdown.reduce((sum, item) => sum + item.orders, 0),
        new: businessBreakdown.reduce((sum, item) => sum + item.orders, 0),
        completed: businessBreakdown.reduce((sum, item) => sum + item.completed, 0),
        cancelled: cancelledOrders,
        refunding: refundingOrders,
        gmv: businessBreakdown.reduce((sum, item) => sum + item.gmv, 0),
        refundAmount,
        refundRate,
        refundCount: refundAgg._count,
        trend: orderTrend,
        gmvTrend,
        businessBreakdown,
      },
    };
  }

  async getSecondHandAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;
    const productWhere: any = regionId ? { regionId } : {};
    const productRangeWhere = { ...productWhere, createdAt: this.createdRange(startDate, endDate) };
    const productIds = regionId
      ? (await this.prisma.secondHand.findMany({ where: productWhere, select: { id: true } })).map((item) => item.id)
      : undefined;
    const orderWhere: any = { createdAt: this.createdRange(startDate, endDate) };
    if (productIds) orderWhere.productId = { in: productIds };

    const [
      totalProducts, newProducts, onSaleProducts, soldProducts, pendingProducts, rejectedProducts,
      deliveryRows, statusRows, orderTotal, orderRows, paid,
    ] = await Promise.all([
      this.prisma.secondHand.count({ where: productWhere }),
      this.prisma.secondHand.count({ where: productRangeWhere }),
      this.prisma.secondHand.count({ where: { ...productWhere, status: 'ON_SALE' } }),
      this.prisma.secondHand.count({ where: { ...productWhere, status: 'SOLD' } }),
      this.prisma.secondHand.count({ where: { ...productWhere, status: 'PENDING' } }),
      this.prisma.secondHand.count({ where: { ...productWhere, status: 'REJECTED' } }),
      this.prisma.secondHand.groupBy({ by: ['deliveryType'], where: productWhere, _count: { _all: true } }),
      this.prisma.secondHand.groupBy({ by: ['status'], where: productWhere, _count: { _all: true } }),
      this.prisma.secondHandOrder.count({ where: orderWhere }),
      this.prisma.secondHandOrder.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
      this.paymentAmountByBizType(startDate, endDate, 'second_hand', regionId),
    ]);

    const trend = await this.getDailyTrend('secondHand', 'createdAt', startDate, endDate, productWhere);
    const deliveryTypes = deliveryRows.map((item) => ({
      name: item.deliveryType || '未设置',
      count: item._count._all,
    }));
    const status = statusRows.map((item) => ({
      name: this.productStatusText(item.status),
      status: item.status,
      count: item._count._all,
    }));
    const orderStatus = orderRows.map((item) => ({
      name: item.status,
      count: item._count._all,
    }));

    return {
      success: true,
      data: {
        products: {
          total: totalProducts,
          new: newProducts,
          onSale: onSaleProducts,
          sold: soldProducts,
          pending: pendingProducts,
          rejected: rejectedProducts,
        },
        orders: {
          total: orderTotal,
          paidCount: paid.count,
          paidAmount: paid.amount,
        },
        deliveryTypes,
        status,
        orderStatus,
        trend,
      },
    };
  }

  async getFinanceAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);

    const [totalIncome, totalRefund, totalWithdraw, totalRecharge] = await Promise.all([
      this.prisma.paymentOrder.aggregate({
        where: { status: 'paid', createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.refund.aggregate({
        where: { status: 'completed', createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.withdraw.aggregate({
        where: { status: 'SUCCESS', createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.recharge.aggregate({
        where: { status: 'success', createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      success: true,
      data: {
        income: { total: Number(totalIncome._sum.amount || 0), count: totalIncome._count },
        refund: { total: Number(totalRefund._sum.amount || 0), count: totalRefund._count },
        withdraw: { total: Number(totalWithdraw._sum.amount || 0), count: totalWithdraw._count },
        recharge: { total: Number(totalRecharge._sum.amount || 0), count: totalRecharge._count },
        netIncome: Number(totalIncome._sum.amount || 0) - Number(totalRefund._sum.amount || 0) - Number(totalWithdraw._sum.amount || 0),
      },
    };
  }

  async getRegionAnalytics(query: any) {
    const regions = await this.prisma.region.findMany({
      where: { isOpen: true },
      select: { id: true, name: true },
    });

    const regionData = await Promise.all(
      regions.map(async (region) => {
        const [userCount, postCount, orderCount, merchantCount, gmvAgg] = await Promise.all([
          this.prisma.user.count({ where: { addresses: { some: { regionId: region.id } } } }),
          this.prisma.post.count({ where: { regionId: region.id } }),
          this.prisma.order.count({ where: { merchant: { regionId: region.id } } }),
          this.prisma.merchant.count({ where: { regionId: region.id } }),
          this.prisma.order.aggregate({
            where: { merchant: { regionId: region.id }, status: 'COMPLETED' },
            _sum: { payAmount: true },
          }),
        ]);

        return {
          id: region.id,
          name: region.name,
          users: userCount,
          posts: postCount,
          orders: orderCount,
          merchants: merchantCount,
          gmv: this.toNumber(gmvAgg._sum.payAmount),
        };
      }),
    );

    regionData.sort((a, b) => b.orders - a.orders);

    return {
      success: true,
      data: regionData,
    };
  }

  async getMerchantAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);

    const regionId = query.regionId;
    const merchantWhere = regionId ? { regionId } : {};

    const [totalMerchants, newMerchants, activeMerchants, pendingMerchants] = await Promise.all([
      this.prisma.merchant.count({ where: merchantWhere }),
      this.prisma.merchant.count({ where: { ...merchantWhere, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.merchant.count({ where: { ...merchantWhere, status: 'approved' } }),
      this.prisma.merchant.count({ where: { ...merchantWhere, status: 'pending' } }),
    ]);

    const merchants = await this.prisma.merchant.findMany({
      where: { ...merchantWhere, status: 'approved' },
      select: { id: true, name: true, logo: true },
      take: 20,
    });

    const topMerchants = await Promise.all(
      merchants.map(async (m) => {
        const [orderCount, gmvAgg] = await Promise.all([
          this.prisma.order.count({ where: { merchantId: m.id, createdAt: { gte: startDate, lte: endDate } } }),
          this.prisma.order.aggregate({
            where: { merchantId: m.id, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
            _sum: { payAmount: true },
          }),
        ]);
        return {
          id: m.id,
          name: m.name,
          orderCount,
          totalSales: this.toNumber(gmvAgg._sum.payAmount),
        };
      }),
    );

    topMerchants.sort((a, b) => b.totalSales - a.totalSales);

    return {
      success: true,
      data: {
        total: totalMerchants,
        new: newMerchants,
        active: activeMerchants,
        pending: pendingMerchants,
        topMerchants: topMerchants.slice(0, 10),
      },
    };
  }

  async getRiderAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);
    const regionId = query.regionId;
    const orderWhere = regionId ? { regionId } : {};

    const [totalRiders, onlineRiders, busyRiders] = await Promise.all([
      this.prisma.rider.count(),
      this.prisma.rider.count({ where: { status: 'ONLINE' } }),
      this.prisma.rider.count({ where: { status: 'BUSY' } }),
    ]);

    const [deliveryOrders, completedDeliveries, totalDeliveryGmv] = await Promise.all([
      this.prisma.deliveryOrder.count({ where: { ...orderWhere, createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.deliveryOrder.count({ where: { ...orderWhere, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } as any }),
      this.prisma.deliveryOrder.aggregate({
        where: { ...orderWhere, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } as any,
        _sum: { price: true, tip: true },
      }),
    ]);

    const completionRate = deliveryOrders > 0 ? Math.round(completedDeliveries / deliveryOrders * 10000) / 100 : 0;

    return {
      success: true,
      data: {
        total: totalRiders,
        online: onlineRiders,
        busy: busyRiders,
        deliveryOrders,
        completedDeliveries,
        completionRate,
        totalEarnings: this.toNumber(totalDeliveryGmv._sum?.price) + this.toNumber(totalDeliveryGmv._sum?.tip),
      },
    };
  }

  async getRiderAlgorithmAnalytics(query: any = {}) {
    const { startDate, endDate } = this.getDateRange(query);
    const snapshots = await this.riderLearningStore.listSnapshots(800);
    const summary = this.riderLearningStore.summarizeSnapshots(snapshots);
    const regionId = query.regionId;
    const regionWhere = regionId ? { regionId } : {};
    const [regionRiders, onlineRegionRiders, activeErrands, activeTakeawayOrders, fulfillmentMetrics] = await Promise.all([
      this.prisma.regionRider.count({ where: regionWhere }),
      this.prisma.regionRider.count({ where: { ...regionWhere, status: 'online' } }),
      this.prisma.errandOrder.count({ where: { ...regionWhere, status: { in: ['pending_accept', 'accepted', 'in_progress', 'arrived'] }, refundStatus: { notIn: ['refunding', 'refunded'] } } }),
      this.prisma.order.count({
        where: {
          ...(regionId ? { merchant: { regionId } } : {}),
          deliveryMode: { in: ['platform_rider', 'rider_delivery'] } as any,
          status: { in: ['PAID', 'SHIPPED'] } as any,
          refundStatus: { notIn: ['refunding', 'refunded'] },
        },
      }).catch(() => 0),
      this.getRiderFulfillmentMetrics(regionId, startDate, endDate),
    ]);
    const mergedAttentionItems = [
      ...(summary.attention_items || []),
      ...(fulfillmentMetrics.attention_items || []),
    ];
    return {
      success: true,
      data: {
        summary: {
          ...summary,
          fulfillment: fulfillmentMetrics.overall,
          attention_items: mergedAttentionItems,
        },
        fulfillment_metrics: fulfillmentMetrics,
        rider_supply: {
          total: regionRiders,
          online: onlineRegionRiders,
          online_rate: regionRiders > 0 ? Math.round((onlineRegionRiders / regionRiders) * 10000) / 100 : 0,
        },
        errand_algorithm: {
          active_orders: activeErrands,
          risk_counts: summary.by_level,
          top_risk_tags: summary.top_tags,
          fulfillment: fulfillmentMetrics.errand,
          attention_items: [
            ...(summary.attention_items || []),
            ...this.buildFulfillmentAttentionItems(fulfillmentMetrics.errand),
          ],
        },
        takeaway_algorithm: {
          active_orders: activeTakeawayOrders,
          fulfillment: fulfillmentMetrics.takeaway,
          attention_items: [
            ...this.buildFulfillmentAttentionItems(fulfillmentMetrics.takeaway),
            '外卖算法已接入骑手分析中心，建议继续沉淀商家出餐等待、骑手取餐等待和午高峰超时样本',
          ],
        },
        range: {
          snapshot_count: snapshots.length,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          generated_at: new Date().toISOString(),
        },
      },
    };
  }

  async getRiderAiConfig() {
    return this.riderAiAdvisory.getConfig();
  }

  async saveRiderAiConfig(dto: any) {
    return this.riderAiAdvisory.saveConfig(dto);
  }

  async runRiderAiAnalysis(dto: any = {}) {
    const analytics = await this.getRiderAlgorithmAnalytics(dto);
    return this.riderAiAdvisory.runAnalysis(analytics.data, dto.trigger_type || 'manual');
  }

  @Interval(60 * 1000)
  async runScheduledRiderAiAnalysisIfDue() {
    if (this.riderAiScheduleRunning) return;
    const state = await this.riderAiAdvisory.shouldRunScheduledAnalysis();
    if (!state.due) return;
    this.riderAiScheduleRunning = true;
    try {
      const analytics = await this.getRiderAlgorithmAnalytics({});
      await this.riderAiAdvisory.runAnalysis(analytics.data, 'scheduled');
    } catch (error) {
      console.error('[rider-ai-advisory] scheduled analysis failed', error);
    } finally {
      this.riderAiScheduleRunning = false;
    }
  }

  async getRiderAiSuggestions(query: any = {}) {
    return this.riderAiAdvisory.listSuggestions(query);
  }

  async updateRiderAiSuggestionStatus(id: string, dto: any = {}) {
    return this.riderAiAdvisory.updateSuggestionStatus(id, dto);
  }

  async getRiderAiRunLogs(query: any = {}) {
    return this.riderAiAdvisory.listRunLogs(query);
  }

  async getFunnelAnalytics(query: any) {
    const { startDate, endDate } = this.getDateRange(query);

    const [visitors, registrants, posters, commenters, orderers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.post.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.comment.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.order.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
    ]);

    return {
      success: true,
      data: {
        steps: [
          { name: '总用户', count: visitors },
          { name: '新增注册', count: registrants },
          { name: '发布内容', count: posters },
          { name: '参与互动', count: commenters },
          { name: '产生订单', count: orderers },
        ],
      },
    };
  }

  async getRetentionAnalytics(query: any) {
    const now = new Date();
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [newUsers7d, activeUsers7d, newUsers30d, activeUsers30d] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: day7Ago } } }),
      this.prisma.user.count({ where: { createdAt: { gte: day7Ago }, lastLoginAt: { gte: day7Ago } } }),
      this.prisma.user.count({ where: { createdAt: { gte: day30Ago } } }),
      this.prisma.user.count({ where: { createdAt: { gte: day30Ago }, lastLoginAt: { gte: day7Ago } } }),
    ]);

    return {
      success: true,
      data: {
        day7: {
          newUsers: newUsers7d,
          retained: activeUsers7d,
          rate: newUsers7d > 0 ? (activeUsers7d / newUsers7d * 100).toFixed(1) : '0',
        },
        day30: {
          newUsers: newUsers30d,
          retained: activeUsers30d,
          rate: newUsers30d > 0 ? (activeUsers30d / newUsers30d * 100).toFixed(1) : '0',
        },
      },
    };
  }
}
