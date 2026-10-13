import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

const DAY = 86400000, SHANGHAI_OFFSET = 8 * 3600000;
export function shopRankingPeriod(range: string, now: Date) {
  if (!['day', 'yesterday', 'week', 'month', 'year'].includes(range)) throw new BadRequestException('统计时段无效');
  const local = new Date(now.getTime() + SHANGHAI_OFFSET);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET;
  let start = today, end = now.getTime();
  if (range === 'yesterday') { start -= DAY; end = today; }
  if (range === 'week') start -= ((local.getUTCDay() + 6) % 7) * DAY;
  if (range === 'month') start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - SHANGHAI_OFFSET;
  if (range === 'year') start = Date.UTC(local.getUTCFullYear(), 0, 1) - SHANGHAI_OFFSET;
  return { start: new Date(start), end: new Date(end) };
}
const positive = (value: unknown, fallback: number, max: number) => {
  if (value == null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new BadRequestException('分页参数无效');
  return result;
};

@Injectable()
export class ShopRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any = {}, now = new Date()) {
    const regionId = String(query.region_id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(regionId)) throw new BadRequestException('请选择有效校区');
    const range = String(query.time_range || 'day'), sort = String(query.sort_by || 'orders');
    if (!['orders', 'ratings', 'sales'].includes(sort)) throw new BadRequestException('排序方式无效');
    const page = positive(query.page, 1, 10000), size = positive(query.page_size, 20, 50);
    let at = now;
    if (query.as_of) {
      at = new Date(String(query.as_of));
      if (!Number.isFinite(at.getTime()) || at > now || now.getTime() - at.getTime() > DAY) throw new BadRequestException('榜单时段已过期，请刷新');
    }
    const period = shopRankingPeriod(range, at);
    // One DB snapshot keeps merchant visibility, orders and reviews consistent within this response.
    // as_of freezes the time boundary across pages; later refunds/moderation remain authoritative.
    return this.prisma.$transaction(async tx => {
      const merchants = await tx.merchant.findMany({
        where: { regionId, OR: [{ businessType: 'takeaway', status: 'approved' }, { businessType: 'dorm_shop', status: { in: ['approved', 'closed'] } }] },
        select: { id: true, name: true, logo: true, businessType: true },
        orderBy: { id: 'asc' },
      });
      const ids = merchants.map(row => row.id);
      const valid: any = {
        merchantId: { in: ids }, status: { in: ['RECEIVED', 'COMPLETED'] }, refundStatus: 'none',
        OR: [{ refundAmount: null }, { refundAmount: 0 }],
        refunds: { none: { status: { in: ['pending', 'approved', 'completed'] } } },
      };
      const completion = { OR: [
        { completeTime: { gte: period.start, lt: period.end } },
        { completeTime: null, receiveTime: { gte: period.start, lt: period.end } },
      ] };
      const orderGroups = ids.length ? await tx.order.groupBy({
        by: ['merchantId'], where: { AND: [valid, completion] }, _count: { id: true }, _sum: { payAmount: true },
      }) : [];
      const orders = new Map(orderGroups.map(row => [row.merchantId, row]));
      const ratings = new Map<string, { count: number; sum: number; positive: number }>();
      // Legacy reviews can have merchantId=null. The immutable purchased order determines ownership.
      // Batch only rating + merchant ID, never materialize customer/phone/content data for this public API.
      let cursor = '';
      if (ids.length) for (;;) {
        const reviews = await tx.review.findMany({
          where: { status: 'active', rating: { gte: 1, lte: 5 }, createdAt: { gte: period.start, lt: period.end }, order: { is: { AND: [valid, { OR: [{ completeTime: { lt: period.end } }, { completeTime: null, receiveTime: { lt: period.end } }] }] } } },
          select: { id: true, rating: true, order: { select: { merchantId: true } } },
          orderBy: { id: 'asc' }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const review of reviews) {
          const id = review.order.merchantId, value = ratings.get(id) || { count: 0, sum: 0, positive: 0 };
          value.count++; value.sum += review.rating; if (review.rating >= 4) value.positive++;
          ratings.set(id, value);
        }
        if (reviews.length < 1000) break;
        cursor = reviews[reviews.length - 1].id;
      }
      const rows = merchants.map(merchant => {
        const order = orders.get(merchant.id), rating = ratings.get(merchant.id);
        const amount = order?._sum.payAmount || null, count = order?._count.id || 0;
        return {
          merchant_id: merchant.id, name: merchant.name, logo: merchant.logo, business_type: merchant.businessType,
          order_count: count, net_paid: amount ? amount.toFixed(2) : '0.00',
          average_order_paid: count && amount ? amount.div(count).toFixed(2) : null,
          rating: rating ? Math.round(rating.sum / rating.count * 100) / 100 : null,
          review_count: rating?.count || 0, positive_rate: rating ? Math.round(rating.positive / rating.count * 1000) / 10 : null,
          // Keep the exact ratio for ordering; rounded display scores must not alter ranks.
          rating_sort: rating ? rating.sum / rating.count : -1,
        };
      });
      rows.sort((a, b) => {
        const main = sort === 'ratings' ? b.rating_sort - a.rating_sort : sort === 'sales' ? Number(b.net_paid) - Number(a.net_paid) : b.order_count - a.order_count;
        return main || b.review_count - a.review_count || (a.merchant_id < b.merchant_id ? -1 : a.merchant_id > b.merchant_id ? 1 : 0);
      });
      return {
        region_id: regionId, time_range: range, sort_by: sort, timezone: 'Asia/Shanghai', as_of: at.toISOString(),
        period_start: period.start.toISOString(), period_end: period.end.toISOString(),
        sales_label: '未退款完结订单实收',
        order_basis: '按完成时间统计；缺少完成时间的历史订单不计入；排除任何退款中、已退款或有退款金额的订单。',
        review_basis: '时段内发表的公开评价，且对应订单已完成、未退款；4至5星计为好评；无评价不设默认分。',
        list: rows.slice((page - 1) * size, page * size).map(({ rating_sort: _, ...row }, index) => ({ ...row, rank: (page - 1) * size + index + 1 })),
        total: rows.length, page, page_size: size, has_more: page * size < rows.length,
      };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  }
}
