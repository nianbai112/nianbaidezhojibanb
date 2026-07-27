import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { NotifyService } from "../notify/notify.service";
import { PaymentService } from "../payment/payment.service";
import {
  CreateOrderAppealDto,
  SupplementOrderAppealDto,
  UpdateOrderAppealDto,
} from "./dto/order-appeal.dto";

const STATUS_TEXT: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  waiting_user: "待用户补充",
  resolved: "已解决",
  rejected: "已驳回",
};

@Injectable()
export class OrderAppealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifyService: NotifyService,
    private readonly adminDataScope: AdminDataScopeService,
    @Optional() private readonly paymentService?: PaymentService,
  ) {}

  private normalizeImages(images: unknown) {
    const list = Array.isArray(images) ? images : [];
    if (
      list.length > 6 ||
      list.some(
        (item) =>
          typeof item !== "string" ||
          !/^(https?:\/\/|\/uploads\/)/.test(item.trim()),
      )
    ) {
      throw new BadRequestException("凭证图片格式不正确");
    }
    return list.map((item) => item.trim());
  }

  private appealNo() {
    return `AP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  }

  private async loadOrder(orderType: string, orderId: string) {
    const prisma: any = this.prisma;
    if (orderType === "order") {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          merchant: { select: { name: true, regionId: true, userId: true } },
          items: { select: { productName: true, quantity: true } },
        },
      });
      if (!order) throw new NotFoundException("订单不存在");
      return {
        type: "order",
        id: order.id,
        orderNo: order.orderNo,
        userId: order.userId,
        regionId: order.merchant?.regionId || "",
        merchantUserId: order.merchant?.userId || "",
        status: String(order.status),
        refundStatus: String(order.refundStatus || "none"),
        title: order.merchant?.name || "配送订单",
        amount: Number(order.payAmount || 0),
        createdAt: order.createdAt,
        snapshot: {
          merchantName: order.merchant?.name || "",
          items: order.items || [],
          status: String(order.status),
          amount: Number(order.payAmount || 0),
        },
      };
    }
    const order = await prisma.errandOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        userId: true,
        regionId: true,
        status: true,
        refundStatus: true,
        title: true,
        payAmount: true,
        createdAt: true,
      },
    });
    if (!order) throw new NotFoundException("订单不存在");
    return {
      type: "errand",
      id: order.id,
      orderNo: order.orderNo,
      userId: order.userId,
      regionId: order.regionId || "",
      merchantUserId: "",
      status: String(order.status),
      refundStatus: String(order.refundStatus || "none"),
      title: order.title || "跑腿订单",
      amount: Number(order.payAmount || 0),
      createdAt: order.createdAt,
      snapshot: {
        title: order.title || "",
        status: String(order.status),
        amount: Number(order.payAmount || 0),
      },
    };
  }

  private ineligibleReason(order: any) {
    if (!order.regionId) return "该订单缺少区域归属，暂无法申诉";
    if (["refunding", "refunded"].includes(order.refundStatus.toLowerCase()))
      return "该订单已进入退款流程";
    if (
      order.type === "order" &&
      ["PENDING_PAY", "CANCELLED", "REFUNDED"].includes(order.status)
    )
      return "该订单当前状态不可申诉";
    if (
      order.type === "errand" &&
      ["pending_pay", "cancelled", "refunding", "refunded"].includes(
        order.status.toLowerCase(),
      )
    )
      return "该订单当前状态不可申诉";
    return "";
  }

  private async assertAppealableOrder(
    userId: string,
    orderType: string,
    orderId: string,
  ) {
    const order = await this.loadOrder(orderType, orderId);
    if (order.userId !== userId) throw new ForbiddenException("无权申诉该订单");
    const reason = this.ineligibleReason(order);
    if (reason) throw new BadRequestException(reason);
    return order;
  }

  async listEligibleOrders(userId: string, query: any = {}) {
    const prisma: any = this.prisma;
    const [orders, errandOrders] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: {
          merchant: { select: { name: true, regionId: true } },
          items: { select: { productName: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.errandOrder.findMany({
        where: { userId },
        select: {
          id: true,
          orderNo: true,
          userId: true,
          regionId: true,
          status: true,
          refundStatus: true,
          title: true,
          payAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const normalize = (order: any, type: "order" | "errand") => {
      const normalized =
        type === "order"
          ? {
              type,
              id: order.id,
              orderNo: order.orderNo,
              regionId: order.merchant?.regionId || "",
              status: String(order.status),
              refundStatus: String(order.refundStatus || "none"),
              title: order.merchant?.name || "配送订单",
              amount: Number(order.payAmount || 0),
              createdAt: order.createdAt,
            }
          : {
              type,
              id: order.id,
              orderNo: order.orderNo,
              regionId: order.regionId || "",
              status: String(order.status),
              refundStatus: String(order.refundStatus || "none"),
              title: order.title || "跑腿订单",
              amount: Number(order.payAmount || 0),
              createdAt: order.createdAt,
            };
      const reason = this.ineligibleReason(normalized);
      return {
        orderType: type,
        orderId: normalized.id,
        orderNo: normalized.orderNo,
        title: normalized.title,
        amount: normalized.amount,
        status: normalized.status,
        createdAt: normalized.createdAt,
        selectable: !reason,
        disabledReason: reason,
      };
    };
    const list = [
      ...orders.map((order: any) => normalize(order, "order")),
      ...errandOrders.map((order: any) => normalize(order, "errand")),
    ];
    const requestedType = ["order", "errand"].includes(String(query?.orderType))
      ? String(query.orderType)
      : "";
    const requestedId = String(query?.orderId || "").trim();
    if (
      requestedType &&
      requestedId &&
      !list.some(
        (item) =>
          item.orderType === requestedType && item.orderId === requestedId,
      )
    ) {
      try {
        const requested = await this.loadOrder(requestedType, requestedId);
        if (requested.userId === userId) {
          const reason = this.ineligibleReason(requested);
          list.push({
            orderType: requestedType,
            orderId: requested.id,
            orderNo: requested.orderNo,
            title: requested.title,
            amount: requested.amount,
            status: requested.status,
            createdAt: requested.createdAt,
            selectable: !reason,
            disabledReason: reason,
          });
        }
      } catch {
        // 不暴露不存在或不属于当前用户的订单。
      }
    }
    return list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async createAppeal(userId: string, dto: CreateOrderAppealDto) {
    const order = await this.assertAppealableOrder(
      userId,
      dto.orderType,
      dto.orderId,
    );
    const prisma: any = this.prisma;
    const existing = await prisma.orderAppeal.findUnique({
      where: {
        orderType_orderId: { orderType: dto.orderType, orderId: dto.orderId },
      },
    });
    if (existing)
      throw new ConflictException("该订单已提交申诉，请在我的申诉中查看进度");
    const images = this.normalizeImages(dto.evidenceImages);
    let appeal: any;
    try {
      appeal = await prisma.orderAppeal.create({
        data: {
          appealNo: this.appealNo(),
          orderType: dto.orderType,
          orderId: dto.orderId,
          orderNo: order.orderNo,
          userId,
          regionId: order.regionId,
          orderSnapshot: order.snapshot,
          appealType: dto.appealType,
          description: dto.description.trim(),
          evidenceImages: images,
          contactPhone: dto.contactPhone?.trim() || null,
          status: "pending",
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ConflictException("该订单已提交申诉，请在我的申诉中查看进度");
      throw error;
    }
    await prisma.orderAppealEvent.create({
      data: {
        appealId: appeal.id,
        action: "created",
        actorType: "user",
        actorId: userId,
        status: "pending",
        content: dto.description.trim(),
      },
    });
    await this.notifyService
      .createAndDispatch({
        userId,
        regionId: order.regionId,
        type: "system",
        scene: "order_appeal_created",
        title: "订单申诉已提交",
        content: `申诉单 ${appeal.appealNo} 已提交，客服会尽快处理。`,
        linkType: "miniapp",
        linkValue: "/pagesA/order/appeal/appeal?tab=history",
      })
      .catch(() => undefined);
    if (order.merchantUserId && order.merchantUserId !== userId) {
      await this.notifyService
        .createAndDispatch({
          userId: order.merchantUserId,
          regionId: order.regionId,
          type: "order",
          scene: "order_appeal_created_merchant",
          title: "订单收到履约申诉",
          content: `订单 ${order.orderNo} 有用户提交履约申诉，请核查订单记录并保留相关凭证。`,
          linkType: "miniapp",
          linkValue: `/pagesA/order/appeal/merchant-appeal?appealId=${appeal.id}`,
        })
        .catch(() => undefined);
    }
    return appeal;
  }

  async listMyAppeals(userId: string) {
    const prisma: any = this.prisma;
    return prisma.orderAppeal.findMany({
      where: { userId },
      include: {
        events: {
          where: { actorType: { not: "merchant" } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  private async assertMerchantAppealAccess(userId: string, appeal: any) {
    if (!appeal || appeal.orderType !== "order")
      throw new NotFoundException("申诉单不存在");
    const order = await this.loadOrder("order", appeal.orderId);
    if (!order.merchantUserId || order.merchantUserId !== userId)
      throw new NotFoundException("申诉单不存在");
    return order;
  }

  async getMerchantAppeal(userId: string, id: string) {
    const prisma: any = this.prisma;
    const appeal = await prisma.orderAppeal.findUnique({ where: { id } });
    await this.assertMerchantAppealAccess(userId, appeal);
    return {
      id: appeal.id,
      appealNo: appeal.appealNo,
      orderNo: appeal.orderNo,
      status: appeal.status,
      appealType: appeal.appealType,
      description: appeal.description,
    };
  }

  async replyMerchantAppeal(
    userId: string,
    id: string,
    dto: { content: string },
  ) {
    const prisma: any = this.prisma;
    const appeal = await prisma.orderAppeal.findUnique({ where: { id } });
    await this.assertMerchantAppealAccess(userId, appeal);
    const content = dto.content.trim();
    if (!["pending", "processing"].includes(appeal.status))
      throw new BadRequestException("当前申诉不接受商家补充说明");
    const updated = await prisma.orderAppeal.updateMany({
      where: { id, status: { in: ["pending", "processing"] } },
      data: { status: "pending" },
    });
    if (updated.count !== 1)
      throw new ConflictException("申诉状态已变化，请刷新后重试");
    await prisma.orderAppealEvent.create({
      data: {
        appealId: id,
        action: "merchant_replied",
        actorType: "merchant",
        actorId: userId,
        status: "pending",
        content,
      },
    });
    return { success: true };
  }

  async supplementAppeal(
    userId: string,
    id: string,
    dto: SupplementOrderAppealDto,
  ) {
    const prisma: any = this.prisma;
    const appeal = await prisma.orderAppeal.findUnique({ where: { id } });
    if (!appeal || appeal.userId !== userId)
      throw new NotFoundException("申诉单不存在");
    if (appeal.status !== "waiting_user")
      throw new BadRequestException("当前申诉无需补充材料");
    const content = dto.content.trim();
    const images = this.normalizeImages([
      ...(Array.isArray(appeal.evidenceImages) ? appeal.evidenceImages : []),
      ...(dto.evidenceImages || []),
    ]);
    const updated = await prisma.orderAppeal.updateMany({
      where: { id, userId, status: "waiting_user" },
      data: {
        status: "pending",
        evidenceImages: images,
        latestReply: content,
        resolvedAt: null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("申诉状态已变化，请刷新后重试");
    await prisma.orderAppealEvent.create({
      data: {
        appealId: id,
        action: "supplemented",
        actorType: "user",
        actorId: userId,
        status: "pending",
        content,
      },
    });
    return { success: true };
  }

  async listAdminAppeals(operatorId: string, query: any) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    const where: any = {};
    if (!scope.isSuperAdmin) where.regionId = { in: scope.regionIds };
    if (query.regionId) {
      if (
        !scope.isSuperAdmin &&
        !scope.regionIds.includes(String(query.regionId))
      )
        throw new ForbiddenException("无权访问该区域数据");
      where.regionId = String(query.regionId);
    }
    if (query.status) where.status = String(query.status);
    if (query.keyword)
      where.OR = [
        { appealNo: { contains: String(query.keyword) } },
        { orderNo: { contains: String(query.keyword) } },
      ];
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const prisma: any = this.prisma;
    const [list, total] = await Promise.all([
      prisma.orderAppeal.findMany({
        where,
        include: { events: { orderBy: { createdAt: "asc" } } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.orderAppeal.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async updateAppeal(
    operatorId: string,
    id: string,
    dto: UpdateOrderAppealDto,
  ) {
    const prisma: any = this.prisma;
    const appeal = await prisma.orderAppeal.findUnique({ where: { id } });
    if (!appeal) throw new NotFoundException("申诉单不存在");
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (
      !scope.isSuperAdmin &&
      (!appeal.regionId || !scope.regionIds.includes(appeal.regionId))
    )
      throw new ForbiddenException("无权处理该区域申诉");
    const reply = dto.reply?.trim() || "";
    if (!dto.status && !reply)
      throw new BadRequestException("请填写处理状态或回复内容");
    const status = dto.status || appeal.status;
    if (
      status !== appeal.status &&
      ["waiting_user", "resolved", "rejected"].includes(status) &&
      !reply
    ) {
      throw new BadRequestException("请填写给用户的处理说明后再更新状态");
    }
    const resolutionAction = dto.resolutionAction || "no_action";
    if (resolutionAction !== "no_action") {
      if (status !== "resolved") throw new BadRequestException("资金处置必须与解决申诉同时提交");
      const updated = resolutionAction === "full_refund" || resolutionAction === "partial_refund"
        ? await this.resolveRefundAction(appeal, operatorId, reply, resolutionAction, dto.refundAmount)
        : resolutionAction === "compensate_user"
          ? await this.resolveCompensationAction(appeal, operatorId, reply, dto.refundAmount)
          : await this.resolveRiderPenaltyAction(appeal, operatorId, reply, dto.riderPenaltyAmount);
      await this.notifyAppealUpdated(appeal, updated.status, reply);
      return updated;
    }
    const updated = await prisma.orderAppeal.update({
      where: { id },
      data: {
        status,
        handlerId: operatorId,
        latestReply: reply || appeal.latestReply,
        resolvedAt: ["resolved", "rejected"].includes(status)
          ? new Date()
          : null,
      },
    });
    await prisma.orderAppealEvent.create({
      data: {
        appealId: id,
        action: "updated",
        actorType: "admin",
        actorId: operatorId,
        status,
        content: reply || null,
      },
    });
    await this.notifyAppealUpdated(appeal, status, reply);
    return updated;
  }

  private positiveAmount(value: unknown, label: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      throw new BadRequestException(`${label}必须为正数且最多两位小数`);
    }
    return amount;
  }

  private async resolveRefundAction(
    appeal: any,
    operatorId: string,
    reply: string,
    action: string,
    requestedAmount?: number,
  ) {
    if (!this.paymentService) throw new BadRequestException("退款服务不可用");
    const prisma: any = this.prisma;
    const actionKey = `appeal-resolution:${appeal.id}:${action}`;
    const linkedRefund = await prisma.paymentRefund.findFirst({
      where: { sourceType: "order_appeal", sourceId: appeal.id, status: { in: ["pending", "processing", "success"] } },
      orderBy: { createdAt: "desc" },
    });
    if (linkedRefund) {
      const linkedStatus = linkedRefund.status === "success" ? "resolved" : "processing";
      return prisma.orderAppeal.update({
        where: { id: appeal.id },
        data: { status: linkedStatus, handlerId: operatorId, latestReply: reply, resolvedAt: linkedStatus === "resolved" ? new Date() : null },
      });
    }

    const bizType = appeal.orderType === "errand" ? "errand_order" : "order";
    const payment = await prisma.paymentOrder.findFirst({
      where: { bizType, bizId: appeal.orderId, status: { in: ["paid", "refunding"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) throw new BadRequestException("未找到可退款的支付单");
    const remaining = Number((Number(payment.amount) - Number(payment.refundedAmount || 0)).toFixed(2));
    const amount = action === "full_refund" ? remaining : this.positiveAmount(requestedAmount, "退款金额");
    if (amount <= 0 || amount > remaining) throw new BadRequestException(`退款金额超过可退金额(${remaining.toFixed(2)})`);

    await prisma.orderAppeal.updateMany({
      where: { id: appeal.id, status: { in: ["pending", "processing", "waiting_user"] } },
      data: { status: "processing", handlerId: operatorId, latestReply: reply, resolvedAt: null },
    });
    const result = await this.paymentService.refund({
      bizType,
      bizId: appeal.orderId,
      amount,
      reason: `申诉 ${appeal.appealNo}：${reply}`,
      operatorId,
      sourceType: "order_appeal",
      sourceId: appeal.id,
    });
    const nextStatus = result?.status === "success" ? "resolved" : "processing";
    const updated = await prisma.orderAppeal.update({
      where: { id: appeal.id },
      data: { status: nextStatus, handlerId: operatorId, latestReply: reply, resolvedAt: nextStatus === "resolved" ? new Date() : null },
    });
    await prisma.orderAppealEvent.create({
      data: {
        actionKey,
        appealId: appeal.id,
        action: `${action}_dispatched`,
        actorType: "admin",
        actorId: operatorId,
        status: nextStatus,
        content: JSON.stringify({ amount, refundNo: result?.refundNo, paymentStatus: result?.status }),
      },
    }).catch((error: any) => {
      if (error?.code !== "P2002") throw error;
    });
    return updated;
  }

  private async resolveCompensationAction(
    appeal: any,
    operatorId: string,
    reply: string,
    requestedAmount?: number,
  ) {
    const amount = this.positiveAmount(requestedAmount, "补偿金额");
    const orderAmount = Number(appeal.orderSnapshot?.amount || 0) || Number((await this.loadOrder(appeal.orderType, appeal.orderId)).amount);
    if (amount > orderAmount) throw new BadRequestException(`补偿金额不能超过订单实付金额(${orderAmount.toFixed(2)})`);
    const actionKey = `appeal-resolution:${appeal.id}:compensate_user`;
    try {
      return await this.prisma.$transaction(async tx => {
        const existing = await tx.orderAppealEvent.findUnique({ where: { actionKey } });
        if (existing) return tx.orderAppeal.findUnique({ where: { id: appeal.id } });
        await tx.orderAppealEvent.create({
          data: { actionKey, appealId: appeal.id, action: "compensate_user", actorType: "admin", actorId: operatorId, status: "resolved", content: JSON.stringify({ amount, reply }) },
        });
        const claimed = await tx.orderAppeal.updateMany({
          where: { id: appeal.id, status: { in: ["pending", "processing", "waiting_user"] } },
          data: { status: "processing", handlerId: operatorId, latestReply: reply },
        });
        if (claimed.count !== 1) throw new ConflictException("申诉状态已变化，请刷新后重试");
        const wallet = await tx.wallet.upsert({
          where: { userId: appeal.userId },
          create: { userId: appeal.userId, balance: amount, totalIn: amount },
          update: { balance: { increment: amount }, totalIn: { increment: amount } },
        });
        await tx.walletTransaction.create({
          data: { userId: appeal.userId, type: "REWARD", amount, balance: wallet.balance, orderNo: actionKey, description: `订单申诉平台补偿 ${appeal.appealNo}`, status: "SUCCESS" },
        });
        return tx.orderAppeal.update({
          where: { id: appeal.id },
          data: { status: "resolved", handlerId: operatorId, latestReply: reply, resolvedAt: new Date() },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") return this.prisma.orderAppeal.findUnique({ where: { id: appeal.id } });
      throw error;
    }
  }

  private async resolveRiderPenaltyAction(
    appeal: any,
    operatorId: string,
    reply: string,
    requestedAmount?: number,
  ) {
    const amount = this.positiveAmount(requestedAmount, "骑手处罚金额");
    const item = await this.prisma.riderSettlementItem.findUnique({
      where: { orderType_orderId: { orderType: appeal.orderType === "errand" ? "errand" : "delivery_order", orderId: appeal.orderId } },
      include: { settlement: true },
    });
    if (!item) throw new BadRequestException("该订单尚无骑手结算明细，不能执行处罚");
    if (amount > Number(item.payableAmount)) throw new BadRequestException("骑手处罚金额超过该单可结算金额");
    const actionKey = `appeal-resolution:${appeal.id}:penalize_rider`;
    try {
      return await this.prisma.$transaction(async tx => {
        const existing = await tx.orderAppealEvent.findUnique({ where: { actionKey } });
        if (existing) return tx.orderAppeal.findUnique({ where: { id: appeal.id } });
        await tx.orderAppealEvent.create({
          data: { actionKey, appealId: appeal.id, action: "penalize_rider", actorType: "admin", actorId: operatorId, status: "resolved", content: JSON.stringify({ amount, reply }) },
        });
        if (item.settlement.status === "PAID") {
          await tx.riderLiability.upsert({
            where: { orderId_refundId: { orderId: appeal.orderId, refundId: actionKey } },
            create: { riderId: item.riderId, orderId: appeal.orderId, refundId: actionKey, amount, reason: `申诉处罚 ${appeal.appealNo}` },
            update: {},
          });
        } else {
          await tx.riderSettlementItem.update({
            where: { id: item.id },
            data: { penaltyAmount: { increment: amount }, payableAmount: { decrement: amount }, status: "adjusted" },
          });
          await tx.riderSettlement.update({
            where: { id: item.settlementId },
            data: { penaltyAmount: { increment: amount }, payableAmount: { decrement: amount } },
          });
        }
        return tx.orderAppeal.update({
          where: { id: appeal.id },
          data: { status: "resolved", handlerId: operatorId, latestReply: reply, resolvedAt: new Date() },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") return this.prisma.orderAppeal.findUnique({ where: { id: appeal.id } });
      throw error;
    }
  }

  private async notifyAppealUpdated(appeal: any, status: string, reply: string) {
    await this.notifyService.createAndDispatch({
      userId: appeal.userId,
      regionId: appeal.regionId || undefined,
      type: "system",
      scene: "order_appeal_updated",
      title: "订单申诉有新进展",
      content: reply || `申诉单 ${appeal.appealNo} 当前状态：${STATUS_TEXT[status] || status}`,
      linkType: "miniapp",
      linkValue: "/pagesA/order/appeal/appeal?tab=history",
    }).catch(() => undefined);
  }
}
