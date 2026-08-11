import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { NotifyService } from '../notify/notify.service';
import { ShopService } from '../shop/shop.service';

@Injectable()
export class OrderCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminDataScope: AdminDataScopeService,
    @Optional() private readonly notifyService?: NotifyService,
    @Optional() private readonly shopService?: ShopService,
  ) {}

  private async shopOrderRegionWhere(operatorId?: string) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    return scope.isSuperAdmin ? {} : { merchant: { regionId: { in: scope.regionIds } } };
  }

  private async assertShopOrderRegionAccess(operatorId: string | undefined, order: any) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!order?.merchant?.regionId || !scope.regionIds.includes(order.merchant.regionId)) {
      throw new ForbiddenException('无权访问该区域外卖订单');
    }
  }

  private fulfillmentCutoffs(now = new Date()) {
    return {
      merchantAccept: new Date(now.getTime() - 10 * 60 * 1000),
      riderPickup: new Date(now.getTime() - 15 * 60 * 1000),
      riderDelivery: new Date(now.getTime() - 45 * 60 * 1000),
    };
  }

  private fulfillmentAlertFor(order: any, now = new Date()) {
    if (order.businessType !== 'takeaway' || order.deliveryMode === 'self_delivery') return null;
    if (['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) return null;
    const cutoff = this.fulfillmentCutoffs(now);
    const waitMinutes = (from: Date) => Math.max(10, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
    const fulfillmentStart = order.fulfillmentStartTime ? new Date(order.fulfillmentStartTime) : null;
    const scheduled = order.scheduledDeliveryTime ? new Date(order.scheduledDeliveryTime) : null;
    if (order.status === 'PAID' && !order.merchantAcceptTime) {
      const since = fulfillmentStart || scheduled || order.createdAt;
      if (new Date(since).getTime() <= cutoff.merchantAccept.getTime()) return { code: 'merchant_unaccepted', label: '商家超时未接单', waitMinutes: waitMinutes(since), suggestion: '联系商家确认接单；无法履约时协助用户退款' };
    }
    if (order.status === 'PAID' && order.readyTime && !order.riderId && new Date(order.readyTime).getTime() <= cutoff.merchantAccept.getTime()) {
      return { code: 'rider_unassigned', label: '餐品已备好，暂无骑手', waitMinutes: waitMinutes(order.readyTime), suggestion: '检查在线骑手与接单大厅，必要时人工协调配送' };
    }
    if (order.status === 'SHIPPED' && order.riderId && !order.pickupTime && order.acceptTime && new Date(order.acceptTime).getTime() <= cutoff.riderPickup.getTime()) {
      return { code: 'rider_pickup_overdue', label: '骑手接单后未取餐', waitMinutes: waitMinutes(order.acceptTime), suggestion: '联系骑手确认到店情况，必要时协调改派' };
    }
    if (order.status === 'SHIPPED' && order.pickupTime && !order.deliverTime && new Date(order.pickupTime).getTime() <= cutoff.riderDelivery.getTime()) {
      return { code: 'rider_delivery_overdue', label: '骑手取餐后未送达', waitMinutes: waitMinutes(order.pickupTime), suggestion: '联系骑手核实配送进度，必要时介入处理' };
    }
    return null;
  }

  private deliveryDisplayModeForOrder(order: any) {
    const saved = String(order?.deliveryDisplayMode || '').trim();
    if (saved) return saved;
    if (order?.businessType === "dorm_shop" || order?.deliveryMode === "self_delivery") return "status_nodes";
    return order?.deliveryMode === "platform_rider" ? "live_map" : "status_nodes";
  }

  private deliveryNodeLabel(nodeType: string) {
    const map: Record<string, string> = {
      merchant_accepted: "商家已接单",
      merchant_completed: "商家已送达",
      accepted: "骑手已接单",
      in_progress: "骑手已取货",
      arrived: "骑手已送达",
      completed: "订单已完成",
      cancelled: "订单已取消",
      returned_pool: "骑手超时未取餐，订单已退回骑手池",
    };
    return map[nodeType] || "配送状态更新";
  }

  async releaseUnpickedRiderOrder(orderId: string, operatorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { merchant: { select: { regionId: true, userId: true, name: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    await this.assertShopOrderRegionAccess(operatorId, order);
    const cutoff = this.fulfillmentCutoffs().riderPickup;
    const riderId = order.riderId;
    if (
      order.businessType !== 'takeaway' || order.deliveryMode === 'self_delivery' ||
      order.status !== 'SHIPPED' || !riderId || order.pickupTime || !order.acceptTime ||
      ['refunding', 'refunded'].includes(String(order.refundStatus || 'none')) ||
      new Date(order.acceptTime).getTime() > cutoff.getTime()
    ) {
      throw new ForbiddenException('仅能将骑手超时未取餐的外卖订单退回骑手池');
    }

    await this.prisma.$transaction(async (tx) => {
      const released = await tx.order.updateMany({
        where: { id: order.id, status: 'SHIPPED', refundStatus: { notIn: ['refunding', 'refunded'] }, riderId, pickupTime: null, acceptTime: { lte: cutoff } },
        data: { status: 'PAID', riderId: null, acceptTime: null },
      });
      if (released.count !== 1) throw new ForbiddenException('订单状态已变化，请刷新后重试');
      await tx.orderLog.create({
        data: { orderId: order.id, action: 'RIDER_RELEASED_TO_POOL', fromStatus: 'SHIPPED', toStatus: 'PAID', operatorId, operatorType: 'admin', remark: '骑手超时未取餐，运营退回骑手池重新派单' },
      });
      await tx.deliveryOrderNode.create({
        data: { orderId: order.id, orderType: 'shop', nodeType: 'returned_pool', nodeLabel: this.deliveryNodeLabel('returned_pool'), operatorId, operatorType: 'admin', riderType: 'official', displayMode: 'status_nodes', remark: '骑手超时未取餐，已重新开放接单' },
      });
      const [activeErrands, activeShopOrders] = await Promise.all([
        tx.errandOrder.count({ where: { riderId, status: { in: ['accepted', 'in_progress', 'arrived'] } } }),
        tx.order.count({ where: { riderId, status: 'SHIPPED' } }),
      ]);
      await tx.regionRider.updateMany({
        where: { userId: riderId, verifyStatus: 'approved', status: 'busy' },
        data: { status: activeErrands + activeShopOrders > 0 ? 'busy' : 'online' },
      });
    });
    const notificationData = { orderId: order.id, orderNo: order.orderNo, merchantId: order.merchantId };
    const notices: Promise<unknown>[] = [];
    if (order.userId) notices.push(this.notifyService?.createAndDispatch({
      userId: order.userId, regionId: order.merchant?.regionId || undefined, type: 'order', scene: 'takeaway_rider_reassigned',
      title: '配送骑手正在重新派单', content: '原骑手超时未取餐，订单已重新开放给骑手接单，我们会持续跟进配送进度。', data: notificationData,
      linkType: 'page', linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`, channelMask: { inApp: true, websocket: true },
    }) || Promise.resolve());
    if (order.merchant?.userId && order.merchant.userId !== order.userId) notices.push(this.notifyService?.createAndDispatch({
      userId: order.merchant.userId, regionId: order.merchant.regionId || undefined, type: 'order', scene: 'takeaway_rider_reassigned_merchant',
      title: '骑手超时未取餐，订单已重新派单', content: '请妥善保管餐品，订单已退回骑手池等待新骑手接单。', data: notificationData,
      linkType: 'page', linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`, channelMask: { inApp: true, websocket: true },
    }) || Promise.resolve());
    notices.push(this.notifyService?.createAndDispatch({
      userId: riderId, regionId: order.merchant?.regionId || undefined, type: 'order', scene: 'takeaway_rider_assignment_released',
      title: '配送订单已解除', content: '因超过取餐时限，该订单已退回骑手池重新派单，请勿再前往商家取餐。', data: notificationData,
      linkType: 'page', linkValue: '/pagesA/Grab/Grab', channelMask: { inApp: true, websocket: true },
    }) || Promise.resolve());
    await Promise.allSettled(notices);
    await this.shopService?.notifyAvailableShopRiders({ ...order, status: 'PAID', riderId: null, acceptTime: null }).catch(() => 0);
    return { success: true, message: '订单已退回骑手池，等待其他骑手接单' };
  }

  async getOrders(query: any, operatorId?: string) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      orderType,
      status,
      payStatus,
      userId,
      merchantId,
      businessType,
      deliveryMode,
      startDate,
      endDate,
      alert,
    } = query;
    const normalizedOrderType = orderType || (query.type === "delivery" ? "order" : query.type);
    const shopOrderRegionWhere = await this.shopOrderRegionWhere(operatorId);
    const pageNo = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Number(pageSize) || 20);

    const results: any[] = [];
    let shopOrderTotal: number | null = null;

    // 普通商家订单
    if (!normalizedOrderType || normalizedOrderType === "order") {
      const where: any = { ...shopOrderRegionWhere };
      const and: any[] = [];
      if (keyword) {
        and.push({ OR: [
          { orderNo: { contains: keyword } },
        ] });
      }
      const normalizedStatus = String(status || '').toUpperCase();
      if (normalizedStatus === 'PARTIAL_REFUND') {
        where.refundStatus = 'partial';
      } else if (['REFUNDING', 'REFUNDED'].includes(normalizedStatus)) {
        and.push({ OR: [{ status: normalizedStatus }, { refundStatus: normalizedStatus.toLowerCase() }] });
      } else if (status) {
        where.status = status;
      }
      if (userId) where.userId = userId;
      if (merchantId) where.merchantId = merchantId;
      if (businessType) where.businessType = businessType;
      if (deliveryMode) where.deliveryMode = deliveryMode;
      const cutoff = this.fulfillmentCutoffs();
      if (alert === 'fulfillment') {
        and.push({ deliveryMode: { not: 'self_delivery' } });
        and.push({ refundStatus: { notIn: ['refunding', 'refunded'] } });
        and.push({ OR: [
          { status: 'PAID', businessType: 'takeaway', merchantAcceptTime: null, fulfillmentStartTime: { lte: cutoff.merchantAccept } },
          { status: 'PAID', businessType: 'takeaway', merchantAcceptTime: null, fulfillmentStartTime: null, createdAt: { lte: cutoff.merchantAccept }, OR: [{ scheduledDeliveryTime: null }, { scheduledDeliveryTime: { lte: cutoff.merchantAccept } }] },
          { status: 'PAID', businessType: 'takeaway', readyTime: { not: null, lte: cutoff.merchantAccept }, riderId: null },
          { status: 'SHIPPED', businessType: 'takeaway', riderId: { not: null }, pickupTime: null, acceptTime: { lte: cutoff.riderPickup } },
          { status: 'SHIPPED', businessType: 'takeaway', pickupTime: { not: null, lte: cutoff.riderDelivery }, deliverTime: null },
        ] });
      }
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }
      if (and.length) where.AND = and;

      const shopOnly = normalizedOrderType === "order";
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: { id: true, name: true, logo: true, businessType: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: shopOnly ? (pageNo - 1) * size : 0,
        take: shopOnly ? size : 100,
      }),
        shopOnly && typeof this.prisma.order.count === 'function'
          ? this.prisma.order.count({ where })
          : Promise.resolve(null),
      ]);
      if (shopOnly && total !== null) shopOrderTotal = total;

      results.push(
        ...orders.map((o) => {
          const deliveryMode = o.businessType === "dorm_shop" ? "self_delivery" : o.deliveryMode;
          const fulfillmentAlert = this.fulfillmentAlertFor({ ...o, deliveryMode });
          return {
            orderId: o.id,
            id: o.id,
            orderNo: o.orderNo,
            orderType: o.businessType === "dorm_shop" ? "宿舍小店订单" : "外卖订单",
            businessType: o.businessType,
            deliveryMode,
            deliveryModeLabel: this.deliveryModeLabel(deliveryMode),
            deliveryDisplayMode: this.deliveryDisplayModeForOrder({ ...o, deliveryMode }),
            status: o.status,
            refundStatus: o.refundStatus || 'none',
            refundAmount: Number(o.refundAmount || 0),
            payStatus: o.status,
            amount: Number(o.payAmount || 0),
            user: o.user,
            merchant: o.merchant,
            merchantName: o.merchant?.name || "-",
            userName: o.user?.nickname || "-",
            receiverName: o.receiverName,
            receiverPhone: o.receiverPhone,
            receiverAddress: o.receiverAddress,
            payAmount: Number(o.payAmount || 0),
            freightAmount: Number(o.freightAmount || 0),
            createdAt: o.createdAt,
            fulfillmentAlert,
          };
        }),
      );
    }

    // 商城订单
    if (!normalizedOrderType || normalizedOrderType === "mall") {
      const where: any = {};
      if (keyword) {
        where.OR = [
          { orderNo: { contains: keyword } },
          { receiverName: { contains: keyword } },
          { receiverPhone: { contains: keyword } },
        ];
      }
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (merchantId) where.merchantId = merchantId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.mallOrder.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "商城订单",
          status: o.status,
          payStatus: o.payTime ? "paid" : "unpaid",
          amount: Number(o.payAmount || 0),
          user: o.User,
          merchant: { id: o.merchantId, name: "-" },
          createdAt: o.createdAt,
        })),
      );
    }

    // 跑腿订单
    if (!normalizedOrderType || normalizedOrderType === "errand") {
      const where: any = {};
      if (keyword) {
        where.OR = [
          { orderNo: { contains: keyword } },
          { title: { contains: keyword } },
          { description: { contains: keyword } },
        ];
      }
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.errandOrder.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "跑腿订单",
          status: o.status,
          payStatus: o.payTime ? "paid" : "unpaid",
          amount: Number(o.payAmount || 0),
          user: o.User,
          merchant: null,
          createdAt: o.createdAt,
        })),
      );
    }

    // 团购订单
    if (!normalizedOrderType || normalizedOrderType === "groupbuy") {
      const where: any = {};
      if (keyword) where.orderNo = { contains: keyword };
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.groupBuyOrder.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          Package: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "团购订单",
          status: o.status,
          payStatus: o.payTime ? "paid" : "unpaid",
          amount: Number(o.amount || 0),
          user: o.User,
          merchant: { id: "-", name: o.Package?.name || "-" },
          createdAt: o.createdAt,
        })),
      );
    }

    // 活动订单
    if (!normalizedOrderType || normalizedOrderType === "activity") {
      const where: any = {};
      if (keyword) where.orderNo = { contains: keyword };
      if (status) where.orderStatus = status;
      if (userId) where.userId = userId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.activityOrder.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          activity: {
            select: { id: true, title: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "活动订单",
          status: o.orderStatus,
          payStatus: o.payStatus,
          amount: Number(o.amount || 0),
          user: o.user,
          merchant: { id: "-", name: o.activity?.title || "-" },
          createdAt: o.createdAt,
        })),
      );
    }

    // 置顶订单
    if (!normalizedOrderType || normalizedOrderType === "topup") {
      const where: any = {};
      if (keyword) where.orderNo = { contains: keyword };
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.topupOrder.findMany({
        where,
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "置顶订单",
          status: o.status,
          payStatus: o.payTime ? "paid" : "unpaid",
          amount: Number(o.amount || 0),
          user: o.User,
          merchant: null,
          createdAt: o.createdAt,
        })),
      );
    }

    // 二手订单
    if (!normalizedOrderType || normalizedOrderType === "secondhand") {
      const where: any = {};
      if (keyword) where.orderNo = { contains: keyword };
      if (status) where.status = status;
      if (userId) where.buyerId = userId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const orders = await this.prisma.secondHandOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "二手订单",
          status: o.status,
          payStatus: o.payTime ? "paid" : "unpaid",
          amount: Number(o.price || 0),
          user: { id: o.buyerId },
          merchant: { id: o.sellerId },
          createdAt: o.createdAt,
        })),
      );
    }

    // 排序
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // 分页
    const total = shopOrderTotal ?? results.length;
    const start = (pageNo - 1) * size;
    const list = shopOrderTotal === null ? results.slice(start, start + size) : results;

    return {
      list,
      total,
      page: pageNo,
      pageSize: size,
    };
  }

  async exportOrders(query: any, operatorId?: string) {
    const result = await this.getOrders({ ...query, page: 1, pageSize: 1000 }, operatorId);
    const escapeCsv = (value: any) => {
      const text = value === undefined || value === null ? "" : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = result.list.map((order: any) => [
      order.orderNo,
      order.orderType,
      order.status,
      order.payStatus,
      order.user?.nickname || order.user?.phone || order.user?.id || "",
      order.merchant?.name || order.merchant?.id || "",
      order.amount,
      order.createdAt ? new Date(order.createdAt).toISOString() : "",
    ]);
    const csv = [
      ["订单号", "订单类型", "订单状态", "支付状态", "用户", "商家/来源", "金额", "创建时间"],
      ...rows,
    ]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    return { csv, total: result.total };
  }

  async getOrderDetail(id: string, type?: string, operatorId?: string) {
    // 尝试从各表查找
    const normalizedType = type === "delivery" ? "order" : type;
    if (!normalizedType || normalizedType === "order") {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: { id: true, name: true, logo: true, phone: true, businessType: true, regionId: true },
          },
          items: true,
        },
      });
      if (order) {
        await this.assertShopOrderRegionAccess(operatorId, order);
        const deliveryMode = order.businessType === "dorm_shop" ? "self_delivery" : order.deliveryMode;
        const [deliveryNodes, riskEvents] = await Promise.all([
          this.prisma.deliveryOrderNode.findMany({ where: { orderId: id, orderType: "shop" }, orderBy: { createdAt: "asc" } }).catch(() => []),
          this.prisma.deliveryRiskEvent.findMany({ where: { orderId: id, orderType: "shop" }, orderBy: { createdAt: "desc" } }).catch(() => []),
        ]);
        return {
          ...order,
          orderType: order.businessType === "dorm_shop" ? "宿舍小店订单" : "外卖订单",
          businessType: order.businessType,
          deliveryMode,
          deliveryModeLabel: this.deliveryModeLabel(deliveryMode),
          deliveryDisplayMode: this.deliveryDisplayModeForOrder(order),
          deliveryNodes,
          riskEvents,
          merchantName: order.merchant?.name || "-",
          userName: order.user?.nickname || "-",
          amount: Number(order.payAmount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "mall") {
      const order = await this.prisma.mallOrder.findUnique({
        where: { id },
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          refunds: true,
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "商城订单",
          amount: Number(order.payAmount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "errand") {
      const order = await this.prisma.errandOrder.findUnique({
        where: { id },
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "跑腿订单",
          amount: Number(order.payAmount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "groupbuy") {
      const order = await this.prisma.groupBuyOrder.findUnique({
        where: { id },
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          Package: true,
          Reviews: true,
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "团购订单",
          amount: Number(order.amount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "activity") {
      const order = await this.prisma.activityOrder.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          activity: true,
          tickets: true,
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "活动订单",
          amount: Number(order.amount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "topup") {
      const order = await this.prisma.topupOrder.findUnique({
        where: { id },
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "置顶订单",
          amount: Number(order.amount || 0),
        };
      }
    }

    if (!normalizedType || normalizedType === "secondhand") {
      const order = await this.prisma.secondHandOrder.findUnique({
        where: { id },
      });
      if (order) {
        return {
          ...order,
          orderType: "二手订单",
          amount: Number(order.price || 0),
        };
      }
    }

    throw new NotFoundException("订单不存在");
  }

  async getUserOrders(userId: string, query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, orderType } = query;
    const results: any[] = [];

    // 普通订单
    if (!orderType || orderType === "order") {
      const orders = await this.prisma.order.findMany({
        where: { userId, ...(await this.shopOrderRegionWhere(operatorId)) },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "普通订单",
          status: o.status,
          amount: Number(o.payAmount || 0),
          createdAt: o.createdAt,
        })),
      );
    }

    // 商城订单
    if (!orderType || orderType === "mall") {
      const orders = await this.prisma.mallOrder.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "商城订单",
          status: o.status,
          amount: Number(o.payAmount || 0),
          createdAt: o.createdAt,
        })),
      );
    }

    // 跑腿订单
    if (!orderType || orderType === "errand") {
      const orders = await this.prisma.errandOrder.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "跑腿订单",
          status: o.status,
          amount: Number(o.payAmount || 0),
          createdAt: o.createdAt,
        })),
      );
    }

    // 置顶订单
    if (!orderType || orderType === "topup") {
      const orders = await this.prisma.topupOrder.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "置顶订单",
          status: o.status,
          amount: Number(o.amount || 0),
          createdAt: o.createdAt,
        })),
      );
    }

    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = results.length;
    const start = (+page - 1) * +pageSize;
    const list = results.slice(start, start + +pageSize);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getPaymentByNo(paymentNo: string, operatorId?: string) {
    const payment = await this.prisma.paymentOrder.findFirst({
      where: { orderNo: paymentNo },
    });
    if (!payment) throw new NotFoundException("支付单不存在");
    // SEC-P0-B2: 区域管理员只能查看本区域外卖订单对应的支付单。
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) {
      if (payment.bizType !== "order") {
        throw new ForbiddenException("无权查看该支付单");
      }
      const order = await this.prisma.order.findUnique({
        where: { id: payment.bizId },
        select: { merchant: { select: { regionId: true } } },
      });
      if (
        !order?.merchant?.regionId ||
        !scope.regionIds.includes(order.merchant.regionId)
      ) {
        throw new ForbiddenException("无权查看该支付单");
      }
    }
    return payment;
  }

  async getRefunds(query: any, operatorId?: string) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      status,
      refundType,
      startDate,
      endDate,
    } = query;

    // SEC-P0-B2: 按操作员数据范围限定退款可见范围，防止区域管理员读取全平台退款。
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    const regionScoped = !scope.isSuperAdmin;

    const results: any[] = [];

    // 普通退款
    if (!refundType || refundType === "refund") {
      const where: any = {};
      if (keyword) where.refundNo = { contains: keyword };
      if (status) where.status = status;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }
      if (regionScoped) {
        // 普通退款挂在外卖 Order 上，按商户所属区域过滤。
        where.order = { merchant: { regionId: { in: scope.regionIds } } };
      }

      const refunds = await this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...refunds.map((r) => ({
          refundId: r.id,
          refundNo: r.refundNo,
          refundType: "普通退款",
          status: r.status,
          amount: Number(r.amount || 0),
          reason: r.reason,
          createdAt: r.createdAt,
        })),
      );
    }

    // 商城退款（平台级业务，区域管理员不可见）
    if ((!refundType || refundType === "mall") && !regionScoped) {
      const where: any = {};
      if (keyword) where.refundNo = { contains: keyword };
      if (status) where.status = status;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)
          where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
      }

      const refunds = await this.prisma.mallRefund.findMany({
        where,
        include: {
          order: {
            include: {
              User: {
                select: {
                  id: true,
                  nickname: true,
                  avatar: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...refunds.map((r) => ({
          refundId: r.id,
          refundNo: r.refundNo,
          refundType: "商城退款",
          status: r.status,
          amount: Number(r.amount || 0),
          user: r.order?.User,
          merchant: null,
          reason: r.reason,
          createdAt: r.createdAt,
        })),
      );
    }

    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = results.length;
    const start = (+page - 1) * +pageSize;
    const list = results.slice(start, start + +pageSize);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getOrderTimeline(orderId: string, type?: string, operatorId?: string) {
    const timeline: any[] = [];

    // 尝试查找订单
    const order = await this.getOrderDetail(orderId, type, operatorId);

      if (order) {
        const deliveryNodes = await this.prisma.deliveryOrderNode.findMany({
          where: { orderId, orderType: (order as any).businessType ? "shop" : "errand" },
          orderBy: { createdAt: "asc" },
        }).catch(() => []);
        for (const node of deliveryNodes) {
          timeline.push({
            time: node.createdAt,
            action: node.nodeLabel || this.deliveryNodeLabel(node.nodeType),
            detail: node.remark || "",
          });
        }
        timeline.push({
          time: order.createdAt,
        action: "订单创建",
        detail: `订单号: ${order.orderNo}`,
      });

      if ((order as any).payTime) {
        timeline.push({
          time: (order as any).payTime,
          action: "支付成功",
          detail: `支付金额: ${order.amount}`,
        });
      }

      if ((order as any).deliverTime) {
        timeline.push({
          time: (order as any).deliverTime,
          action: "已发货",
          detail: (order as any).trackingNo
            ? `快递单号: ${(order as any).trackingNo}`
            : "",
        });
      }

      if ((order as any).receiveTime) {
        timeline.push({
          time: (order as any).receiveTime,
          action: "已收货",
          detail: "",
        });
      }

      if ((order as any).completeTime) {
        timeline.push({
          time: (order as any).completeTime,
          action: "已完成",
          detail: "",
        });
      }

      if ((order as any).cancelTime) {
        timeline.push({
          time: (order as any).cancelTime,
          action: "已取消",
          detail: (order as any).cancelReason || "",
        });
      }
    }

    // 查询操作日志
    const logs = await this.prisma.adminOperationLog.findMany({
      where: { targetId: orderId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const log of logs) {
      timeline.push({
        time: log.createdAt,
        action: log.action,
        detail: log.detail
          ? typeof log.detail === "string"
            ? log.detail
            : JSON.stringify(log.detail)
          : "",
        operator: log.accountId,
      });
    }

    timeline.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );

    return { timeline };
  }

  private deliveryModeLabel(value?: string | null) {
    if (value === "self_delivery") return "店主自送";
    if (value === "rider_delivery") return "叫骑手配送";
    return "平台配送";
  }
}
