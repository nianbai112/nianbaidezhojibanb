import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      success: true,
      data: {
        total: totalOrders,
        new: newOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
        refunding: refundingOrders,
        gmv: gmvAmount,
        refundAmount,
        refundRate,
        refundCount: refundAgg._count,
        trend: orderTrend,
        gmvTrend,
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
