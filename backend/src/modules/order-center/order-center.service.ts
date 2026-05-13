import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";

@Injectable()
export class OrderCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrders(query: any) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      orderType,
      status,
      payStatus,
      userId,
      merchantId,
      startDate,
      endDate,
    } = query;
    const normalizedOrderType = orderType || (query.type === "delivery" ? "order" : query.type);

    const results: any[] = [];

    // 普通商家订单
    if (!normalizedOrderType || normalizedOrderType === "order") {
      const where: any = {};
      if (keyword) {
        where.OR = [
          { orderNo: { contains: keyword } },
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

      const orders = await this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: { id: true, name: true, logo: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      results.push(
        ...orders.map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          orderType: "普通订单",
          status: o.status,
          payStatus: o.status,
          amount: Number(o.payAmount || 0),
          user: o.user,
          merchant: o.merchant,
          createdAt: o.createdAt,
        })),
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
      if (keyword) where.title = { contains: keyword };
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

    // 充值订单
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
          orderType: "充值订单",
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

  async exportOrders(query: any) {
    const result = await this.getOrders({ ...query, page: 1, pageSize: 1000 });
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

  async getOrderDetail(id: string, type?: string) {
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
            select: { id: true, name: true, logo: true, phone: true },
          },
          items: true,
        },
      });
      if (order) {
        return {
          ...order,
          orderType: "普通订单",
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
          orderType: "充值订单",
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

  async getUserOrders(userId: string, query: any) {
    const { page = 1, pageSize = 20, orderType } = query;
    const results: any[] = [];

    // 普通订单
    if (!orderType || orderType === "order") {
      const orders = await this.prisma.order.findMany({
        where: { userId },
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

    // 充值订单
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
          orderType: "充值订单",
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

  async getPaymentByNo(paymentNo: string) {
    const payment = await this.prisma.paymentOrder.findFirst({
      where: { orderNo: paymentNo },
    });
    if (!payment) throw new NotFoundException("支付单不存在");
    return payment;
  }

  async getRefunds(query: any) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      status,
      refundType,
      startDate,
      endDate,
    } = query;

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

    // 商城退款
    if (!refundType || refundType === "mall") {
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

  async getOrderTimeline(orderId: string, type?: string) {
    const timeline: any[] = [];

    // 尝试查找订单
    const order = await this.getOrderDetail(orderId, type).catch(() => null);

    if (order) {
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
}
