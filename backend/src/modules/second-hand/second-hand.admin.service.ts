import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { UserSessionRevocationService } from '../websocket/user-session-revocation.service';

@Injectable()
export class SecondHandAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userSessionRevocation: UserSessionRevocationService,
  ) {}

  private getSettingDefaults(regionId = '') {
    return {
      regionId,
      enableSecondHand: true,
      maxListings: null,
      requirePhone: false,
      requireAudit: false,
      enableOnlinePayment: false,
      enableAfterSale: false,
      enablePlatformGuarantee: false,
      enableAutoRecommend: false,
    };
  }

  private normalizeSetting(setting: any, regionId = '') {
    const defaults = this.getSettingDefaults(regionId);
    const source = setting || {};
    return {
      ...defaults,
      ...source,
      regionId: source.regionId || regionId,
      enableSecondHand: source.enableSecondHand ?? defaults.enableSecondHand,
      maxListings: source.maxListings ?? defaults.maxListings,
      requirePhone: source.requirePhone ?? defaults.requirePhone,
      requireAudit: source.requireAudit ?? defaults.requireAudit,
      enableOnlinePayment: source.enableOnlinePayment ?? defaults.enableOnlinePayment,
      enableAfterSale: source.enableAfterSale ?? defaults.enableAfterSale,
      enablePlatformGuarantee: source.enablePlatformGuarantee ?? defaults.enablePlatformGuarantee,
      enableAutoRecommend: source.enableAutoRecommend ?? defaults.enableAutoRecommend,
    };
  }

  private jsonArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object' && Array.isArray(value.list)) return value.list.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
        if (parsed && Array.isArray(parsed.list)) return parsed.list.filter(Boolean);
      } catch {
        return value ? [value] : [];
      }
    }
    return [];
  }

  private mapJsonObject(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { text: value };
      }
    }
    return null;
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

  private orderStatusText(status: string) {
    const map: Record<string, string> = {
      contacting: '沟通中',
      pending_pay: '待支付',
      paid: '已支付',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
      refunding: '退款中',
      refunded: '已退款',
    };
    return map[status] || status || '未知';
  }

  private requiresTradeLocation(deliveryType: any) {
    return ['校内交易', '买家自提'].includes(String(deliveryType || '').trim());
  }

  private orderTradeKind(product: any, status?: string) {
    const deliveryType = String(product?.deliveryType || '').trim();
    if (deliveryType === '包邮') {
      return status === 'contacting' ? '包邮意向' : '包邮订单';
    }
    if (deliveryType === '校内交易') return '校内交易意向';
    if (deliveryType === '买家自提') return '自提交易意向';
    return status === 'pending_pay' ? '订单' : '交易意向';
  }

  private normalizeReportStatus(status: any) {
    const value = String(status || 'resolved').trim().toLowerCase();
    if (['resolved', 'handled', 'done', 'pass'].includes(value)) return 'resolved';
    if (['rejected', 'reject', 'invalid'].includes(value)) return 'rejected';
    if (['processing', 'process'].includes(value)) return 'processing';
    if (['pending', 'wait'].includes(value)) return 'pending';
    throw new BadRequestException('不支持的举报状态');
  }

  private normalizeReportAction(action: any) {
    const value = String(action || 'record').trim().toLowerCase();
    if (['record', 'none', 'only_record', 'warn', '仅记录', '警告'].includes(value)) return 'record';
    if (['offline', 'hide', 'hide_content', '下架', '隐藏'].includes(value)) return 'offline';
    if (['reject', 'delete', 'remove', 'delete_content', '驳回', '删除'].includes(value)) return 'reject';
    if (['mute', 'mute_user', '禁言'].includes(value)) return 'mute_user';
    if (['ban', 'ban_user', '封禁'].includes(value)) return 'ban_user';
    throw new BadRequestException('不支持的举报处理动作');
  }

  private auditStatusFromProductStatus(status: string) {
    if (status === 'PENDING') return 'pending';
    if (status === 'REJECTED' || status === 'OFFLINE') return 'rejected';
    return 'approved';
  }

  private detectProductRisks(item: any, reportCount = 0) {
    const text = `${item?.title || ''} ${item?.description || ''}`;
    const images = this.jsonArray(item?.images);
    const risks: Array<{ type: string; label: string; level: string }> = [];
    if (!images.length) risks.push({ type: 'image', label: '无商品图片', level: 'warning' });
    if (/1[3-9]\d{9}|微信|vx|v信|QQ|二维码|扫码|加我/i.test(text)) {
      risks.push({ type: 'contact', label: '文案疑似含联系方式', level: 'danger' });
    }
    if (reportCount > 0) risks.push({ type: 'report', label: `${reportCount} 条举报`, level: 'danger' });
    if (!String(item?.description || '').trim()) risks.push({ type: 'description', label: '缺少商品描述', level: 'warning' });
    if (Number(item?.price || 0) <= 0) risks.push({ type: 'price', label: '价格异常', level: 'warning' });
    return risks;
  }

  private mapProduct(item: any, extras: any = {}) {
    const images = this.jsonArray(item?.images);
    const tags = this.jsonArray(item?.tags);
    const reportCount = Number(extras.reportCount || item?.reportCount || 0);
    return {
      ...item,
      images,
      cover: images[0] || '',
      tags,
      location: this.mapJsonObject(item?.location),
      price: Number(item?.price || 0),
      originPrice: item?.originPrice === null || item?.originPrice === undefined ? null : Number(item.originPrice),
      freight: Number(item?.freight || 0),
      wantCount: item?.wantCount || 0,
      sellerName: item?.user?.nickname || '匿名用户',
      sellerUid: item?.user?.uid || null,
      regionName: item?.region?.name || '-',
      orderCount: Number(extras.orderCount || item?.orderCount || 0),
      reportCount,
      riskTags: this.detectProductRisks(item, reportCount),
      statusText: this.productStatusText(item?.status),
      requiresLocation: this.requiresTradeLocation(item?.deliveryType),
      onlinePaymentEligible: item?.deliveryType === '包邮',
    };
  }

  private mapOrder(item: any, userMap?: Map<string, any>, productMap?: Map<string, any>) {
    const product = productMap?.get(item.productId) || item.product || null;
    return {
      ...item,
      price: Number(item.price || 0),
      shippingAddress: this.mapJsonObject(item.shippingAddress),
      buyer: userMap?.get(item.buyerId) || item.buyer || null,
      seller: userMap?.get(item.sellerId) || item.seller || null,
      product: product ? { ...product, cover: this.jsonArray(product.images)[0] || product.cover || '', location: this.mapJsonObject(product.location) } : null,
      statusText: this.orderStatusText(item.status),
      deliveryType: product?.deliveryType || '',
      tradeKind: this.orderTradeKind(product, item.status),
      requiresLocation: this.requiresTradeLocation(product?.deliveryType),
      onlinePaymentOrder: product?.deliveryType === '包邮' && item.status !== 'contacting',
    };
  }

  private mapReport(item: any, productMap?: Map<string, any>) {
    const product = productMap?.get(item.targetId) || item.product || null;
    return {
      ...item,
      images: this.mapJsonObject(item.images)?.images || this.jsonArray(item.images),
      product: product ? this.mapProduct(product) : null,
      productTitle: product?.title || this.mapJsonObject(item.images)?.productTitle || item.targetId,
      reporterName: item.reporter?.nickname || item.reporterId,
      reportedName: item.reported?.nickname || item.reportedId || '-',
    };
  }

  private async writeAuditRecord(item: any, status: string, reason = '', operatorId?: string | null) {
    try {
      await this.prisma.auditRecord.create({
        data: {
          targetType: 'second_hand',
          targetId: item.id,
          targetTitle: item.title || item.description || '二手商品',
          submitterId: item.userId || null,
          reviewerId: operatorId || null,
          status: this.auditStatusFromProductStatus(status),
          reason: reason || this.productStatusText(status),
          reviewedAt: new Date(),
        },
      });
    } catch {
      // 审核记录不能影响主流程，避免运营处理被日志写入阻断。
    }
  }

  // ==================== 商品管理 ====================

  async getStats(regionId?: string) {
    const productWhere: any = {};
    const orderWhere: any = {};
    if (regionId) productWhere.regionId = regionId;
    if (regionId) {
      const productIds = await this.prisma.secondHand.findMany({
        where: { regionId },
        select: { id: true },
      });
      orderWhere.productId = { in: productIds.map((item) => item.id) };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [statusRows, productTotal, todayNew, orderTotal, todayOrders, orderStatusRows, reportPending, settingCount] = await Promise.all([
      this.prisma.secondHand.groupBy({ by: ['status'], where: productWhere, _count: { _all: true } }),
      this.prisma.secondHand.count({ where: productWhere }),
      this.prisma.secondHand.count({ where: { ...productWhere, createdAt: { gte: today } } }),
      this.prisma.secondHandOrder.count({ where: orderWhere }),
      this.prisma.secondHandOrder.count({ where: { ...orderWhere, createdAt: { gte: today } } }),
      this.prisma.secondHandOrder.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
      this.prisma.report.count({
        where: {
          targetType: { in: ['second_hand', 'secondHand', 'secondhand'] },
          status: { in: ['pending', 'processing'] },
        },
      }).catch(() => 0),
      this.prisma.secondHandRegionSetting.count({ where: { enableSecondHand: true } }),
    ]);

    const byStatus = statusRows.reduce((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {} as Record<string, number>);
    const ordersByStatus = orderStatusRows.reduce((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {} as Record<string, number>);

    return {
      productTotal,
      pending: byStatus.PENDING || 0,
      onSale: byStatus.ON_SALE || 0,
      sold: byStatus.SOLD || 0,
      offline: byStatus.OFFLINE || 0,
      rejected: byStatus.REJECTED || 0,
      todayNew,
      orderTotal,
      todayOrders,
      contacting: ordersByStatus.contacting || 0,
      pendingPay: ordersByStatus.pending_pay || 0,
      paid: ordersByStatus.paid || 0,
      reportPending,
      enabledRegions: settingCount,
    };
  }

  async getProductList(query: any) {
    const { page = 1, pageSize = 20, keyword, status, regionId, category, deliveryType } = query;
    const where: any = {};
    if (keyword) {
      const keywordText = String(keyword).trim();
      const uidNumber = /^\d+$/.test(keywordText) ? Number(keywordText) : null;
      const sellerIds = await this.prisma.user.findMany({
        where: {
          OR: [
            { nickname: { contains: keywordText } },
            { phone: { contains: keywordText } },
            ...(uidNumber !== null ? [{ uid: uidNumber }] : []),
          ],
        },
        select: { id: true },
        take: 50,
      }).catch(() => []);
      where.OR = [
        { title: { contains: keywordText } },
        { description: { contains: keywordText } },
        ...(sellerIds.length ? [{ userId: { in: sellerIds.map((user) => user.id) } }] : []),
      ];
    }
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (category) where.category = { contains: category };
    if (deliveryType) where.deliveryType = deliveryType;

    const [list, total] = await Promise.all([
      this.prisma.secondHand.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
          region: { select: { id: true, name: true } },
        },
      }),
      this.prisma.secondHand.count({ where }),
    ]);
    const productIds = list.map((item) => item.id);
    const [orderRows, reportRows] = await Promise.all([
      productIds.length ? this.prisma.secondHandOrder.groupBy({
        by: ['productId'],
        where: { productId: { in: productIds } },
        _count: { _all: true },
      }) : [],
      productIds.length ? this.prisma.report.groupBy({
        by: ['targetId'],
        where: {
          targetType: { in: ['second_hand', 'secondHand', 'secondhand'] },
          targetId: { in: productIds },
        },
        _count: { _all: true },
      }).catch(() => []) : [],
    ]);
    const orderMap = new Map(orderRows.map((item) => [item.productId, item._count._all]));
    const reportMap = new Map(reportRows.map((item) => [item.targetId, item._count._all]));
    return {
      list: list.map((item) => this.mapProduct(item, {
        orderCount: orderMap.get(item.id) || 0,
        reportCount: reportMap.get(item.id) || 0,
      })),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  async getProductDetail(id: string) {
    const item = await this.prisma.secondHand.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, createdAt: true } },
        region: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('商品不存在');
    const [orders, reports, auditRecords, sellerTotal, sellerOnSale] = await Promise.all([
      this.prisma.secondHandOrder.findMany({
        where: { productId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.report.findMany({
        where: {
          targetType: { in: ['second_hand', 'secondHand', 'secondhand'] },
          targetId: id,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { reporter: { select: { id: true, uid: true, nickname: true, avatar: true } } },
      }).catch(() => []),
      this.prisma.auditRecord.findMany({
        where: { targetType: 'second_hand', targetId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).catch(() => []),
      this.prisma.secondHand.count({ where: { userId: item.userId } }),
      this.prisma.secondHand.count({ where: { userId: item.userId, status: 'ON_SALE' } }),
    ]);
    const userIds = Array.from(new Set(orders.flatMap((order) => [order.buyerId, order.sellerId]).filter(Boolean)));
    const reviewerIds = Array.from(new Set(auditRecords.map((record) => record.reviewerId).filter(Boolean))) as string[];
    const [users, reviewers] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, uid: true, nickname: true, avatar: true, phone: true } }) : [],
      reviewerIds.length ? this.prisma.adminAccount.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, username: true, realName: true } }) : [],
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const reviewerMap = new Map(reviewers.map((admin) => [admin.id, admin]));
    const mappedReports = reports.map((report: any) => ({
      ...report,
      images: this.jsonArray(report.images),
    }));
    const product = this.mapProduct(item, {
      orderCount: orders.length,
      reportCount: mappedReports.length,
    });
    return {
      ...product,
      sellerStats: {
        totalListings: sellerTotal,
        onSaleListings: sellerOnSale,
      },
      orders: orders.map((order) => this.mapOrder(order, userMap, new Map([[item.id, item]]))),
      reports: mappedReports,
      auditRecords: auditRecords.map((record: any) => {
        const reviewer = record.reviewerId ? reviewerMap.get(record.reviewerId) : null;
        return {
          ...record,
          reviewerName: reviewer?.realName || reviewer?.username || (record.reviewerId ? '管理员' : '系统'),
        };
      }),
    };
  }

  async updateProductStatus(id: string, dto: any, operatorId?: string, ip?: string) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    const updated = await this.prisma.secondHand.update({
      where: { id },
      data: {
        status: dto.status,
        auditReason: dto.auditReason || dto.reason || null,
      } as any,
    });
    await this.writeAuditRecord(item, dto.status, dto.auditReason || dto.reason || '', operatorId);
    await this.prisma.adminOperationLog.create({
      data: {
        accountId: operatorId || '',
        action: 'update_status',
        module: 'second_hand',
        targetId: id,
        targetType: 'second_hand_product',
        detail: { status: dto.status, reason: dto.auditReason || dto.reason || '', ip },
        ip,
      },
    }).catch(() => null);
    return this.mapProduct(updated);
  }

  async batchUpdateProductStatus(dto: any, operatorId?: string, ip?: string) {
    const ids = Array.from(new Set((dto.ids || []).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('请选择要处理的商品');
    if (!dto.status) throw new BadRequestException('请选择处理状态');

    const items = await this.prisma.secondHand.findMany({
      where: { id: { in: ids as string[] } },
      select: { id: true, userId: true, title: true, description: true },
    });
    if (!items.length) throw new NotFoundException('商品不存在');

    const reason = dto.auditReason || dto.reason || '';
    await this.prisma.secondHand.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: {
        status: dto.status,
        auditReason: reason || null,
      } as any,
    });
    await this.prisma.auditRecord.createMany({
      data: items.map((item) => ({
        targetType: 'second_hand',
        targetId: item.id,
        targetTitle: item.title || item.description || '二手商品',
        submitterId: item.userId || null,
        reviewerId: operatorId || null,
        status: this.auditStatusFromProductStatus(dto.status),
        reason: reason || this.productStatusText(dto.status),
        reviewedAt: new Date(),
      })),
    }).catch(() => null);
    await this.prisma.adminOperationLog.create({
      data: {
        accountId: operatorId || '',
        action: 'batch_update_status',
        module: 'second_hand',
        targetType: 'second_hand_product',
        detail: { ids: items.map((item) => item.id), status: dto.status, reason, ip },
        ip,
      },
    }).catch(() => null);
    return { success: true, count: items.length };
  }

  async deleteProduct(id: string) {
    const item = await this.prisma.secondHand.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    const orderCount = await this.prisma.secondHandOrder.count({ where: { productId: id } });
    if (orderCount > 0) {
      const updated = await this.prisma.secondHand.update({
        where: { id },
        data: { status: 'OFFLINE', auditReason: '运营删除/隐藏，保留交易证据' },
      });
      return this.mapProduct(updated);
    }
    return this.prisma.secondHand.delete({ where: { id } });
  }

  // ==================== 订单管理 ====================

  async getOrderList(query: any) {
    const { page = 1, pageSize = 20, orderNo, status, deliveryType, buyerId, sellerId } = query;
    const where: any = {};
    if (orderNo) where.orderNo = { contains: orderNo };
    if (status) where.status = status;
    if (buyerId) where.buyerId = buyerId;
    if (sellerId) where.sellerId = sellerId;
    if (deliveryType) {
      const productIds = await this.prisma.secondHand.findMany({
        where: { deliveryType },
        select: { id: true },
        take: 1000,
      });
      where.productId = { in: productIds.map((item) => item.id) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.secondHandOrder.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true } } },
      }),
      this.prisma.secondHandOrder.count({ where }),
    ]);
    const userIds = Array.from(new Set(rows.flatMap((item) => [item.buyerId, item.sellerId]).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((item) => item.productId).filter(Boolean)));
    const [users, products] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, uid: true, nickname: true, avatar: true } }) : [],
      productIds.length ? this.prisma.secondHand.findMany({
        where: { id: { in: productIds } },
        select: { id: true, title: true, description: true, images: true, category: true, deliveryType: true, location: true },
      }) : [],
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const list = rows.map((item) => this.mapOrder(item, userMap, productMap));
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getOrderDetail(id: string) {
    const order = await this.prisma.secondHandOrder.findUnique({
      where: { id },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    const [buyer, seller, product] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: order.buyerId }, select: { id: true, uid: true, nickname: true, avatar: true, phone: true } }).catch(() => null),
      this.prisma.user.findUnique({ where: { id: order.sellerId }, select: { id: true, uid: true, nickname: true, avatar: true, phone: true } }).catch(() => null),
      this.prisma.secondHand.findUnique({ where: { id: order.productId } }).catch(() => null),
    ]);
    return this.mapOrder({ ...order, buyer, seller, product: product ? this.mapProduct(product) : null });
  }

  async updateOrderStatus(id: string, dto: any, operatorId?: string, ip?: string) {
    const order = await this.prisma.secondHandOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    const status = String(dto.status || '').trim();
    if (!status) throw new BadRequestException('请选择订单状态');

    // AUD-P1-154: 后台只允许安全过渡动作。paid 必须由支付中心写入，
    // refunding/refunded 必须由统一退款写入。后台只能操作沟通/取消/发货/完成等运营动作。
    const allowed = ['contacting', 'cancelled', 'shipped', 'completed'];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `后台不支持此操作。"paid" 只能由支付成功产生，"refunding/refunded" 只能由退款流程产生。` +
        `如需人工修正请走财务异常处理通道。`,
      );
    }
    const reason = dto.reason || this.orderStatusText(status);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.secondHandOrder.update({
        where: { id },
        data: { status, remark: reason ? `${order.remark || ''}${order.remark ? '\n' : ''}运营处理：${reason}` : order.remark },
      });
      if (status === 'completed') {
        await tx.secondHand.update({ where: { id: order.productId }, data: { status: 'SOLD' } }).catch(() => null);
      }
      if (status === 'cancelled') {
        await tx.secondHand.update({ where: { id: order.productId }, data: { status: 'ON_SALE', auditReason: `订单已取消，商品恢复上架` } }).catch(() => null);
      }
      return next;
    });
    await this.prisma.adminOperationLog.create({
      data: {
        accountId: operatorId || '',
        action: 'update_order_status',
        module: 'second_hand',
        targetId: id,
        targetType: 'second_hand_order',
        detail: { status, reason, ip },
        ip,
      },
    }).catch(() => null);
    return this.mapOrder(updated);
  }

  // ==================== 举报/纠纷 ====================

  async getReportList(query: any) {
    const { page = 1, pageSize = 20, status, keyword, regionId } = query;
    const where: any = {
      targetType: { in: ['second_hand', 'secondHand', 'secondhand'] },
    };
    if (status) where.status = status;

    let productIds: string[] | undefined;
    if (keyword || regionId) {
      const productWhere: any = {};
      if (regionId) productWhere.regionId = regionId;
      if (keyword) {
        productWhere.OR = [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
        ];
      }
      const products = await this.prisma.secondHand.findMany({ where: productWhere, select: { id: true }, take: 500 });
      productIds = products.map((item) => item.id);
      where.targetId = { in: productIds };
    }

    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
          reported: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
        },
      }).catch(() => []),
      this.prisma.report.count({ where }).catch(() => 0),
    ]);
    const ids = Array.from(new Set(rows.map((item) => item.targetId).filter(Boolean)));
    const products = ids.length
      ? await this.prisma.secondHand.findMany({
          where: { id: { in: ids } },
          include: {
            user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
            region: { select: { id: true, name: true } },
          },
        })
      : [];
    const productMap = new Map(products.map((item) => [item.id, item]));
    return {
      list: rows.map((item) => this.mapReport(item, productMap)),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  async handleReport(id: string, dto: any, operatorId?: string, ip?: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, uid: true, nickname: true } },
        reported: { select: { id: true, uid: true, nickname: true } },
      },
    });
    if (!report) throw new NotFoundException('举报不存在');
    const action = this.normalizeReportAction(dto.action);
    const result = dto.result || '二手举报已处理';
    const effects: string[] = [];
    const product = await this.prisma.secondHand.findUnique({ where: { id: report.targetId } }).catch(() => null);

    if (action === 'offline' && product) {
      await this.prisma.secondHand.update({
        where: { id: product.id },
        data: { status: 'OFFLINE', auditReason: result },
      });
      effects.push('商品已下架');
    }
    if (action === 'reject' && product) {
      await this.prisma.secondHand.update({
        where: { id: product.id },
        data: { status: 'REJECTED', auditReason: result },
      });
      effects.push('商品已驳回');
    }
    if (action === 'mute_user' && report.reportedId) {
      const days = Math.max(1, Math.min(365, Math.floor(Number(dto.muteDays) || 7)));
      const muteEndAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: report.reportedId },
        data: { muteEndAt, muteReason: result },
      });
      effects.push(`卖家已禁言 ${days} 天`);
    }
    if (action === 'ban_user' && report.reportedId) {
      await this.prisma.user.update({
        where: { id: report.reportedId },
        data: { status: UserStatus.BANNED, banVersion: { increment: 1 }, muteReason: result },
      });
      await this.userSessionRevocation.revoke(report.reportedId);
      effects.push('卖家已封禁');
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: this.normalizeReportStatus(dto.status || 'resolved'),
        result: effects.length ? `${result}；${effects.join('；')}` : result,
        handlerId: operatorId || null,
        handledAt: new Date(),
      },
      include: {
        reporter: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
        reported: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true } },
      },
    });
    await this.prisma.adminOperationLog.create({
      data: {
        accountId: operatorId || '',
        action: 'handle_report',
        module: 'second_hand',
        targetId: id,
        targetType: 'second_hand_report',
        detail: { action, result, effects, ip },
        ip,
      },
    }).catch(() => null);
    return { success: true, effects, data: this.mapReport(updated, product ? new Map([[product.id, product]]) : undefined) };
  }

  // ==================== 区域配置 ====================

  async getRegionSettingsList(query: any) {
    const { page = 1, pageSize = 20, regionId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.secondHandRegionSetting.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { region: { select: { name: true } } },
      }),
      this.prisma.secondHandRegionSetting.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getRegionSetting(regionId: string) {
    const settings = await this.prisma.secondHandRegionSetting.findUnique({
      where: { regionId },
      include: { region: { select: { name: true } } },
    });
    return this.normalizeSetting(settings, regionId);
  }

  async upsertRegionSetting(regionId: string, dto: any) {
    const r = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!r) throw new NotFoundException('区域不存在');
    const payload = {
      enableSecondHand: dto.enableSecondHand ?? true,
      maxListings: dto.maxListings === undefined || dto.maxListings === null ? null : Number(dto.maxListings),
      requirePhone: !!dto.requirePhone,
      requireAudit: !!dto.requireAudit,
      enableOnlinePayment: !!dto.enableOnlinePayment,
      enableAfterSale: !!dto.enableAfterSale,
      enablePlatformGuarantee: !!dto.enablePlatformGuarantee,
      enableAutoRecommend: !!dto.enableAutoRecommend,
    };
    return this.prisma.secondHandRegionSetting.upsert({
      where: { regionId },
      create: { regionId, ...payload } as any,
      update: payload as any,
    });
  }
}
