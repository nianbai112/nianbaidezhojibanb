import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import {
  internalErrandTypeToMini,
  miniErrandStatus,
} from "../errand/errand-config.util";
import { NotifyService } from "../notify/notify.service";
import { MembershipService } from "../membership/membership.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { PrintService } from '../print/print.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifyService: NotifyService,
    private readonly membershipService: MembershipService,
    private readonly redis: RedisService = { withLock: async (_key: string, _ttl: number, task: () => Promise<any>) => task(), hgetall: async () => ({}) } as unknown as RedisService,
    private readonly systemConfigService: SystemConfigService = { amapWalkingDistance: async () => null } as unknown as SystemConfigService,
    private readonly printService: PrintService = { enqueueAutomaticOrder: async () => ({ queued: 0 }), reprintOrder: async () => ({ success: true, queued: 0, message: '' }), prepareConnection: () => ({ connectionMode: 'merchant_owned' }) } as unknown as PrintService,
    private readonly paymentService: PaymentService = {
      refund: async () => { throw new BadRequestException('支付服务未就绪'); },
      cancelFreeShopOrder: async () => { throw new BadRequestException('支付服务未就绪'); },
    } as unknown as PaymentService,
  ) {}

  private subsidyNo() {
    return `SUB${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private dayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private isFulfillmentDue(order: any, now = new Date()) {
    return (
      !order?.fulfillmentStartTime ||
      new Date(order.fulfillmentStartTime).getTime() <= now.getTime()
    );
  }

  private assertFulfillmentDue(order: any) {
    if (!this.isFulfillmentDue(order))
      throw new BadRequestException("预约订单尚未到履约时间");
  }

  private async runCronLocked(name: string, task: () => Promise<void>) {
    await this.redis.withLock(`shop:cron:${name}`, 55, task);
  }

  private deliveryDistanceMeters(merchant: any, address: any) {
    const raw = [merchant?.latitude, merchant?.longitude, address?.latitude, address?.longitude];
    if (raw.some((value) => value === null || value === undefined || value === "")) return null;
    const [lat1, lng1, lat2, lng2] = raw.map(Number);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const radians = (value: number) => (value * Math.PI) / 180;
    const a = Math.sin((radians(lat2) - radians(lat1)) / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin((radians(lng2) - radians(lng1)) / 2) ** 2;
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private async resolveDeliveryDistance(merchant: any, address: any) {
    const straightDistance = this.deliveryDistanceMeters(merchant, address);
    if (straightDistance === null) return { meters: null, source: null };
    const roadDistance = await this.systemConfigService.amapWalkingDistance({
      longitude: Number(merchant.longitude), latitude: Number(merchant.latitude),
    }, {
      longitude: Number(address.longitude), latitude: Number(address.latitude),
    }).catch(() => null);
    // ponytail: use straight-line distance if AMap is unavailable; add retry/cache only after real request volume proves it necessary.
    return roadDistance === null
      ? { meters: straightDistance, source: "straight" }
      : { meters: roadDistance, source: "road" };
  }

  private async resolveOrderDeliveryAddress(merchant: any, userId: string, dto: any) {
    const addressId = String(dto.address_id || dto.addressId || "").trim();
    const specifiedAddressId = String(dto.specified_address_id || dto.specifiedAddressId || "").trim();
    if (merchant.businessType !== "dorm_shop" && !specifiedAddressId)
      throw new BadRequestException("请选择支持配送的收货地址");
    if (!addressId && !specifiedAddressId) return null;
    const address = await this.prisma.address.findFirst({
      where: addressId
        ? { userId, id: addressId }
        : { userId, OR: [{ id: specifiedAddressId }, { specifiedAddressId }] },
      select: {
        id: true, regionId: true, specifiedAddressId: true, name: true, phone: true,
        detail: true, fullAddress: true, dormitoryNumber: true, latitude: true, longitude: true,
      },
    });
    if (!address) throw new ForbiddenException("收货地址不存在或无权使用");
    if (specifiedAddressId && address.id !== specifiedAddressId && address.specifiedAddressId !== specifiedAddressId)
      throw new BadRequestException("收货地址与指定配送区域不一致");
    if (merchant.regionId && merchant.regionId !== (address.specifiedAddressId || address.regionId))
      throw new BadRequestException("收货地址不属于当前商家服务区域");
    return address;
  }

  private unacceptedOrderIsOverdueAt(cutoff: Date) {
    return {
      OR: [
        { fulfillmentStartTime: { lte: cutoff } },
        {
          // 兼容上线前没有履约开始时间的历史预约单；新预约单一律按履约开始时间计时。
          fulfillmentStartTime: null,
          createdAt: { lte: cutoff },
          OR: [
            { scheduledDeliveryTime: null },
            { scheduledDeliveryTime: { lte: cutoff } },
          ],
        },
      ],
    };
  }

  @Cron("0 * * * * *")
  async notifyScheduledMerchantOrders() {
    await this.runCronLocked("scheduled-merchant-notify", () => this.notifyScheduledMerchantOrdersUnlocked());
  }

  private async notifyScheduledMerchantOrdersUnlocked() {
    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        merchantAcceptTime: null,
        refundStatus: { notIn: ["refunding", "refunded"] },
        fulfillmentStartTime: { lte: now },
        orderLogs: { none: { action: "SCHEDULED_MERCHANT_NOTIFY" } },
      },
      include: {
        user: { select: { id: true, nickname: true } },
        merchant: {
          select: {
            id: true,
            userId: true,
            name: true,
            regionId: true,
            businessType: true,
          },
        },
        items: { select: { id: true } },
      },
      take: 100,
    });
    for (const order of orders) {
      try {
        await this.notifyMerchantForOrder(order);
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "SCHEDULED_MERCHANT_NOTIFY",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: "预约订单已到履约时间，已通知商家",
          },
        });
        await this.printService.enqueueAutomaticOrder(order.id).catch(() => undefined);
      } catch {
        // 通知或日志失败时下次重试，避免预约单静默漏发。
      }
    }
  }

  @Cron("0 */10 * * * *")
  async remindUnacceptedOrders() {
    await this.runCronLocked("unaccepted-reminder", () => this.remindUnacceptedOrdersUnlocked());
  }

  /** FIN-P0-003: 商家超时未接单自动取消并全额退款（10 分钟提醒商家 → 20 分钟告知用户 → 30 分钟自动退款）。 */
  @Cron("0 */5 * * * *")
  async autoCancelUnacceptedOrders() {
    await this.runCronLocked("unaccepted-auto-cancel", () =>
      this.autoCancelUnacceptedOrdersUnlocked(),
    );
  }

  private async autoCancelUnacceptedOrdersUnlocked() {
    const AUTO_CANCEL_MINUTES = 30;
    const cutoff = new Date(Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        merchantAcceptTime: null,
        refundStatus: "none",
        businessType: { not: "dorm_shop" },
        ...this.unacceptedOrderIsOverdueAt(cutoff),
      },
      include: {
        merchant: { select: { userId: true, name: true, regionId: true } },
      },
      take: 50,
    });
    for (const order of orders) {
      try {
        await this.autoRefundUnacceptedOrder(order, AUTO_CANCEL_MINUTES);
      } catch {
        // 单笔失败不影响其他订单；下个调度周期自动重试。
      }
    }
  }

  private async autoRefundUnacceptedOrder(order: any, timeoutMinutes: number) {
    const reason = `商家超过 ${timeoutMinutes} 分钟未接单，系统自动取消`;
    const payAmount = this.toNumber(order.payAmount);
    if (payAmount <= 0) {
      await this.paymentService.cancelFreeShopOrder(
        order.id,
        reason,
        "system",
        "system",
      );
    } else {
      const claimed = await this.prisma.order.updateMany({
        where: {
          id: order.id,
          status: "PAID",
          merchantAcceptTime: null,
          refundStatus: "none",
        },
        data: {
          refundStatus: "refunding",
          refundAmount: payAmount,
          cancelReason: reason,
        },
      });
      if (claimed.count !== 1) return;
      await this.prisma.orderLog
        .create({
          data: {
            orderId: order.id,
            action: "AUTO_CANCEL_UNACCEPTED",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: `${reason}，已发起全额退款`,
          },
        })
        .catch(() => undefined);
      try {
        await this.paymentService.refund({
          bizType: "order",
          bizId: order.id,
          amount: payAmount,
          reason,
          sourceType: "unaccepted_timeout",
          sourceId: order.id,
        });
      } catch (error) {
        await this.prisma.order.updateMany({
          where: { id: order.id, refundStatus: "refunding" },
          data: { refundStatus: "none", refundAmount: null },
        });
        throw error;
      }
    }
    await Promise.all([
      this.notifyService
        .createAndDispatch({
          userId: order.userId,
          regionId: order.merchant?.regionId || undefined,
          type: "order",
          scene: "takeaway_unaccepted_auto_cancel",
          title: "订单已自动取消",
          content: `${order.merchant?.name || "商家"} 长时间未接单，订单已自动取消，款项将原路退回。`,
          data: { orderId: order.id, orderNo: order.orderNo },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined),
      order.merchant?.userId
        ? this.notifyService
            .createAndDispatch({
              userId: order.merchant.userId,
              regionId: order.merchant?.regionId || undefined,
              type: "order",
              scene: "takeaway_unaccepted_auto_cancel_merchant",
              title: "订单因超时未接单被取消",
              content: `订单 ${order.orderNo} 因超过 ${timeoutMinutes} 分钟未接单已自动取消退款，请及时处理新订单。`,
              data: { orderId: order.id, orderNo: order.orderNo },
              linkType: "page",
              linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
              channelMask: { inApp: true, websocket: true },
            })
            .catch(() => undefined)
        : Promise.resolve(),
    ]);
  }

  private async remindUnacceptedOrdersUnlocked() {
    const now = new Date();
    const merchantCutoff = new Date(now.getTime() - 10 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        merchantAcceptTime: null,
        refundStatus: { notIn: ["refunding", "refunded"] },
        ...this.unacceptedOrderIsOverdueAt(merchantCutoff),
        orderLogs: { none: { action: "MERCHANT_ACCEPT_REMINDER" } },
      },
      include: {
        merchant: { select: { userId: true, name: true, regionId: true } },
        items: { select: { productName: true, quantity: true } },
      },
      take: 100,
    });
    for (const order of orders) {
      if (!order.merchant?.userId) continue;
      try {
        await this.notifyService.createAndDispatch({
          userId: order.merchant.userId,
          regionId: order.merchant.regionId || undefined,
          type: "order",
          scene: "takeaway_accept_reminder",
          title: "请及时处理新外卖订单",
          content: `${order.orderNo} 已等待 10 分钟，请确认接单或退款。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "MERCHANT_ACCEPT_REMINDER",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: "支付后 10 分钟未接单，已提醒商户",
          },
        });
      } catch {
        // 下次调度重试；只有通知写入成功后才记录幂等日志。
      }
    }

    const buyerCutoff = new Date(now.getTime() - 20 * 60 * 1000);
    const delayedOrders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        merchantAcceptTime: null,
        refundStatus: { notIn: ["refunding", "refunded"] },
        ...this.unacceptedOrderIsOverdueAt(buyerCutoff),
        orderLogs: { none: { action: "USER_ACCEPT_DELAY_NOTICE" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of delayedOrders) {
      if (!order.userId) continue;
      try {
        await this.notifyService.createAndDispatch({
          userId: order.userId,
          regionId: order.merchant?.regionId || undefined,
          type: "order",
          scene: "takeaway_accept_delay",
          title: "商家暂未接单",
          content: `${order.merchant?.name || "商家"} 暂未接单，我们已提醒商家。您可继续等待或申请退款。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "USER_ACCEPT_DELAY_NOTICE",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: "支付后 20 分钟未接单，已告知用户并提示退款入口",
          },
        });
      } catch {
        // 下次调度重试；只有通知写入成功后才记录幂等日志。
      }
    }
  }

  @Cron("0 */10 * * * *")
  async remindUnassignedReadyOrders() {
    await this.runCronLocked("unassigned-ready-reminder", () => this.remindUnassignedReadyOrdersUnlocked());
  }

  private async remindUnassignedReadyOrdersUnlocked() {
    const now = new Date();
    const riderCutoff = new Date(now.getTime() - 10 * 60 * 1000);
    const readyOrders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        businessType: "takeaway",
        deliveryMode: { not: "self_delivery" },
        riderId: null,
        readyTime: { lte: riderCutoff },
        refundStatus: { notIn: ["refunding", "refunded"] },
        orderLogs: { none: { action: "RIDER_ASSIGNMENT_REMINDER" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of readyOrders) {
      try {
        if (!(await this.notifyAvailableShopRiders(order, 20))) continue;
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "RIDER_ASSIGNMENT_REMINDER",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: "餐品备好后10分钟无人接单，已再次提醒在线骑手",
          },
        });
      } catch {
        // 通知或日志失败时下次重试，避免餐品备好后无人接单却静默滞留。
      }
    }

    const buyerCutoff = new Date(now.getTime() - 20 * 60 * 1000);
    const delayedOrders = await this.prisma.order.findMany({
      where: {
        status: "PAID",
        businessType: "takeaway",
        deliveryMode: { not: "self_delivery" },
        riderId: null,
        readyTime: { lte: buyerCutoff },
        refundStatus: { notIn: ["refunding", "refunded"] },
        orderLogs: { none: { action: "USER_RIDER_DELAY_NOTICE" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of delayedOrders) {
      if (!order.userId) continue;
      try {
        await this.notifyService.createAndDispatch({
          userId: order.userId,
          regionId: order.merchant?.regionId || undefined,
          type: "order",
          scene: "takeaway_rider_delay",
          title: "餐品已备好，等待骑手接单",
          content: `${order.merchant?.name || "商家"} 已备餐完成，我们已再次通知可接单骑手。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "USER_RIDER_DELAY_NOTICE",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorType: "system",
            remark: "餐品备好后20分钟无人接单，已告知用户",
          },
        });
      } catch {
        // 下次调度重试；只有通知写入成功后才记录幂等日志。
      }
    }
  }

  @Cron("0 */10 * * * *")
  async remindUnpickedRiderOrders() {
    await this.runCronLocked("unpicked-rider-reminder", () => this.remindUnpickedRiderOrdersUnlocked());
  }

  private async remindUnpickedRiderOrdersUnlocked() {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: "SHIPPED",
        businessType: "takeaway",
        deliveryMode: { not: "self_delivery" },
        riderId: { not: null },
        pickupTime: null,
        acceptTime: { lte: cutoff },
        refundStatus: { notIn: ["refunding", "refunded"] },
        orderLogs: { none: { action: "RIDER_PICKUP_REMINDER" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of orders) {
      try {
        await this.notifyService.createAndDispatch({
          userId: order.riderId!,
          regionId: order.merchant?.regionId || undefined,
          type: "delivery",
          scene: "takeaway_pickup_reminder",
          title: "请尽快到店取餐",
          content: `${order.merchant?.name || "商家"} 的订单已接单，请尽快到店取餐或更新异常情况。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: "/pagesA/Grab/Grab",
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "RIDER_PICKUP_REMINDER",
            fromStatus: "SHIPPED",
            toStatus: "SHIPPED",
            operatorType: "system",
            remark: "骑手接单后10分钟未取餐，已提醒骑手",
          },
        });
      } catch {
        // 下次调度重试；只有提醒成功后才记录幂等日志。
      }
    }
  }

  @Cron("0 */10 * * * *")
  async remindOverdueRiderDeliveries() {
    await this.runCronLocked("overdue-rider-delivery-reminder", () => this.remindOverdueRiderDeliveriesUnlocked());
  }

  private async remindOverdueRiderDeliveriesUnlocked() {
    const now = new Date();
    const riderCutoff = new Date(now.getTime() - 45 * 60 * 1000);
    const overdueOrders = await this.prisma.order.findMany({
      where: {
        status: "SHIPPED",
        businessType: "takeaway",
        deliveryMode: { not: "self_delivery" },
        riderId: { not: null },
        pickupTime: { lte: riderCutoff },
        deliverTime: null,
        refundStatus: { notIn: ["refunding", "refunded"] },
        orderLogs: { none: { action: "RIDER_DELIVERY_REMINDER" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of overdueOrders) {
      try {
        await this.notifyService.createAndDispatch({
          userId: order.riderId!,
          regionId: order.merchant?.regionId || undefined,
          type: "delivery",
          scene: "takeaway_delivery_reminder",
          title: "请及时更新外卖配送状态",
          content: `${order.merchant?.name || "商家"} 的订单已取餐较久，请尽快送达或更新异常情况。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: "/pagesA/Grab/Grab",
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "RIDER_DELIVERY_REMINDER",
            fromStatus: "SHIPPED",
            toStatus: "SHIPPED",
            operatorType: "system",
            remark: "骑手取餐后45分钟未送达，已提醒骑手更新配送",
          },
        });
      } catch {
        // 下次调度重试；只有提醒成功后才记录幂等日志。
      }
    }

    const buyerCutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const delayedOrders = await this.prisma.order.findMany({
      where: {
        status: "SHIPPED",
        businessType: "takeaway",
        deliveryMode: { not: "self_delivery" },
        riderId: { not: null },
        pickupTime: { lte: buyerCutoff },
        deliverTime: null,
        refundStatus: { notIn: ["refunding", "refunded"] },
        orderLogs: { none: { action: "USER_DELIVERY_DELAY_NOTICE" } },
      },
      include: { merchant: { select: { name: true, regionId: true } } },
      take: 100,
    });
    for (const order of delayedOrders) {
      if (!order.userId) continue;
      try {
        await this.notifyService.createAndDispatch({
          userId: order.userId,
          regionId: order.merchant?.regionId || undefined,
          type: "order",
          scene: "takeaway_delivery_delay",
          title: "订单配送可能延迟",
          content: `${order.merchant?.name || "商家"} 的订单仍在配送中，平台正在持续跟进配送进度。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        });
        await this.prisma.orderLog.create({
          data: {
            orderId: order.id,
            action: "USER_DELIVERY_DELAY_NOTICE",
            fromStatus: "SHIPPED",
            toStatus: "SHIPPED",
            operatorType: "system",
            remark: "骑手取餐后60分钟未送达，已告知用户配送延迟",
          },
        });
      } catch {
        // 下次调度重试；只有通知写入成功后才记录幂等日志。
      }
    }
  }

  @Cron("0 */10 * * * *")
  async autoCompleteDeliveredOrders() {
    await this.runCronLocked("auto-receipt", () => this.autoCompleteDeliveredOrdersUnlocked());
  }

  private async autoCompleteDeliveredOrdersUnlocked() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: "DELIVERED",
        refundStatus: { notIn: ["refunding", "refunded"] },
        deliverTime: { lte: cutoff },
        orderLogs: { none: { action: "AUTO_RECEIPT" } },
      },
      select: {
        id: true,
        orderNo: true,
        userId: true,
        merchantId: true,
        merchant: { select: { userId: true, regionId: true } },
      },
      take: 100,
    });
    for (const order of orders) {
      const completed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: "DELIVERED",
            refundStatus: { notIn: ["refunding", "refunded"] },
            deliverTime: { lte: cutoff },
          },
          data: { status: "COMPLETED", receiveTime: now, completeTime: now },
        });
        if (claimed.count !== 1) return false;
        await tx.orderLog.create({
          data: {
            orderId: order.id,
            action: "AUTO_RECEIPT",
            fromStatus: "DELIVERED",
            toStatus: "COMPLETED",
            operatorType: "system",
            remark: "订单送达满24小时，系统自动确认收货",
          },
        });
        await this.recordDeliveryNode(tx, {
          orderId: order.id,
          nodeType: "completed",
          operatorType: "system",
          riderType: "system",
          remark: "订单送达满24小时，系统自动确认收货",
        });
        return true;
      });
      if (!completed || !order.userId) continue;
      await this.notifyService
        .createAndDispatch({
          userId: order.userId,
          type: "order",
          scene: "shop_order_auto_received",
          title: "订单已自动确认收货",
          content:
            "订单送达满24小时，系统已自动确认收货。如有问题请尽快联系商家或客服。",
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined);
      if (order.merchant?.userId && order.merchant.userId !== order.userId) {
        await this.notifyService
          .createAndDispatch({
            userId: order.merchant.userId,
            regionId: order.merchant.regionId || undefined,
            type: "order",
            scene: "shop_order_auto_received_merchant",
            title: "订单已自动确认收货",
            content: `订单 ${order.orderNo || order.id} 已送达满24小时，系统已自动确认收货。`,
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              merchantId: order.merchantId,
            },
            linkType: "page",
            linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
            channelMask: { inApp: true, websocket: true },
          })
          .catch(() => undefined);
      }
    }
  }

  private deliveryDisplayModeForOrder(order: any) {
    const saved = String(order?.deliveryDisplayMode || "").trim();
    if (saved) return saved;
    if (
      order?.businessType === "dorm_shop" ||
      order?.deliveryMode === "self_delivery"
    )
      return "status_nodes";
    return order?.deliveryMode === "platform_rider"
      ? "live_map"
      : "status_nodes";
  }

  private deliveryNodeLabel(nodeType: string) {
    const map: Record<string, string> = {
      merchant_accepted: "商家已接单",
      merchant_ready: "商家备餐完成",
      merchant_delivered: "商家已送达",
      accepted: "骑手已接单",
      in_progress: "骑手已取货",
      arrived: "骑手已送达",
      completed: "订单已完成",
      cancelled: "订单已取消",
    };
    return map[nodeType] || "配送状态更新";
  }

  private async recordDeliveryNode(client: any, params: any) {
    const nodeType = String(params?.nodeType || "").trim();
    if (!nodeType) return null;
    return client.deliveryOrderNode
      .create({
        data: {
          orderId: params.orderId,
          orderType: params.orderType || "shop",
          nodeType,
          nodeLabel: params.nodeLabel || this.deliveryNodeLabel(nodeType),
          operatorId: params.operatorId || null,
          operatorType: params.operatorType || "merchant",
          riderType: params.riderType || "merchant_self",
          displayMode: params.displayMode || "status_nodes",
          remark: params.remark || null,
        },
      })
      .catch(() => null);
  }

  private buildDeliveryTrack(order: any, nodes: any[] = []) {
    const rider = order?.rider || null;
    const displayMode = this.deliveryDisplayModeForOrder(order);
    const locationUpdatedAt = rider?.locationUpdatedAt || null;
    const locationAgeSeconds = locationUpdatedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(locationUpdatedAt).getTime()) / 1000,
          ),
        )
      : null;
    const hasFreshLocation =
      displayMode === "live_map" &&
      String(rider?.riderType || "").toLowerCase() === "official" &&
      rider?.lat !== null &&
      rider?.lat !== undefined &&
      rider?.lng !== null &&
      rider?.lng !== undefined &&
      Number.isFinite(Number(rider?.lat)) &&
      Number.isFinite(Number(rider?.lng)) &&
      locationAgeSeconds !== null &&
      locationAgeSeconds <= 300;
    const lastDeliveryNode = [...nodes]
      .reverse()
      .find(
        (node: any) =>
          node.nodeType === "arrived" &&
          node.lat !== null &&
          node.lat !== undefined &&
          node.lng !== null &&
          node.lng !== undefined &&
          Number.isFinite(Number(node.lat)) &&
          Number.isFinite(Number(node.lng)),
      );
    return {
      display_mode: displayMode,
      rider_type:
        order?.deliveryMode === "self_delivery" ||
        order?.businessType === "dorm_shop"
          ? "merchant_self"
          : rider?.riderType || "platform",
      can_show_live_map: hasFreshLocation,
      estimated_arrival_text: hasFreshLocation
        ? "骑手正在配送中"
        : "以骑手更新的配送节点为准",
      location_stale: displayMode === "live_map" && !hasFreshLocation,
      current_location: hasFreshLocation
        ? {
            latitude: Number(rider.lat),
            longitude: Number(rider.lng),
            updated_at: locationUpdatedAt,
            label: "骑手位置",
          }
        : null,
      last_delivery_location: lastDeliveryNode
        ? {
            latitude: Number(lastDeliveryNode.lat),
            longitude: Number(lastDeliveryNode.lng),
            updated_at: lastDeliveryNode.createdAt,
            label: "送达位置",
          }
        : null,
      nodes: nodes.map((node: any) => ({
        id: node.id,
        type: node.nodeType,
        label: node.nodeLabel || this.deliveryNodeLabel(node.nodeType),
        time: node.createdAt,
        address: node.address || "",
        remark: node.remark || "",
        proof_images: Array.isArray(node.proofImages) ? node.proofImages : [],
      })),
    };
  }

  private couponDiscountAmount(coupon: any, amount: number) {
    const value = this.toNumber(coupon?.value);
    if (amount <= 0 || value <= 0) return 0;
    const type = String(coupon?.type || "").toUpperCase();
    if (type === "DISCOUNT") {
      if (value <= 0 || value >= 10) return 0;
      return Math.max(
        0,
        Math.round((amount - amount * (value / 10)) * 100) / 100,
      );
    }
    return Math.min(value, amount);
  }

  private async resolveCouponCampaign(db: any, couponId: string) {
    const config = await db.config
      .findUnique({ where: { key: "marketing_campaigns_config" } })
      .catch(() => null);
    const value = config?.value as any;
    const list = Array.isArray(value?.list)
      ? value.list
      : Array.isArray(value)
        ? value
        : [];
    const now = new Date();
    return (
      list.find((item: any) => {
        if (!item || item.status !== "active") return false;
        if (String(item.couponId || "") !== String(couponId)) return false;
        if (item.startAt && now < new Date(item.startAt)) return false;
        if (item.endAt && now > new Date(item.endAt)) return false;
        return true;
      }) || null
    );
  }

  private async assertCampaignRules(
    db: any,
    campaign: any,
    userId: string,
    couponId: string,
    discountAmount: number,
  ) {
    if (!campaign || discountAmount <= 0) return;
    if (campaign.firstOrderOnly) {
      const orderCount = await db.order.count({
        where: { userId, status: { not: "CANCELLED" } },
      });
      if (orderCount > 0) throw new BadRequestException("该活动仅限首单使用");
    }
    if (campaign.newUserOnly) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });
      const days = Number(campaign.newUserDays || 7);
      if (
        !user ||
        Date.now() - user.createdAt.getTime() > days * 24 * 60 * 60 * 1000
      ) {
        throw new BadRequestException("该活动仅限新用户使用");
      }
    }
    const baseWhere: any = {
      status: { not: "cancelled" },
      OR: [
        { campaignId: campaign.id },
        { sourceType: "coupon", sourceId: couponId },
      ],
    };
    const [totalAgg, todayAgg, userAgg] = await Promise.all([
      db.subsidyLedger.aggregate({ where: baseWhere, _sum: { amount: true } }),
      db.subsidyLedger.aggregate({
        where: { ...baseWhere, createdAt: { gte: this.dayStart() } },
        _sum: { amount: true },
      }),
      db.subsidyLedger.aggregate({
        where: { ...baseWhere, userId },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const totalSpent = Number(totalAgg?._sum?.amount || 0);
    const todaySpent = Number(todayAgg?._sum?.amount || 0);
    const userSpent = Number(userAgg?._sum?.amount || 0);
    if (
      Number(campaign.totalBudget || 0) > 0 &&
      totalSpent + discountAmount > Number(campaign.totalBudget)
    ) {
      throw new BadRequestException("活动总预算已不足");
    }
    if (
      Number(campaign.dailyBudget || 0) > 0 &&
      todaySpent + discountAmount > Number(campaign.dailyBudget)
    ) {
      throw new BadRequestException("活动今日预算已不足");
    }
    if (
      Number(campaign.perUserBudget || 0) > 0 &&
      userSpent + discountAmount > Number(campaign.perUserBudget)
    ) {
      throw new BadRequestException("已达到个人活动补贴上限");
    }
    if (
      Number(campaign.userLimit || 0) > 0 &&
      Number(userAgg?._count || 0) >= Number(campaign.userLimit)
    ) {
      throw new BadRequestException("已达到个人活动参与次数上限");
    }
  }

  private async resolveShopUserCoupon(
    db: any,
    userId: string,
    userCouponId: any,
    amount: number,
    merchant: any,
  ) {
    if (!userCouponId)
      return { discountAmount: 0, receive: null, coupon: null, campaign: null };
    const receive = await db.couponReceive.findFirst({
      where: { id: String(userCouponId), userId },
      include: { coupon: true },
    });
    if (!receive) throw new BadRequestException("优惠券不存在");
    if (receive.status !== "unused")
      throw new BadRequestException("优惠券已使用或已失效");
    const coupon = receive.coupon;
    if (!coupon || coupon.status !== "active")
      throw new BadRequestException("优惠券已下架");
    const now = new Date();
    if (coupon.startAt && now < coupon.startAt)
      throw new BadRequestException("优惠券未到可用时间");
    if (coupon.endAt && now > coupon.endAt)
      throw new BadRequestException("优惠券已过期");
    const scope = String(coupon.businessScope || "all").toLowerCase();
    if (!["all", "shop"].includes(scope))
      throw new BadRequestException("该优惠券不适用于外卖/小店订单");
    if (Number(coupon.minAmount || 0) > amount)
      throw new BadRequestException(
        `订单满 ¥${Number(coupon.minAmount).toFixed(2)} 才可使用该券`,
      );
    if (
      coupon.regionId &&
      String(coupon.regionId) !== String(merchant?.regionId || "")
    ) {
      throw new BadRequestException("该优惠券不适用于当前区域");
    }
    if (
      coupon.merchantId &&
      String(coupon.merchantId) !== String(merchant?.id || "")
    ) {
      throw new BadRequestException("该优惠券不适用于当前商家");
    }
    const discountAmount = this.couponDiscountAmount(coupon, amount);
    const campaign = await this.resolveCouponCampaign(db, coupon.id);
    await this.assertCampaignRules(
      db,
      campaign,
      userId,
      coupon.id,
      discountAmount,
    );
    return { discountAmount, receive, coupon, campaign };
  }

  private async restoreOrderCoupon(db: any, order: any) {
    const usedCoupon = await db.couponReceive.findFirst({
      where: { userId: order.userId, orderNo: order.orderNo, status: "used" },
    });
    if (!usedCoupon) return;
    await db.couponReceive.update({
      where: { id: usedCoupon.id },
      data: { status: "unused", usedAt: null, orderNo: null },
    });
    await db.coupon.update({
      where: { id: usedCoupon.couponId },
      data: { usedCount: { decrement: 1 } },
    });
    await db.subsidyLedger
      .updateMany({
        where: { sourceType: "coupon", orderType: "order", orderId: order.id },
        data: { status: "cancelled" },
      })
      .catch(() => undefined);
  }

  private async reserveOrderInventory(db: any, items: any[]) {
    for (const item of items) {
      const productUpdated = await db.product.updateMany({
        where: {
          id: item.productId,
          status: "on_sale",
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
          saleCount: { increment: item.quantity },
        },
      });
      if (productUpdated.count !== 1)
        throw new BadRequestException(`${item.productName} 已下架或库存不足`);

      if (item.skuId) {
        const skuUpdated = await db.sKU.updateMany({
          where: {
            id: item.skuId,
            productId: item.productId,
            status: "on_sale",
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (skuUpdated.count !== 1)
          throw new BadRequestException(
            `${item.productName} 规格已下架或库存不足`,
          );
      }

      for (const modifier of this.parseModifierSelections(
        item.modifierSelections,
      )) {
        const option = await db.productModifierOption.findUnique({
          where: { id: modifier.optionId },
          include: { group: true },
        });
        if (
          !option ||
          option.group?.productId !== item.productId ||
          option.status !== "on_sale" ||
          option.group?.status !== "on_sale"
        ) {
          throw new BadRequestException(`${item.productName} 属性或小料已下架`);
        }
        modifier.stockManaged = option.stock !== null;
        if (option.stock === null) continue;
        const optionUpdated = await db.productModifierOption.updateMany({
          where: {
            id: option.id,
            status: "on_sale",
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (optionUpdated.count !== 1)
          throw new BadRequestException(`${option.name} 库存不足`);
      }
    }
  }

  private async restoreOrderInventory(db: any, order: any) {
    if (!order.stockReserved) return;
    for (const item of order.items || []) {
      await db.product.updateMany({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          saleCount: { decrement: item.quantity },
        },
      });
      if (item.skuId) {
        await db.sKU.updateMany({
          where: { id: item.skuId },
          data: { stock: { increment: item.quantity } },
        });
      }
      for (const modifier of this.parseModifierSelections(
        item.modifierSelections,
      )) {
        if (modifier.stockManaged) {
          await db.productModifierOption.updateMany({
            where: { id: modifier.optionId, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    }
  }

  private async createSubsidyLedger(data: any) {
    const amount = this.toNumber(data?.amount);
    if (amount <= 0) return null;
    return this.prisma.subsidyLedger
      .create({
        data: {
          subsidyNo: this.subsidyNo(),
          payerType: "platform",
          status: "pending",
          ...data,
          amount,
        },
      })
      .catch(() => null);
  }

  async getByRegion(regionId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    const pageNo = this.toPositiveInt(page, 1);
    const size = this.toPositiveInt(pageSize, 10);
    const where = { regionId, status: "approved", businessType: "takeaway" };
    const [rows, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: (pageNo - 1) * size,
        take: size,
        orderBy: { createdAt: "desc" },
        include: {
          products: {
            where: { status: "on_sale" },
            take: 4,
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return this.merchantPage(rows, total, pageNo, size);
  }

  async getDormShopsByRegion(regionId: string, query: any) {
    const { page = 1, pageSize = 10 } = query;
    const pageNo = this.toPositiveInt(page, 1);
    const size = this.toPositiveInt(pageSize, 10);
    const where = {
      regionId,
      status: { in: ["approved", "closed"] },
      businessType: "dorm_shop",
    };
    const [rows, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: (pageNo - 1) * size,
        take: size,
        orderBy: { createdAt: "desc" },
        include: {
          products: {
            where: { status: "on_sale" },
            take: 4,
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return {
      ...this.merchantPage(rows, total, pageNo, size),
      dorm_shops: rows.map((row) => this.formatMerchantForMini(row)),
    };
  }

  async getDetail(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        products: {
          where: { status: "on_sale" },
          take: 4,
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    return { ...merchant, ...this.formatMerchantForMini(merchant) };
  }

  async getDormShopDetail(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        products: {
          where: { status: "on_sale" },
          take: 6,
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!merchant || merchant.businessType !== "dorm_shop")
      throw new NotFoundException("宿舍小店不存在");
    return { ...merchant, ...this.formatMerchantForMini(merchant) };
  }

  async getCategoriesAndProducts(merchantId: string) {
    const [categories, uncategorizedProducts] = await Promise.all([
      this.prisma.category.findMany({
        where: { isShow: true },
        include: {
          products: {
            where: { merchantId, status: "on_sale" },
            orderBy: { sortOrder: "asc" },
            include: {
              skus: { where: { status: "on_sale" } },
              modifierGroups: {
                where: { status: "on_sale" },
                include: { options: { where: { status: "on_sale" } } },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.product.findMany({
        where: { merchantId, status: "on_sale", categoryId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          skus: { where: { status: "on_sale" } },
          modifierGroups: {
            where: { status: "on_sale" },
            include: { options: { where: { status: "on_sale" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
    ]);
    const formatted: any[] = categories
      .map((category) => {
        const goods = category.products.map((product: any) =>
          this.formatProductForMini(product),
        );
        return {
          id: category.id,
          name: category.name,
          count: 0,
          goods,
          products: goods,
        };
      })
      .filter((category) => category.goods.length > 0);
    if (uncategorizedProducts.length > 0) {
      const goods = uncategorizedProducts.map((product: any) =>
        this.formatProductForMini(product),
      );
      formatted.unshift({
        id: "default",
        name: "全部商品",
        count: 0,
        goods,
        products: goods,
      });
    }
    return { categories: formatted };
  }

  async getManageCategoriesAndProducts(merchantId: string, userId: string) {
    const merchant = await this.assertMerchantOwner(merchantId, userId);
    const [categories, uncategorizedProducts] = await Promise.all([
      this.prisma.category.findMany({
        where: {
          isShow: true,
          type: "product",
          businessType: merchant.businessType || "takeaway",
          status: { not: "deleted" },
        },
        include: {
          products: {
            where: { merchantId, status: { not: "deleted" } },
            orderBy: { sortOrder: "asc" },
            include: {
              skus: true,
              modifierGroups: {
                include: { options: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.product.findMany({
        where: { merchantId, status: { not: "deleted" }, categoryId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          skus: true,
          modifierGroups: {
            include: { options: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
    ]);

    const formatted = categories.map((category: any) =>
      this.formatCategoryForMini(category, category.products || []),
    );
    if (uncategorizedProducts.length) {
      formatted.unshift({
        id: "default",
        category_id: "default",
        name: "未分类",
        category_name: "未分类",
        category_image: "",
        sort_order: 0,
        is_visible: 1,
        must_select: 0,
        sale_period: null,
        count: uncategorizedProducts.length,
        products: uncategorizedProducts.map((product: any) =>
          this.formatProductForMini(product),
        ),
        goods: uncategorizedProducts.map((product: any) =>
          this.formatProductForMini(product),
        ),
      });
    }
    return { categories: formatted };
  }

  async getList(query: any, userId?: string) {
    const { page = 1, limit = 10 } = query;
    const pageNo = this.toPositiveInt(page, 1);
    const size = this.toPositiveInt(limit, 10);
    const businessType = this.toOptionalStringOrNull(
      query.businessType || query.business_type,
    );
    const where: any = {
      status: { in: ["approved", "closed"] },
      ...(businessType ? { businessType } : {}),
      ...(userId ? { userId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: (pageNo - 1) * size,
        take: size,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    return {
      merchants: rows.map((row: any) => {
        const deliveryMode = this.getOrderDeliveryMode(row);
        const deliveryFee = this.getDeliveryFee(row, deliveryMode);
        return {
          ...row,
          deliveryMode,
          delivery_mode: deliveryMode,
          delivery_mode_label: this.getDeliveryModeLabel(deliveryMode),
          merchant_delivery_fee: deliveryFee.toFixed(2),
          platform_delivery_fee: deliveryFee,
          delivery_fee: deliveryFee.toFixed(2),
        };
      }),
      total,
      page: pageNo,
      limit: size,
      total_pages: Math.ceil(total / size),
    };
  }

  async getMerchantOrders(merchantId: string, query: any, userId: string) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.limit || query.pageSize, 20);
    const merchantIds = await this.resolveManageMerchantIds(merchantId, userId);
    const keyword = String(query.search_keyword || query.keyword || "").trim();
    const where: any = { merchantId: { in: merchantIds } };
    this.applyDeliveryStatusFilter(where, String(query.status || "").trim());
    this.applyTimeRange(where, query);
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
        { receiverAddress: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
      ];
    }

    const [rows, total, statistics] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              address: true,
              phone: true,
              businessType: true,
              deliveryMode: true,
              regionId: true,
              latitude: true,
              longitude: true,
              region: { select: { commissionRate: true } },
            },
          },
          items: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.getMerchantOrderStatistics(merchantIds, query),
    ]);
    const riderIds = Array.from(
      new Set(rows.map((order: any) => order.riderId).filter(Boolean)),
    );
    const riders = riderIds.length
      ? await this.prisma.regionRider.findMany({
          where: { userId: { in: riderIds } },
          include: {
            User: { select: { nickname: true, avatar: true, phone: true } },
          },
        })
      : [];
    const riderMap = new Map(riders.map((rider: any) => [rider.userId, rider]));

    return {
      orders: rows.map((order: any) =>
        this.formatMerchantOrderForMini(order, riderMap.get(order.riderId)),
      ),
      statistics,
      pagination: {
        page,
        pageSize,
        total,
        has_more: page * pageSize < total,
      },
    };
  }

  async applyMerchant(userId: string, dto: any) {
    const businessType = dto.businessType || dto.business_type || "takeaway";
    if (businessType === "dorm_shop") {
      const verified = await this.prisma.studentVerify.findUnique({
        where: { userId },
      });
      if (!verified || verified.status !== "APPROVED") {
        throw new BadRequestException("宿舍小店仅支持完成学生认证的用户申请");
      }
    }
    const data = await this.buildMerchantApplicationData(
      userId,
      businessType,
      dto,
    );
    const existing = await this.prisma.merchant.findFirst({
      where: { userId, businessType },
      orderBy: { createdAt: "desc" },
    });
    if (
      existing &&
      ["pending", "approved", "closed"].includes(existing.status)
    ) {
      throw new BadRequestException(
        existing.status === "pending"
          ? "你已提交宿舍小店申请，请等待后台审核"
          : "你已经拥有宿舍小店，请前往小店管理",
      );
    }
    if (existing?.status === "rejected") {
      return this.prisma.merchant.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: "pending",
          rejectReason: null,
          closedNotice: null,
        },
      });
    }
    return this.prisma.merchant.create({ data });
  }

  async getMyApplication(userId: string, query: any = {}) {
    const businessType = query.businessType || query.business_type;
    return this.prisma.merchant.findFirst({
      where: { userId, ...(businessType ? { businessType } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateMerchant(merchantId: string, userId: string, dto: any) {
    const currentMerchant = await this.assertMerchantOwner(merchantId, userId);
    const data = { ...dto };
    if (data.business_type && !data.businessType)
      data.businessType = data.business_type;
    if (data.delivery_mode && !data.deliveryMode)
      data.deliveryMode = data.delivery_mode;
    if (data.business_hours && !data.businessHours)
      data.businessHours = data.business_hours;
    if (data.background_url !== undefined && data.cover === undefined)
      data.cover = data.background_url;
    if (data.announcement !== undefined && data.description === undefined)
      data.description = data.announcement;
    if (
      data.min_order_amount !== undefined &&
      data.minOrderAmount === undefined
    )
      data.minOrderAmount = data.min_order_amount;
    if (data.packaging_fee !== undefined && data.packagingFee === undefined)
      data.packagingFee = data.packaging_fee;
    if (
      data.delivery_time !== undefined &&
      data.deliveryTimeMinutes === undefined
    )
      data.deliveryTimeMinutes = data.delivery_time;
    if (
      data.business_license_url !== undefined &&
      data.businessLicenseUrl === undefined
    )
      data.businessLicenseUrl = data.business_license_url;
    if (
      data.food_safety_license_url !== undefined &&
      data.foodSafetyLicenseUrl === undefined
    )
      data.foodSafetyLicenseUrl = data.food_safety_license_url;
    if (
      (data.closed_notice !== undefined ||
        data.shop_closed_notice !== undefined) &&
      data.closedNotice === undefined
    ) {
      data.closedNotice = data.closed_notice ?? data.shop_closed_notice;
    }
    if (data.is_open !== undefined && data.status === undefined) {
      // Mini-program compatibility: 0 means open, 1 means resting.
      data.status = Number(data.is_open) === 0 ? "approved" : "closed";
    }
    if (data.region_id !== undefined && data.regionId === undefined)
      data.regionId = data.region_id;
    if (data.category_id !== undefined && data.categoryId === undefined)
      data.categoryId = data.category_id;
    if (data.location && typeof data.location === "object") {
      if (data.latitude === undefined)
        data.latitude =
          data.location.lat ?? data.location.latitude ?? data.location.x;
      if (data.longitude === undefined)
        data.longitude =
          data.location.lng ?? data.location.longitude ?? data.location.y;
    }
    delete data.business_type;
    delete data.delivery_mode;
    delete data.business_hours;
    delete data.background_url;
    delete data.announcement;
    delete data.min_order_amount;
    delete data.packaging_fee;
    delete data.delivery_time;
    delete data.business_license_url;
    delete data.food_safety_license_url;
    delete data.closed_notice;
    delete data.shop_closed_notice;
    delete data.is_open;
    delete data.region_id;
    delete data.category_id;
    delete data.location;
    delete data.platform_delivery_fee;
    delete data.commission_rate;
    if (data.regionId !== undefined)
      data.regionId = this.toOptionalStringOrNull(data.regionId);
    if (data.categoryId !== undefined)
      data.categoryId = this.toOptionalStringOrNull(data.categoryId);
    if (data.latitude !== undefined)
      data.latitude = this.toFloatOrNull(data.latitude);
    if (data.longitude !== undefined)
      data.longitude = this.toFloatOrNull(data.longitude);
    if (data.businessHours !== undefined) {
      data.businessHours = data.businessHours
        ? this.normalizeBusinessHours(data.businessHours)
        : null;
      if (
        data.businessHours === null &&
        String(dto.businessHours ?? dto.business_hours ?? "").trim()
      ) {
        throw new BadRequestException("营业时间格式应为 09:00-22:00");
      }
    }
    if (
      data.deliveryFee !== undefined ||
      data.delivery_fee !== undefined ||
      data.merchant_delivery_fee !== undefined
    ) {
      data.deliveryFee = this.normalizeDeliveryFee(
        data.deliveryFee ?? data.delivery_fee ?? data.merchant_delivery_fee,
      );
    }
    delete data.delivery_fee;
    delete data.merchant_delivery_fee;
    if (data.minOrderAmount !== undefined)
      data.minOrderAmount = this.normalizeNonNegativeMoney(
        data.minOrderAmount,
        "起送金额",
      );
    if (data.packagingFee !== undefined)
      data.packagingFee = this.normalizeNonNegativeMoney(
        data.packagingFee,
        "打包费",
      );
    if (data.deliveryTimeMinutes !== undefined)
      data.deliveryTimeMinutes = this.toPositiveInt(
        data.deliveryTimeMinutes,
        30,
      );
    if (data.deliveryMode !== undefined || data.businessType !== undefined) {
      let businessTypeForMode = data.businessType;
      if (!businessTypeForMode && data.deliveryMode !== undefined) {
        businessTypeForMode = currentMerchant.businessType || "takeaway";
      }
      data.deliveryMode = this.resolveMerchantDeliveryMode(
        businessTypeForMode || "takeaway",
        data.deliveryMode,
      );
    }
    if (currentMerchant.businessType === "dorm_shop") {
      data.deliveryMode = "self_delivery";
      if (data.businessType !== undefined) data.businessType = "dorm_shop";
    }
    const allowedFields = new Set([
      "name",
      "description",
      "logo",
      "cover",
      "businessLicenseUrl",
      "foodSafetyLicenseUrl",
      "phone",
      "contactPerson",
      "address",
      "dormBuilding",
      "dormRoom",
      "latitude",
      "longitude",
      "businessHours",
      "closedNotice",
      "status",
      "regionId",
      "categoryId",
      "businessType",
      "deliveryMode",
      "deliveryFee",
      "minOrderAmount",
      "packagingFee",
      "deliveryTimeMinutes",
    ]);
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([key]) => allowedFields.has(key)),
    );
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: updateData,
    });
  }

  async syncToRegion(regionId: string, userId: string, dto: any) {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { managerUserId: true },
    });
    if (!region) throw new NotFoundException("区域不存在");
    if (region.managerUserId !== userId)
      throw new ForbiddenException("无权同步该区域商家设置");

    const data: any = {};
    if (dto.business_hours !== undefined || dto.businessHours !== undefined) {
      const value = dto.business_hours ?? dto.businessHours;
      data.businessHours = value ? this.normalizeBusinessHours(value) : null;
      if (data.businessHours === null && String(value || "").trim()) {
        throw new BadRequestException(
          "营业时间格式应为 09:00-22:00 或完整每周计划",
        );
      }
    }
    if (dto.is_open !== undefined) {
      // Mini-program compatibility: 0 means open, 1 means resting.
      data.status = Number(dto.is_open) === 0 ? "approved" : "closed";
    }
    if (!Object.keys(data).length)
      throw new BadRequestException("没有可同步的商家设置");

    const result = await this.prisma.merchant.updateMany({
      where: { regionId },
      data,
    });
    return { success: true, updated: result.count };
  }

  async getPrinters(merchantId: string, userId: string) {
    const merchant = await this.assertMerchantOwner(merchantId, userId);
    const printers = await this.prisma.printerConfig.findMany({
      where: { merchantId: merchant.id },
    });
    return {
      list: printers.map((printer) => this.formatPrinterForMini(printer)),
    };
  }

  async addPrinter(userId: string, dto: any) {
    const merchant = await this.assertMerchantOwner(
      dto.merchantId || dto.merchant_id,
      userId,
    );
    const printer = await this.prisma.printerConfig.create({
      data: this.normalizePrinterPayload(dto, merchant.id),
    });
    return this.formatPrinterForMini(printer);
  }

  async updatePrinter(printerId: string, userId: string, dto: any) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: printerId },
    });
    if (!printer) throw new NotFoundException("打印机不存在");
    await this.assertMerchantOwner(printer.merchantId, userId);
    const updated = await this.prisma.printerConfig.update({
      where: { id: printerId },
      data: this.normalizePrinterPayload(dto, undefined, printer),
    });
    return this.formatPrinterForMini(updated);
  }

  async deletePrinter(printerId: string, userId: string) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: printerId },
    });
    if (!printer) throw new NotFoundException("打印机不存在");
    await this.assertMerchantOwner(printer.merchantId, userId);
    await this.prisma.printerConfig.delete({ where: { id: printerId } });
    return { success: true };
  }

  async getMerchantDashboard(merchantId: string, query: any, userId: string) {
    const merchant = await this.assertMerchantOwner(merchantId, userId);
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const customStart = query.start_date
      ? new Date(query.start_date)
      : todayStart;
    const customEnd = query.end_date
      ? new Date(`${query.end_date}T23:59:59.999`)
      : now;
    const validCustom =
      !Number.isNaN(customStart.getTime()) &&
      !Number.isNaN(customEnd.getTime()) &&
      customStart <= customEnd;
    const customSpan = validCustom
      ? Math.max(
          24 * 60 * 60 * 1000,
          customEnd.getTime() - customStart.getTime(),
        )
      : 0;
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const startTime = validCustom
      ? new Date(customStart.getTime() - customSpan)
      : previousMonthStart;
    const [orders, settlements] = await Promise.all([
      this.prisma.order.findMany({
        where: { merchantId, createdAt: { gte: startTime } },
      }),
      this.prisma.merchantSettlement.findMany({
        where: { merchantId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          settlementNo: true,
          amount: true,
          platformFee: true,
          status: true,
          startAt: true,
          endAt: true,
          processedAt: true,
          periodKey: true,
        },
      }),
    ]);
    const commissionRate = this.toNumber(
      (merchant as any).region?.commissionRate,
    );
    const merchantAmount = (order: any) => {
      const goodsAmount = Math.max(
        0,
        this.toNumber(order.totalAmount) -
          this.toNumber(order.originalFreightAmount ?? order.freightAmount),
      );
      const refundAmount =
        order.refundStatus === "partial"
          ? Math.min(goodsAmount, this.toNumber(order.refundAmount))
          : 0;
      return goodsAmount - refundAmount;
    };
    const summary = (from: Date, to = now) => {
      const rows = orders.filter(
        (order) => order.createdAt >= from && order.createdAt <= to,
      );
      const effective = rows.filter(
        (order) =>
          !["PENDING_PAY", "CANCELLED", "REFUNDING", "REFUNDED"].includes(
            order.status,
          ) && !["refunding", "refunded"].includes(order.refundStatus),
      );
      const processing = effective.filter((order) =>
        ["PAID", "SHIPPED", "DELIVERED"].includes(order.status),
      );
      const income = effective.reduce(
        (sum, order) => sum + merchantAmount(order),
        0,
      );
      const processingIncome = processing.reduce(
        (sum, order) => sum + merchantAmount(order),
        0,
      );
      const refundRows = rows.filter(
        (order) =>
          ["REFUNDING", "REFUNDED"].includes(order.status) ||
          ["refunding", "refunded", "partial"].includes(order.refundStatus),
      );
      return {
        income: income.toFixed(2),
        orders: effective.length,
        customers: new Set(effective.map((order) => order.userId)).size,
        processing: processing.length,
        processing_income: processingIncome.toFixed(2),
        refund_orders: refundRows.length,
        refund_amount: refundRows
          .reduce((sum, order) => sum + this.toNumber(order.refundAmount), 0)
          .toFixed(2),
        avg_order: effective.length
          ? (income / effective.length).toFixed(2)
          : "0.00",
        commission_amount: (income * commissionRate).toFixed(2),
      };
    };
    const currentStart =
      query.type === "yesterday"
        ? yesterdayStart
        : query.type === "week"
          ? weekStart
          : query.type === "month"
            ? monthStart
            : query.type === "custom" && validCustom
              ? customStart
              : todayStart;
    const currentEnd =
      query.type === "yesterday"
        ? todayStart
        : query.type === "custom" && validCustom
          ? customEnd
          : now;
    const current = summary(currentStart, currentEnd);
    const previousStart = new Date(
      currentStart.getTime() -
        Math.max(
          24 * 60 * 60 * 1000,
          currentEnd.getTime() - currentStart.getTime(),
        ),
    );
    const previous = summary(previousStart, currentStart);
    const actionRows = await this.prisma.order.findMany({
      where: {
        merchantId,
        status: { in: ["PAID", "SHIPPED"] as any },
        refundStatus: { notIn: ["refunding", "refunded"] },
      },
      select: {
        status: true,
        merchantAcceptTime: true,
        readyTime: true,
        riderId: true,
        fulfillmentStartTime: true,
      },
    });
    const actionableRows = actionRows.filter((order) =>
      this.isFulfillmentDue(order),
    );
    const latestSettlement = settlements[0];
    return {
      overview: {
        today: summary(todayStart),
        yesterday: summary(yesterdayStart, todayStart),
        week: summary(weekStart),
        month: summary(monthStart),
      },
      custom_date: { data: current },
      trends: {
        income: { current: current.income, previous: previous.income },
        orders: { current: current.orders, previous: previous.orders },
        customers: { current: current.customers, previous: previous.customers },
      },
      actionable: {
        pending_accept: actionableRows.filter(
          (order) => order.status === "PAID" && !order.merchantAcceptTime,
        ).length,
        preparing: actionableRows.filter(
          (order) =>
            order.status === "PAID" &&
            order.merchantAcceptTime &&
            !order.readyTime,
        ).length,
        waiting_rider: actionableRows.filter(
          (order) =>
            order.status === "PAID" && order.readyTime && !order.riderId,
        ).length,
      },
      settlement: latestSettlement
        ? {
            settlementNo: latestSettlement.settlementNo,
            status: latestSettlement.status,
            netAmount:
              this.toNumber(latestSettlement.amount) -
              this.toNumber(latestSettlement.platformFee),
            startAt: latestSettlement.startAt,
            endAt: latestSettlement.endAt,
            processedAt: latestSettlement.processedAt,
            isAdjustment: String(latestSettlement.periodKey || "").startsWith(
              "refund-adjustment:",
            ),
          }
        : null,
    };
  }

  async getCategories(query: any = {}) {
    const businessType = query.businessType || query.business_type;
    return this.prisma.category.findMany({
      where: {
        isShow: true,
        parentId: null,
        status: { not: "deleted" },
        ...(businessType ? { businessType } : {}),
      },
      include: {
        children: {
          where: {
            isShow: true,
            status: { not: "deleted" },
            ...(businessType ? { businessType } : {}),
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async createCategory(userId: string, dto: any) {
    const data = await this.normalizeCategoryPayload(dto, userId);
    return this.prisma.category.create({ data });
  }

  async updateCategory(categoryId: string, userId: string, dto: any) {
    const data = await this.normalizeCategoryPayload(dto, userId, true);
    return this.prisma.category.update({ where: { id: categoryId }, data });
  }

  async deleteCategory(categoryId: string, userId: string) {
    await this.prisma.category.update({
      where: { id: categoryId },
      data: { status: "deleted", isShow: false },
    });
    return { success: true };
  }

  async createProduct(userId: string, dto: any) {
    const data = await this.normalizeProductPayload(dto, userId);
    return this.formatProductForMini(
      await this.prisma.product.create({ data }),
    );
  }

  async updateProduct(productId: string, userId: string, dto: any) {
    const current = await this.assertProductOwner(productId, userId);
    const data = await this.normalizeProductPayload(
      dto,
      userId,
      true,
      current.merchantId,
    );
    return this.formatProductForMini(
      await this.prisma.product.update({ where: { id: productId }, data }),
    );
  }

  async deleteProduct(productId: string, userId: string) {
    await this.assertProductOwner(productId, userId);
    await this.prisma.product.update({
      where: { id: productId },
      data: { status: "deleted" },
    });
    return { success: true };
  }

  async deleteSpecOption(optionId: string, userId: string) {
    const sku = await this.prisma.sKU.findUnique({ where: { id: optionId } });
    if (sku) {
      await this.assertProductOwner(sku.productId, userId);
      await this.prisma.sKU.delete({ where: { id: optionId } });
      return { success: true };
    }
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
    });
    if (!option) throw new NotFoundException("规格不存在");
    await this.assertProductOwner(option.productId, userId);
    await this.prisma.productOption.delete({ where: { id: optionId } });
    return { success: true };
  }

  async batchCreateOptions(productId: string, userId: string, dto: any) {
    if (dto.specs !== undefined)
      await this.syncProductSkus(productId, userId, dto.specs, false);
    if (dto.attributes?.length || dto.extras?.length)
      await this.saveProductModifiers(productId, userId, dto);
    await this.assertProductOwner(productId, userId);
    const { items } = dto;
    if (items && Array.isArray(items)) {
      await this.prisma.productOption.createMany({
        data: items.map((item: any) => ({ ...item, productId })),
      });
    }
    return { success: true };
  }

  async batchUpdateOptions(productId: string, userId: string, dto: any) {
    if (dto.specs !== undefined)
      await this.syncProductSkus(productId, userId, dto.specs, true);
    if (dto.attributes?.length || dto.extras?.length)
      await this.saveProductModifiers(productId, userId, dto);
    await this.assertProductOwner(productId, userId);
    const { items } = dto;
    if (items && Array.isArray(items)) {
      const itemIds = items.map((item: any) => item.id).filter(Boolean);
      if (itemIds.length) {
        const ownedOptions = await this.prisma.productOption.findMany({
          where: { id: { in: itemIds }, productId },
          select: { id: true },
        });
        if (ownedOptions.length !== itemIds.length) {
          throw new ForbiddenException("只能管理自己商品的规格");
        }
      }
      for (const item of items) {
        if (item.id) {
          await this.prisma.productOption.update({
            where: { id: item.id },
            data: { name: item.name, values: item.values },
          });
        }
      }
    }
    return { success: true };
  }

  async batchDeleteOptions(productId: string, userId: string, dto: any) {
    await this.assertProductOwner(productId, userId);
    if ((dto.spec_ids || []).map(String).includes("1")) {
      await this.prisma.sKU.deleteMany({ where: { productId } });
      return { success: true };
    }
    const modifierIds = [...(dto.attribute_ids || []), ...(dto.extra_ids || [])]
      .map(String)
      .filter(Boolean);
    if (modifierIds.length) {
      await this.prisma.productModifierOption.deleteMany({
        where: { id: { in: modifierIds }, group: { productId } },
      });
      await this.prisma.productModifierGroup.deleteMany({
        where: { productId, options: { none: {} } },
      });
    }
    const { ids } = dto;
    if (ids && Array.isArray(ids)) {
      await this.prisma.productOption.deleteMany({
        where: { id: { in: ids }, productId },
      });
    }
    return { success: true };
  }

  async getAllOptions(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        skus: { where: { status: "on_sale" }, orderBy: { createdAt: "asc" } },
        modifierGroups: {
          where: { status: "on_sale" },
          include: {
            options: {
              where: { status: "on_sale" },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!product) throw new NotFoundException("商品不存在");
    return {
      specs: product.skus.length
        ? [
            {
              id: 1,
              spec_name: "规格",
              sort_order: 1,
              status: "active",
              options: product.skus.map((sku: any) =>
                this.formatSkuOption(sku),
              ),
            },
          ]
        : [],
      attributes: this.formatModifiersForMini(
        product.modifierGroups,
        "attribute",
      ),
      extras: this.formatModifiersForMini(product.modifierGroups, "extra"),
    };
  }

  async addToCart(userId: string, dto: any) {
    const productId = dto?.product_id || dto?.productId;
    const skuId = dto?.sku_id || dto?.skuId || dto?.option_id || null;
    const quantity = this.toPositiveInt(dto?.quantity, 1);

    if (!productId) {
      throw new BadRequestException("请选择商品");
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: { not: "deleted" } },
      select: {
        id: true,
        status: true,
        stock: true,
        skus: skuId
          ? {
              where: { id: skuId },
              select: { id: true, status: true, stock: true },
              take: 1,
            }
          : false,
      },
    });
    if (!product) {
      throw new NotFoundException("商品不存在或已删除");
    }
    if (product.status !== "on_sale") {
      throw new BadRequestException("商品已下架");
    }
    if (Number(product.stock) <= 0) {
      throw new BadRequestException("商品已售罄");
    }
    if (
      skuId &&
      (!product.skus?.length || product.skus[0].status !== "on_sale")
    ) {
      throw new BadRequestException("商品规格不存在或已下架");
    }
    if (skuId && Number(product.skus?.[0]?.stock) <= 0) {
      throw new BadRequestException("商品规格已售罄");
    }
    const modifierSelections = await this.resolveModifierSelections(
      productId,
      dto,
    );

    const existing = await this.prisma.cart.findFirst({
      where: { userId, productId, skuId, selectionKey: modifierSelections.key },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.cart.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity }, selected: true },
      });
    }

    return this.prisma.cart.create({
      data: {
        userId,
        productId,
        skuId,
        selectionKey: modifierSelections.key,
        modifierSelections: modifierSelections.list,
        quantity,
        selected: true,
      },
    });
  }

  async removeFromCart(userId: string, dto: any) {
    const productId = dto?.product_id || dto?.productId;
    const skuId = dto?.sku_id || dto?.skuId || null;
    if (!productId) {
      throw new BadRequestException("请选择商品");
    }
    const modifierSelections = await this.resolveModifierSelections(
      productId,
      dto,
    );
    await this.prisma.cart.deleteMany({
      where: { userId, productId, skuId, selectionKey: modifierSelections.key },
    });
    return { success: true };
  }

  async clearCart(userId: string, dto: any = {}) {
    const merchantId = dto?.merchant_id || dto?.merchantId;
    await this.prisma.cart.deleteMany({
      where: merchantId ? { userId, product: { merchantId } } : { userId },
    });
    return { success: true };
  }

  async getCart(merchantId: string, userId: string) {
    const [merchant, items, user, defaultAddress] = await Promise.all([
      this.prisma.merchant.findUnique({ where: { id: merchantId } }),
      this.prisma.cart.findMany({
        where: { userId, product: { merchantId } },
        include: { product: true, sku: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          nickname: true,
          avatar: true,
          phone: true,
          profile: { select: { gender: true } },
        },
      }),
      this.prisma.address.findFirst({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
    ]);
    if (!merchant) throw new NotFoundException("商家不存在");
    const modifierOptionIds = [
      ...new Set(
        items
          .flatMap((item: any) =>
            this.parseModifierSelections(item.modifierSelections).map(
              (modifier: any) => modifier.optionId,
            ),
          )
          .filter(Boolean),
      ),
    ];
    const modifierOptions = modifierOptionIds.length
      ? await this.prisma.productModifierOption.findMany({
          where: { id: { in: modifierOptionIds } },
          include: { group: true },
        })
      : [];
    const modifierOptionMap = new Map(
      modifierOptions.map((option: any) => [option.id, option]),
    );
    const formattedItems = items.map((item: any) => {
      const modifiers = this.parseModifierSelections(item.modifierSelections);
      const modifierPrice = modifiers.reduce(
        (sum: number, modifier: any) =>
          sum + this.toNumber(modifier.additionalPrice),
        0,
      );
      const price =
        this.toNumber(item.sku?.price ?? item.product.price, 0) + modifierPrice;
      const image = Array.isArray(item.product.images)
        ? item.product.images[0]
        : item.product.mainImage || item.product.image;
      const productAvailable =
        item.product.status === "on_sale" &&
        Number(item.product.stock) >= item.quantity;
      const skuAvailable =
        !item.skuId ||
        (item.sku?.status === "on_sale" &&
          Number(item.sku?.stock) >= item.quantity);
      const unavailableModifier = modifiers.find((modifier: any) => {
        const option = modifierOptionMap.get(modifier.optionId);
        return (
          !option ||
          option.group?.productId !== item.productId ||
          option.status !== "on_sale" ||
          option.group?.status !== "on_sale" ||
          (option.stock !== null && Number(option.stock) < item.quantity)
        );
      });
      const unavailableReason = !productAvailable
        ? item.product.status === "on_sale"
          ? "商品已售罄"
          : "商品已下架"
        : !skuAvailable
          ? "商品规格已售罄"
          : unavailableModifier
            ? `${unavailableModifier.optionName || "属性或小料"}已下架或售罄`
            : "";
      return {
        cart_id: item.id,
        cart_key: item.id,
        product_id: item.productId,
        sku_id: item.skuId,
        option_id: item.skuId,
        attribute_ids: modifiers
          .filter((modifier: any) => modifier.type === "attribute")
          .map((modifier: any) => modifier.optionId),
        extra_id:
          modifiers.find((modifier: any) => modifier.type === "extra")
            ?.optionId || null,
        selection_key: item.selectionKey || "",
        modifier_selections: modifiers,
        specifications: modifiers
          .map(
            (modifier: any) => `${modifier.groupName}:${modifier.optionName}`,
          )
          .join("、"),
        product_name: item.product.name,
        item_name: item.product.name,
        name: item.product.name,
        product_image: image || "/static/logo.jpg",
        image: image || "/static/logo.jpg",
        item_price: price.toFixed(2),
        price,
        quantity: item.quantity,
        total_price: (price * item.quantity).toFixed(2),
        is_available: productAvailable && skuAvailable && !unavailableModifier,
        unavailable_reason: unavailableReason,
      };
    });
    const productAmount = formattedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const deliveryMode = this.getOrderDeliveryMode(merchant);
    const deliveryFee = this.getDeliveryFee(merchant, deliveryMode);
    const isOpenNow =
      merchant.status === "approved" &&
      this.isMerchantOpenAt(merchant.businessHours, new Date());
    const closedNotice =
      merchant.closedNotice ||
      (!isOpenNow && merchant.status === "approved"
        ? "商家当前不在营业时间，请稍后再试"
        : "");
    const memberDiscount = await this.resolveDeliveryMemberDiscount(
      userId,
      merchant.id,
      deliveryFee,
    ).catch(() => ({ amount: 0, benefitKey: "" }));
    const memberBenefits =
      memberDiscount.amount > 0
        ? [
            {
              benefit_key: memberDiscount.benefitKey,
              title: "会员免配送",
              description: "本单配送费由会员权益抵扣",
              amount: this.toNumber(memberDiscount.amount),
              auto_apply: true,
              can_disable: false,
            },
          ]
        : [];
    return {
      merchant_id: merchant.id,
      merchant_name: merchant.name,
      business_type: merchant.businessType,
      status: merchant.status === "approved" ? 0 : 2,
      status_value: merchant.status,
      raw_status: merchant.status,
      is_open: isOpenNow ? 0 : 1,
      closed_notice: closedNotice,
      closedNotice,
      delivery_mode: this.getDeliveryModeLabel(deliveryMode),
      delivery_mode_value: deliveryMode,
      deliveryMode,
      delivery_mode_label: this.getDeliveryModeLabel(deliveryMode),
      avatar: merchant.logo || "/static/logo.jpg",
      logo: merchant.logo || "/static/logo.jpg",
      business_hours: this.parseBusinessHours(merchant.businessHours),
      businessHours: merchant.businessHours || "",
      request_time: new Date().toISOString(),
      delivery_time: this.toPositiveInt(
        merchant.deliveryTimeMinutes,
        merchant.businessType === "dorm_shop" ? 15 : 30,
      ),
      delivery_interval: 15,
      items: formattedItems,
      goods_amount: productAmount.toFixed(2),
      total_price: (
        productAmount +
        deliveryFee +
        this.toNumber(merchant.packagingFee)
      ).toFixed(2),
      delivery_fee: deliveryFee.toFixed(2),
      member_discount_amount: this.toNumber(memberDiscount.amount).toFixed(2),
      member_benefits: memberBenefits,
      package_fee: this.toMoney(merchant.packagingFee),
      merchant_packaging_fee: "0.00",
      available_coupons_count: 0,
      userInfo: {
        id: user?.id,
        nickname: user?.nickname || "",
        avatar: user?.avatar || "",
        phone: user?.phone || "",
        gender:
          user?.profile?.gender === "MALE"
            ? 1
            : user?.profile?.gender === "FEMALE"
              ? 2
              : 0,
      },
      defaultAddress: defaultAddress
        ? {
            id: defaultAddress.id,
            full_address: defaultAddress.fullAddress || defaultAddress.detail,
            contact: defaultAddress.name,
            phone: defaultAddress.phone,
            gender: defaultAddress.gender,
            latitude: defaultAddress.latitude,
            longitude: defaultAddress.longitude,
            is_default: defaultAddress.isDefault,
            specified_address_id:
              defaultAddress.specifiedAddressId || defaultAddress.id,
            dormitory_number: defaultAddress.dormitoryNumber || "",
          }
        : null,
    };
  }

  async getDeliveryDistance(merchantId: string, userId: string, dto: any) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { region: { select: { distanceLimit: true } } },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    const address = await this.resolveOrderDeliveryAddress(merchant, userId, dto);
    if (merchant.businessType === "dorm_shop") return { delivery_distance_meters: null, source: null };
    const distance = await this.resolveDeliveryDistance(merchant, address);
    if (distance.meters === null)
      throw new BadRequestException("该商家或收货地址缺少配送坐标，请重新选择地址或联系平台处理");
    const distanceLimit = Number(merchant.region?.distanceLimit || 0);
    if (distanceLimit > 0 && distance.meters > distanceLimit)
      throw new BadRequestException(`收货地址超出配送范围（${Math.ceil(distanceLimit / 1000)}km）`);
    return {
      delivery_distance_meters: distance.meters,
      source: distance.source,
      distance_limit_meters: distanceLimit || null,
    };
  }

  async createOrder(merchantId: string, userId: string, dto: any) {
    const orderNo = `ORD${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [merchant, cartItems] = await Promise.all([
      this.prisma.merchant.findUnique({
        where: { id: merchantId },
        include: { region: { select: { distanceLimit: true } } },
      }),
      this.prisma.cart.findMany({
        where: { userId, product: { merchantId }, selected: true },
        include: { product: true, sku: true },
      }),
    ]);
    if (!merchant) throw new NotFoundException("商家不存在");
    if (merchant.status !== "approved")
      throw new BadRequestException(
        merchant.closedNotice || "商家当前未营业，暂不能下单",
      );
    const verifiedAddress = await this.resolveOrderDeliveryAddress(merchant, userId, dto);
    const deliveryDistance = merchant.businessType === "dorm_shop"
      ? { meters: null, source: null }
      : await this.resolveDeliveryDistance(merchant, verifiedAddress);
    const deliveryDistanceMeters = deliveryDistance.meters;
    const distanceLimit = Number(merchant.region?.distanceLimit || 0);
    if (merchant.businessType !== "dorm_shop" && distanceLimit > 0) {
      if (deliveryDistanceMeters === null) {
        throw new BadRequestException("该商家暂未完成配送坐标配置，请联系平台处理");
      }
      if (deliveryDistanceMeters > distanceLimit) {
        throw new BadRequestException(`收货地址超出配送范围（${Math.ceil(distanceLimit / 1000)}km）`);
      }
    }
    const scheduledDeliveryTime =
      dto.delivery_time || dto.deliveryTime
        ? new Date(dto.delivery_time || dto.deliveryTime)
        : null;
    if (
      scheduledDeliveryTime &&
      Number.isNaN(scheduledDeliveryTime.getTime())
    ) {
      throw new BadRequestException("配送时间格式无效");
    }
    if (
      scheduledDeliveryTime &&
      scheduledDeliveryTime.getTime() < Date.now() - 60 * 1000
    ) {
      throw new BadRequestException("配送时间不能早于当前时间");
    }
    // 结算页传的是预计送达时刻；营业校验应落在倒推后的接单/备餐时刻。
    const serviceTime = scheduledDeliveryTime
      ? new Date(
          scheduledDeliveryTime.getTime() -
            this.toPositiveInt(
              merchant.deliveryTimeMinutes,
              merchant.businessType === "dorm_shop" ? 15 : 30,
            ) *
              60 *
              1000,
        )
      : new Date();
    if (!this.isMerchantOpenAt(merchant.businessHours, serviceTime)) {
      throw new BadRequestException(
        `商家当前不在营业时间（${merchant.businessHours}），请调整配送时间后重试`,
      );
    }
    const items = cartItems.map((item: any) => {
      const modifierSelections = this.parseModifierSelections(
        item.modifierSelections,
      );
      const modifierPrice = modifierSelections.reduce(
        (sum: number, modifier: any) =>
          sum + this.toNumber(modifier.additionalPrice),
        0,
      );
      const price =
        this.toNumber(item.sku?.price ?? item.product.price, 0) + modifierPrice;
      const image = Array.isArray(item.product.images)
        ? item.product.images[0]
        : item.product.mainImage || item.product.image;
      return {
        productId: item.productId,
        skuId: item.skuId,
        productName: item.product.name,
        productImage: image || "/static/logo.jpg",
        skuSpecs: {
          name: item.sku?.name || item.sku?.specs || "",
          modifiers: modifierSelections,
        },
        modifierSelections,
        price,
        quantity: item.quantity,
        totalPrice: price * item.quantity,
      };
    });
    if (!items.length)
      throw new BadRequestException("购物车为空，请先选择商品");
    const productAmount = this.roundMoney(
      items.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    const minOrderAmount = this.toNumber(
      merchant.minOrderAmount,
      merchant.businessType === "dorm_shop" ? 0 : 1,
    );
    if (productAmount < minOrderAmount) {
      throw new BadRequestException(
        `商品金额满 ¥${minOrderAmount.toFixed(2)} 才可下单`,
      );
    }
    const deliveryMode = this.getOrderDeliveryMode(
      merchant,
      dto.delivery_mode || dto.deliveryMode,
    );
    const freightAmount = this.getDeliveryFee(merchant, deliveryMode);
    const packagingAmount = this.toNumber(merchant.packagingFee);
    const memberDiscount = await this.resolveDeliveryMemberDiscount(
      userId,
      merchantId,
      freightAmount,
    );
    const couponBenefit = await this.resolveShopUserCoupon(
      this.prisma,
      userId,
      dto.coupon_id || dto.user_coupon_id || dto.userCouponId,
      productAmount,
      merchant,
    );
    const payableFreight = this.roundMoney(
      Math.max(freightAmount - memberDiscount.amount, 0),
    );
    // FIN-P0-007: 所有落库金额统一定点舍入，杜绝浮点尾数写入 Decimal 字段。
    const totalAmount = this.roundMoney(
      productAmount + freightAmount + packagingAmount,
    );
    const discountAmount = this.roundMoney(
      memberDiscount.amount + couponBenefit.discountAmount,
    );
    const payAmount = this.roundMoney(
      Math.max(
        productAmount +
          packagingAmount +
          payableFreight -
          couponBenefit.discountAmount,
        0,
      ),
    );
    // FIN-P0-006: subsidyAmount 只记平台/区域侧承担的补贴；商家自掏的券不算平台补贴。
    const couponPayerType =
      couponBenefit.discountAmount > 0
        ? couponBenefit.campaign?.payerType ||
          (couponBenefit.coupon?.merchantId
            ? "merchant"
            : couponBenefit.coupon?.regionId
              ? "region"
              : "platform")
        : null;
    const platformSubsidyAmount = this.roundMoney(
      memberDiscount.amount +
        (couponPayerType && couponPayerType !== "merchant"
          ? couponBenefit.discountAmount
          : 0),
    );
    const isFreeOrder = payAmount <= 0;
    const order = await this.prisma.$transaction(async (tx) => {
      const claimedCart = await tx.cart.deleteMany({
        where: {
          userId,
          id: { in: cartItems.map((item: any) => item.id) },
          selected: true,
        },
      });
      if (claimedCart.count !== cartItems.length)
        throw new BadRequestException("购物车已变化，请刷新订单页后重试");
      await this.reserveOrderInventory(tx, items);
      const created = await tx.order.create({
        data: {
          orderNo,
          userId,
          merchantId,
          businessType:
            merchant.businessType || dto.business_type || "takeaway",
          deliveryMode,
          totalAmount,
          freightAmount: payableFreight,
          originalFreightAmount: freightAmount,
          deliveryDistanceMeters,
          packagingAmount,
          subsidyAmount: platformSubsidyAmount,
          discountAmount,
          payAmount,
          ...(isFreeOrder
            ? { status: "PAID" as any, payTime: new Date() }
            : {}),
          scheduledDeliveryTime,
          fulfillmentStartTime: scheduledDeliveryTime ? serviceTime : null,
          stockReserved: true,
          receiverName:
            verifiedAddress?.name ||
            dto.receiver_name ||
            dto.delivery_contact ||
            "用户",
          receiverPhone:
            verifiedAddress?.phone ||
            dto.receiver_phone ||
            dto.delivery_phone ||
            "",
          receiverAddress:
            verifiedAddress?.fullAddress ||
            verifiedAddress?.detail ||
            dto.receiver_address ||
            dto.delivery_address ||
            "",
          remark: dto.remarks || dto.remark || "",
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              skuId: item.skuId,
              productName: item.productName,
              productImage: item.productImage,
              skuSpecs: item.skuSpecs,
              modifierSelections: item.modifierSelections,
              price: item.price,
              quantity: item.quantity,
              totalPrice: item.totalPrice,
            })),
          },
        },
        include: { items: true },
      });
      if (isFreeOrder) {
        await tx.orderLog.create({
          data: {
            orderId: created.id,
            action: "PAID",
            fromStatus: "PENDING_PAY",
            toStatus: "PAID",
            operatorType: "system",
            remark: "优惠抵扣完成，无需支付",
          },
        });
      }
      if (
        couponBenefit.discountAmount > 0 &&
        couponBenefit.receive &&
        couponBenefit.coupon
      ) {
        // AUD-P1-065: 原子条件更新 — 只有 status='unused' 且属于当前用户才能核销
        const couponUpdated = await tx.couponReceive.updateMany({
          where: { id: couponBenefit.receive.id, userId, status: "unused" },
          data: { status: "used", usedAt: new Date(), orderNo },
        });
        if (couponUpdated.count === 0) {
          throw new BadRequestException("优惠券已被使用或不可用，请重新下单");
        }
        await tx.coupon.update({
          where: { id: couponBenefit.coupon.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.subsidyLedger
          .create({
            data: {
              subsidyNo: this.subsidyNo(),
              sourceType: "coupon",
              sourceId: couponBenefit.coupon.id,
              benefitKey: couponBenefit.coupon.type,
              campaignId: couponBenefit.campaign?.id || null,
              orderType: "order",
              orderId: created.id,
              orderNo,
              userId,
              payerType:
                couponBenefit.campaign?.payerType ||
                (couponBenefit.coupon.merchantId
                  ? "merchant"
                  : couponBenefit.coupon.regionId
                    ? "region"
                    : "platform"),
              payerId:
                couponBenefit.coupon.merchantId ||
                couponBenefit.coupon.regionId ||
                null,
              receiverType: "merchant",
              receiverId: merchantId,
              amount: couponBenefit.discountAmount,
              status: "pending",
              description: `${couponBenefit.campaign?.title ? `活动${couponBenefit.campaign.title}，` : ""}优惠券核销：${couponBenefit.coupon.name}`,
              metadata: {
                couponReceiveId: couponBenefit.receive.id,
                couponName: couponBenefit.coupon.name,
                couponType: couponBenefit.coupon.type,
                campaignTitle: couponBenefit.campaign?.title || null,
                productAmount,
                freightAmount,
                packagingAmount,
                payAmount,
              },
            },
          })
          .catch(() => undefined);
      }
      if (memberDiscount.benefitKey) {
        await this.membershipService.consumeBenefitWithDb(
          userId,
          memberDiscount.benefitKey,
          {
            targetType: "shop_order",
            targetId: created.id,
            quantity: 1,
            amount: memberDiscount.amount,
            metadata: { merchantId, originalFreight: freightAmount },
          },
          tx,
        );
        await tx.subsidyLedger.create({
          data: {
            subsidyNo: this.subsidyNo(),
            sourceType: "membership",
            benefitKey: memberDiscount.benefitKey,
            orderType: "order",
            orderId: created.id,
            orderNo,
            userId,
            payerType: "platform",
            receiverType: "rider",
            amount: memberDiscount.amount,
            status: "pending",
            description: "会员免配送费平台补贴",
            metadata: {
              merchantId,
              originalFreight: freightAmount,
              payableFreight,
            },
          },
        });
      }
      return created;
    });
    if (isFreeOrder && this.isFulfillmentDue(order)) {
      await this.notifyMerchantForOrder({ ...order, merchant }).catch(
        () => undefined,
      );
      await this.printService.enqueueAutomaticOrder(order.id).catch(() => undefined);
    }
    return {
      success: true,
      message: "订单创建成功",
      order_id: order.id,
      order_no: order.orderNo,
      business_type: order.businessType,
      delivery_mode: deliveryMode,
      delivery_mode_label: this.getDeliveryModeLabel(deliveryMode),
      pay_amount: this.toNumber(order.payAmount),
      payment_required: !isFreeOrder,
      data: order,
    };
  }

  private async resolveDeliveryMemberDiscount(
    userId: string,
    merchantId: string,
    freightAmount: number,
  ) {
    if (freightAmount <= 0) return { amount: 0, benefitKey: "" };
    const benefits = await this.membershipService
      .getUserBenefits(userId)
      .catch(() => null);
    const free = (benefits?.list || []).find(
      (item: any) =>
        item.benefitKey === "delivery_free_quota" &&
        (item.unlimited || item.remainingQuota > 0),
    );
    if (!free) return { amount: 0, benefitKey: "" };
    return {
      amount: freightAmount,
      benefitKey: "delivery_free_quota",
      merchantId,
    };
  }

  async getOrderDetail(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
            logo: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        items: true,
        reviews: {
          where: { userId },
          select: {
            rating: true,
            content: true,
            images: true,
            tags: true,
            reply: true,
            replyAt: true,
            createdAt: true,
          },
          take: 1,
        },
      },
    });
    if (!order || order.userId !== userId)
      throw new NotFoundException("订单不存在");
    const [deliveryNodes, rider] = await Promise.all([
      this.prisma.deliveryOrderNode
        .findMany({
          where: { orderId, orderType: "shop" },
          orderBy: { createdAt: "asc" },
        })
        .catch(() => []),
      order.riderId
        ? this.prisma.regionRider.findUnique({
            where: { userId: order.riderId },
            include: {
              User: {
                select: { id: true, nickname: true, avatar: true, phone: true },
              },
            },
          })
        : null,
    ]);
    const formatted = this.formatDeliveryOrder({ ...order, rider });
    const productAmount = formatted.items.reduce(
      (sum: number, item: any) => sum + this.toNumber(item.total_price),
      0,
    );
    return {
      ...formatted,
      // Compatibility aliases consumed by the existing mini-program detail page.
      product_amount: productAmount,
      delivery_fee: formatted.freight_amount,
      package_fee: formatted.packaging_amount,
      box_fee: 0,
      merchant: {
        id: order.merchant?.id || order.merchantId,
        name: order.merchant?.name || "商家",
        logo: order.merchant?.logo || "/static/logo.jpg",
        phone: order.merchant?.phone || "",
        address: order.merchant?.address || "",
        location: {
          latitude: order.merchant?.latitude || 0,
          longitude: order.merchant?.longitude || 0,
        },
      },
      details: formatted.items,
      actual_amount: formatted.pay_amount,
      delivery_contact: order.receiverName,
      delivery_phone: order.receiverPhone,
      delivery_address: order.receiverAddress,
      daily_order_number:
        String(order.orderNo || "")
          .replace(/\D/g, "")
          .slice(-4) || "0001",
      payment_method: order.payChannel === "WX_PAY" ? "wechat" : "",
      payment: { wx_transaction_id: "" },
      remarks: order.remark || "",
      review: order.reviews?.[0]
        ? {
            rating: order.reviews[0].rating,
            content: order.reviews[0].content || "",
            images: Array.isArray(order.reviews[0].images)
              ? order.reviews[0].images
              : [],
            tags: this.normalizeReviewTags(order.reviews[0].tags),
            merchant_reply: order.reviews[0].reply || "",
            reply_at: order.reviews[0].replyAt || null,
            created_at: order.reviews[0].createdAt,
          }
        : null,
      delivery_track: this.buildDeliveryTrack(
        { ...order, rider },
        deliveryNodes,
      ),
      deliveryNodes,
    };
  }

  async getOrders(userId: string, query: any) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize || query.limit, 20);
    const status = String(query.status || "").trim();
    const keyword = String(query.keyword || "").trim();
    const takeForMerge = page * pageSize;
    const [deliveryRows, errandRows, statistics] = await Promise.all([
      this.prisma.order.findMany({
        where: this.buildDeliveryOrderWhere(userId, status, keyword),
        take: takeForMerge,
        orderBy: { createdAt: "desc" },
        include: {
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              phone: true,
              regionId: true,
            },
          },
          items: true,
          reviews: { where: { userId }, select: { id: true }, take: 1 },
        },
      }),
      this.prisma.errandOrder.findMany({
        where: this.buildErrandOrderWhere(userId, status, keyword),
        take: takeForMerge,
        orderBy: { createdAt: "desc" },
        include: {
          User: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          RegionRider: {
            include: {
              User: { select: { id: true, nickname: true, avatar: true } },
            },
          },
          tasks: { orderBy: { sortOrder: "asc" } },
        },
      }),
      this.getOrderStatistics(userId),
    ]);
    const riderIds = [
      ...new Set(
        deliveryRows
          .map((row) => row.riderId)
          .filter((id): id is string => !!id),
      ),
    ];
    const riders = riderIds.length
      ? await this.prisma.regionRider.findMany({
          where: { userId: { in: riderIds } },
          include: {
            User: {
              select: { id: true, nickname: true, avatar: true, phone: true },
            },
          },
        })
      : [];
    const riderMap = new Map(riders.map((rider: any) => [rider.userId, rider]));
    const orders = [
      ...deliveryRows.map((row) =>
        this.formatDeliveryOrder({
          ...row,
          rider: row.riderId ? riderMap.get(row.riderId) : undefined,
        }),
      ),
      ...errandRows.map((row) => this.formatErrandOrder(row)),
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const total = orders.length;
    const start = (page - 1) * pageSize;
    return {
      orders: orders.slice(start, start + pageSize),
      statistics,
      pagination: {
        page,
        pageSize,
        total,
        has_more: start + pageSize < total,
      },
    };
  }

  async updateOrderStatus(orderId: string, userId: string, dto: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.userId !== userId)
      throw new NotFoundException("订单不存在");

    // 用户端只允许取消待支付订单和确认收货；确认收货是履约终态。
    const requestedStatus = this.normalizeDeliveryStatus(dto.status);

    const allowedUserStatuses = ["CANCELLED", "RECEIVED"];
    if (!allowedUserStatuses.includes(requestedStatus)) {
      throw new BadRequestException(
        `用户端不支持将订单状态更新为 "${dto.status}"。` +
          `待支付订单可取消；已收货订单可确认完成。` +
          `如需退款请联系客服处理。`,
      );
    }

    // 取消只能从待支付状态
    if (requestedStatus === "CANCELLED" && order.status !== "PENDING_PAY") {
      throw new BadRequestException(`订单状态为 ${order.status}，无法取消`);
    }

    // 确认收货只能从已投递状态
    if (requestedStatus === "RECEIVED" && order.status !== "DELIVERED") {
      throw new BadRequestException(`订单状态为 ${order.status}，无法确认收货`);
    }
    if (
      requestedStatus === "RECEIVED" &&
      ["refunding", "refunded"].includes(String(order.refundStatus || "none"))
    ) {
      throw new BadRequestException("订单退款处理中，无法确认收货");
    }

    const status = requestedStatus;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === "CANCELLED") {
        const claimed = await tx.order.updateMany({
          where: { id: orderId, userId, status: "PENDING_PAY" },
          data: {
            status,
            cancelTime: new Date(),
            cancelReason: dto.cancel_reason || dto.cancelReason || "用户取消",
            stockReserved: false,
          },
        });
        if (claimed.count !== 1)
          throw new BadRequestException("订单状态已变化，请刷新后重试");
        await this.restoreOrderInventory(tx, order);
        await this.restoreOrderCoupon(tx, order);
        await this.membershipService.restoreBenefitUsagesForTarget(
          "shop_order",
          order.id,
          tx,
        );
        await tx.subsidyLedger
          .updateMany({
            where: {
              sourceType: "membership",
              orderType: "order",
              orderId: order.id,
            },
            data: { status: "cancelled" },
          })
          .catch(() => undefined);
        await tx.orderLog.create({
          data: {
            orderId,
            action: "CANCELLED",
            fromStatus: "PENDING_PAY",
            toStatus: "CANCELLED",
            operatorId: userId,
            operatorType: "user",
            remark: dto.cancel_reason || dto.cancelReason || "用户取消",
          },
        });
      } else {
        const claimed = await tx.order.updateMany({
          where: {
            id: orderId,
            userId,
            status: "DELIVERED",
            refundStatus: { notIn: ["refunding", "refunded"] },
          },
          data: {
            status: "COMPLETED" as any,
            receiveTime: new Date(),
            completeTime: new Date(),
          },
        });
        if (claimed.count !== 1)
          throw new BadRequestException("订单状态已变化，请刷新后重试");
        await tx.orderLog.create({
          data: {
            orderId,
            action: "COMPLETED",
            fromStatus: "DELIVERED",
            toStatus: "COMPLETED",
            operatorId: userId,
            operatorType: "user",
            remark: "用户确认收货",
          },
        });
        await this.recordDeliveryNode(tx, {
          orderId,
          nodeType: "completed",
          operatorId: userId,
          operatorType: "user",
          riderType: "user",
          displayMode: this.deliveryDisplayModeForOrder(order),
          remark: "用户确认收货",
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              phone: true,
              regionId: true,
            },
          },
          items: true,
          reviews: { where: { userId }, select: { id: true }, take: 1 },
        },
      });
    });
    if (
      status === "RECEIVED" &&
      updated.merchant?.userId &&
      updated.merchant.userId !== userId
    ) {
      await this.notifyService
        .createAndDispatch({
          userId: updated.merchant.userId,
          regionId: updated.merchant.regionId || undefined,
          type: "order",
          scene: "shop_order_received_merchant",
          title: "顾客已确认收货",
          content: `订单 ${updated.orderNo || updated.id} 已由顾客确认收货。`,
          data: {
            orderId: updated.id,
            orderNo: updated.orderNo,
            merchantId: updated.merchantId,
          },
          linkType: "page",
          linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${updated.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined);
    }
    return this.formatDeliveryOrder(updated);
  }

  async expirePendingPayment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order || order.status !== "PENDING_PAY") return false;
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAY" },
        data: {
          status: "CANCELLED",
          cancelTime: new Date(),
          cancelReason: "支付超时自动取消",
          stockReserved: false,
        },
      });
      if (claimed.count !== 1) return false;
      await this.restoreOrderInventory(tx, order);
      await this.restoreOrderCoupon(tx, order);
      await this.membershipService.restoreBenefitUsagesForTarget(
        "shop_order",
        order.id,
        tx,
      );
      await tx.subsidyLedger
        .updateMany({
          where: {
            sourceType: "membership",
            orderType: "order",
            orderId: order.id,
          },
          data: { status: "cancelled" },
        })
        .catch(() => undefined);
      await tx.orderLog.create({
        data: {
          orderId,
          action: "CANCELLED",
          fromStatus: "PENDING_PAY",
          toStatus: "CANCELLED",
          operatorType: "system",
          remark: "支付超时自动取消",
        },
      });
      return true;
    });
  }

  async acceptMerchantOrder(orderId: string, userId: string) {
    const order = await this.getOwnedMerchantOrder(orderId, userId);
    this.assertFulfillmentDue(order);
    if (order.businessType !== "dorm_shop") {
      if (
        order.status !== "PAID" ||
        order.merchantAcceptTime ||
        this.isRefundBlocking(order.refundStatus)
      ) {
        throw new BadRequestException("只有已付款待接单的订单才能确认接单");
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: orderId,
            status: "PAID",
            merchantAcceptTime: null,
            refundStatus: { notIn: ["refunding", "refunded"] },
          },
          data: { merchantAcceptTime: new Date() },
        });
        if (claimed.count !== 1)
          throw new BadRequestException("订单状态已变化，请刷新后重试");
        await tx.orderLog.create({
          data: {
            orderId,
            action: "MERCHANT_ACCEPT",
            fromStatus: "PAID",
            toStatus: "PAID",
            operatorId: userId,
            operatorType: "merchant",
            remark: "商家已接单，开始备餐",
          },
        });
        const row = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            user: {
              select: { id: true, nickname: true, avatar: true, phone: true },
            },
            merchant: {
              select: {
                id: true,
                userId: true,
                name: true,
                logo: true,
                address: true,
                phone: true,
                businessType: true,
                deliveryMode: true,
                regionId: true,
              },
            },
            items: true,
          },
        });
        await this.recordDeliveryNode(tx, {
          orderId,
          nodeType: "merchant_accepted",
          operatorId: userId,
          displayMode: this.deliveryDisplayModeForOrder(order),
          remark: "商家已接单，开始备餐",
        });
        return row;
      });
      await this.notifyBuyerOrderStatus(
        updated,
        "商家已接单",
        `${updated.merchant?.name || "商家"} 已接单，正在备餐`,
      );
      return {
        success: true,
        message: "已确认接单，开始备餐",
        order: this.formatMerchantOrderForMini(updated),
      };
    }
    if (order.status !== "PAID" || this.isRefundBlocking(order.refundStatus)) {
      throw new BadRequestException("只有已付款待接单的订单才能确认接单");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: "PAID",
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: {
          status: "SHIPPED" as any,
          acceptTime: new Date(),
          deliveryDisplayMode: "status_nodes",
        },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      await tx.orderLog.create({
        data: {
          orderId,
          action: "MERCHANT_ACCEPT",
          fromStatus: "PAID",
          toStatus: "SHIPPED",
          operatorId: userId,
          operatorType: "merchant",
          remark: "店主确认接单，开始自送",
        },
      });
      const row = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              address: true,
              phone: true,
              businessType: true,
              deliveryMode: true,
              regionId: true,
            },
          },
          items: true,
        },
      });
      await this.recordDeliveryNode(tx, {
        orderId,
        nodeType: "merchant_accepted",
        operatorId: userId,
        displayMode: "status_nodes",
        remark: "店主确认接单，开始自送",
      });
      return row;
    });
    await this.notifyBuyerOrderStatus(
      updated,
      "店主已接单",
      `${updated.merchant?.name || "宿舍小店"} 已确认订单，正在准备配送`,
    );
    return {
      success: true,
      message: "已确认接单",
      order: this.formatMerchantOrderForMini(updated),
    };
  }

  async completeMerchantOrder(orderId: string, userId: string) {
    const order = await this.getOwnedMerchantOrder(orderId, userId);
    if (order.businessType !== "dorm_shop") {
      throw new BadRequestException("当前接口只处理宿舍小店店主自送订单");
    }
    if (
      order.status !== "SHIPPED" ||
      this.isRefundBlocking(order.refundStatus)
    ) {
      throw new BadRequestException("只有配送中的订单才能标记完成");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: "SHIPPED",
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: {
          status: "DELIVERED" as any,
          deliverTime: new Date(),
        },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      await tx.orderLog.create({
        data: {
          orderId,
          action: "MERCHANT_DELIVERED",
          fromStatus: "SHIPPED",
          toStatus: "DELIVERED",
          operatorId: userId,
          operatorType: "merchant",
          remark: "店主已送达，等待用户确认收货",
        },
      });
      const row = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              address: true,
              phone: true,
              businessType: true,
              deliveryMode: true,
              regionId: true,
            },
          },
          items: true,
        },
      });
      await this.recordDeliveryNode(tx, {
        orderId,
        nodeType: "merchant_delivered",
        operatorId: userId,
        displayMode: this.deliveryDisplayModeForOrder(order),
        remark: "店主已送达，等待用户确认收货",
      });
      return row;
    });
    await this.notifyBuyerOrderStatus(
      updated,
      "订单已送达",
      `${updated.merchant?.name || "宿舍小店"} 已送达，请确认收货`,
    );
    return {
      success: true,
      message: "已标记送达，等待用户确认收货",
      order: this.formatMerchantOrderForMini(updated),
    };
  }

  async readyMerchantOrder(orderId: string, userId: string) {
    const order = await this.getOwnedMerchantOrder(orderId, userId);
    this.assertFulfillmentDue(order);
    if (order.businessType === "dorm_shop") {
      throw new BadRequestException("宿舍小店请在自配送完成后标记送达");
    }
    if (
      order.status !== "PAID" ||
      !order.merchantAcceptTime ||
      order.readyTime ||
      this.isRefundBlocking(order.refundStatus)
    ) {
      throw new BadRequestException("只有备餐中的订单才能标记备餐完成");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: "PAID",
          merchantAcceptTime: { not: null },
          readyTime: null,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: { readyTime: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("订单状态已变化，请刷新后重试");
      await tx.orderLog.create({
        data: {
          orderId,
          action: "MERCHANT_READY",
          fromStatus: "PAID",
          toStatus: "PAID",
          operatorId: userId,
          operatorType: "merchant",
          remark: "商家备餐完成，等待骑手接单",
        },
      });
      const row = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
          merchant: {
            select: {
              id: true,
              userId: true,
              name: true,
              logo: true,
              address: true,
              phone: true,
              businessType: true,
              deliveryMode: true,
              regionId: true,
            },
          },
          items: true,
        },
      });
      await this.recordDeliveryNode(tx, {
        orderId,
        nodeType: "merchant_ready",
        operatorId: userId,
        displayMode: this.deliveryDisplayModeForOrder(order),
        remark: "商家备餐完成，等待骑手接单",
      });
      return row;
    });
    await Promise.all([
      this.notifyBuyerOrderStatus(
        updated,
        "餐品已备好",
        `${updated.merchant?.name || "商家"} 已备餐完成，正在为您匹配骑手`,
      ),
      this.notifyAvailableShopRiders(updated),
    ]);
    return {
      success: true,
      message: "已标记备餐完成，订单已进入骑手大厅",
      order: this.formatMerchantOrderForMini(updated),
    };
  }

  async sendOrderNotification(userId: string, dto: any) {
    const orderId = dto.orderId || dto.order_id;
    const order = await this.getOwnedMerchantOrder(orderId, userId);
    if (!order) throw new NotFoundException("订单不存在");
    if (this.isRefundBlocking(order.refundStatus))
      return { success: true, message: "订单退款处理中，暂不能通知骑手" };
    if (!this.isFulfillmentDue(order))
      return { success: true, message: "预约订单尚未到履约时间" };
    if (
      order.businessType !== "dorm_shop" &&
      order.status === "PAID" &&
      order.readyTime &&
      !order.riderId
    ) {
      const since = new Date(Date.now() - 5 * 60 * 1000);
      const recent = await this.prisma.orderLog.findFirst({
        where: {
          orderId: order.id,
          action: "MERCHANT_RIDER_REMINDER",
          createdAt: { gte: since },
        },
      });
      if (recent) return { success: true, message: "已提醒骑手，请稍候再试" };
      const notified = await this.notifyAvailableShopRiders(order);
      if (!notified)
        return {
          success: true,
          message: "当前没有可通知的在线骑手，请稍后再试",
        };
      await this.prisma.orderLog.create({
        data: {
          orderId: order.id,
          action: "MERCHANT_RIDER_REMINDER",
          fromStatus: "PAID",
          toStatus: "PAID",
          operatorId: userId,
          operatorType: "merchant",
          remark: "商家手动提醒骑手接单",
        },
      });
      return { success: true, message: "已提醒骑手接单" };
    }
    await this.notifyMerchantForOrder(order);
    return { success: true, message: "订单通知发送成功" };
  }

  async printOrder(userId: string, dto: any) {
    const { orderId } = dto;
    const order = await this.getOwnedMerchantOrder(orderId, userId);
    return this.printService.reprintOrder(order.id, order.merchantId);
  }

  async getReviewStats(merchantId: string, regionId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { merchantId, status: "active" },
    });
    const totalReviews = reviews.length;
    const ratingStats = [5, 4, 3, 2, 1].map((rating) => {
      const count = reviews.filter((review) => review.rating === rating).length;
      return {
        rating,
        count,
        percentage: totalReviews ? Math.round((count * 100) / totalReviews) : 0,
      };
    });
    const tagCounts = new Map<string, number>();
    reviews.forEach((review) =>
      this.normalizeReviewTags(review.tags).forEach((tag) =>
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1),
      ),
    );
    return {
      code: 0,
      data: {
        average_rating: totalReviews
          ? Math.round(
              (reviews.reduce((sum, review) => sum + review.rating, 0) * 10) /
                totalReviews,
            ) / 10
          : 0,
        total_reviews: totalReviews,
        rating_stats: ratingStats,
        tags: [
          { id: 0, name: "全部", count: totalReviews },
          ...Array.from(tagCounts, ([name, count]) => ({
            id: name,
            name,
            count,
          })),
        ],
      },
    };
  }

  async getReviews(merchantId: string, query: any) {
    const page = this.toPositiveInt(query?.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query?.page_size, 10), 50);
    const tags = String(query?.tag_ids || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const where: any = { merchantId, status: "active" };
    if (tags.length)
      where.OR = tags.map((tag) => ({ tags: { array_contains: [tag] } }));
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { nickname: true, avatar: true } },
          order: {
            select: {
              createdAt: true,
              items: { select: { productName: true } },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      code: 0,
      data: {
        reviews: reviews.map((review) => ({
          id: review.id,
          username: review.isAnonymous
            ? "匿名用户"
            : review.user?.nickname || "用户",
          user_avatar: review.isAnonymous
            ? "/static/logo.jpg"
            : review.user?.avatar || "/static/logo.jpg",
          rating: review.rating,
          content: review.content || "",
          images: Array.isArray(review.images) ? review.images : [],
          tags: this.normalizeReviewTags(review.tags),
          merchant_reply: review.reply || "",
          order_time: review.order?.createdAt || null,
          order_items:
            review.order?.items
              .map((item) => item.productName)
              .filter(Boolean) || [],
          created_at: review.createdAt,
        })),
        total,
        page,
        page_size: pageSize,
      },
    };
  }

  async submitReview(userId: string, dto: any) {
    const orderId = String(dto?.order_id || dto?.orderId || "").trim();
    if (!orderId) throw new BadRequestException("缺少订单ID");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productId: true } },
        merchant: { select: { userId: true, regionId: true } },
      },
    });
    if (!order || order.userId !== userId)
      throw new NotFoundException("订单不存在");
    if (
      ["refunding", "refunded"].includes(String(order.refundStatus || "none"))
    )
      throw new BadRequestException("订单退款处理中或已退款，无法评价");
    if (!["RECEIVED", "COMPLETED"].includes(String(order.status)))
      throw new BadRequestException("确认收货后才能评价");
    if (
      await this.prisma.review.findFirst({
        where: { orderId, userId },
        select: { id: true },
      })
    ) {
      throw new BadRequestException("该订单已评价");
    }
    const productId = String(
      dto?.product_id || dto?.productId || order.items[0]?.productId || "",
    ).trim();
    if (
      !productId ||
      !order.items.some((item: any) => item.productId === productId)
    )
      throw new BadRequestException("评价商品不属于该订单");
    const rating = Number(dto?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new BadRequestException("评分需为1至5星");
    const content = String(dto?.content ?? "").trim();
    if (content.length > 500)
      throw new BadRequestException("评价内容不能超过500字");
    const images = this.normalizeReviewImages(dto?.images);
    const tags = this.normalizeReviewSubmissionTags(dto?.tags);
    let review: any;
    try {
      review = await this.prisma.review.create({
        data: {
          userId,
          orderId,
          productId,
          merchantId: order.merchantId,
          rating,
          content: content || null,
          images,
          isAnonymous: Boolean(dto?.is_anonymous ?? dto?.isAnonymous),
          tags,
          dedupeKey: `${orderId}:${userId}`,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new BadRequestException("该订单已评价");
      throw error;
    }
    if (order.merchant?.userId) {
      await this.notifyService
        .createAndDispatch({
          userId: order.merchant.userId,
          regionId: order.merchant.regionId || undefined,
          type: "order",
          scene: "shop_order_review",
          title: "收到新的顾客评价",
          content: `订单 ${order.orderNo || order.id} 收到 ${rating} 星评价。`,
          data: {
            orderId: order.id,
            merchantId: order.merchantId,
            reviewId: review.id,
          },
          linkType: "page",
          linkValue: `/pagesA/merchantreview/merchantreview?merchant_id=${order.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        })
        .catch(() => undefined);
    }
    return { code: 0, data: review };
  }

  async replyToReview(id: string, userId: string, dto: any) {
    const reply = String(dto?.reply || "").trim();
    if (!reply) throw new BadRequestException("回复内容不能为空");
    if (reply.length > 500)
      throw new BadRequestException("回复内容不能超过500字");

    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        merchantId: true,
        userId: true,
        orderId: true,
        status: true,
      },
    });
    if (!review) throw new NotFoundException("评价不存在");
    if (String(review.status || "active") !== "active")
      throw new BadRequestException("该评价已隐藏，无法回复");
    if (!review.merchantId) throw new BadRequestException("评价未关联商家");

    const merchant = await this.assertMerchantOwner(review.merchantId, userId);

    const updated = await this.prisma.review.update({
      where: { id },
      data: { reply, replyAt: new Date() },
    });
    await this.notifyService
      .createAndDispatch({
        userId: review.userId,
        regionId: merchant.regionId || undefined,
        type: "order",
        scene: "shop_review_merchant_reply",
        title: "商家回复了你的评价",
        content: `${merchant.name || "商家"} 已回复你的订单评价。`,
        data: {
          orderId: review.orderId,
          merchantId: review.merchantId,
          reviewId: review.id,
        },
        linkType: "page",
        linkValue: `/pagesA/order/order-detail/order-detail?id=${review.orderId}`,
        channelMask: { inApp: true, websocket: true },
      })
      .catch(() => undefined);
    return updated;
  }

  async getPopularTags(regionId: string) {
    return [];
  }

  private normalizeReviewTags(value: any) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value.map((tag) => String(tag || "").trim()).filter(Boolean),
          ),
        ].slice(0, 6)
      : [];
  }

  private normalizeReviewSubmissionTags(value: any) {
    if (value !== undefined && !Array.isArray(value))
      throw new BadRequestException("评价标签格式不正确");
    if (
      Array.isArray(value) &&
      value.some((tag) => String(tag || "").trim().length > 20)
    ) {
      throw new BadRequestException("单个评价标签不能超过20字");
    }
    return this.normalizeReviewTags(value);
  }

  private normalizeReviewImages(value: any) {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      value.length > 6 ||
      value.some(
        (url) =>
          typeof url !== "string" ||
          !/^(https?:\/\/|\/uploads\/)/.test(url.trim()),
      )
    ) {
      throw new BadRequestException("评价图片格式不正确");
    }
    return value.map((url) => url.trim());
  }

  private async assertMerchantOwner(merchantId: string, userId: string) {
    const id = this.toOptionalStringOrNull(merchantId);
    if (!id || id === "0") throw new BadRequestException("请选择商家");
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { region: { select: { commissionRate: true } } },
    });
    if (!merchant) throw new NotFoundException("商家不存在");
    if (merchant.userId !== userId)
      throw new ForbiddenException("只能管理自己的小店");
    return merchant;
  }

  private normalizePrinterPayload(dto: any, merchantId?: string, current?: any) {
    const data: any = {};
    const name = this.toOptionalStringOrNull(dto.printerName ?? dto.name);
    const sn = this.toOptionalStringOrNull(dto.machineCode ?? dto.sn);
    if (merchantId) data.merchantId = merchantId;
    if (name !== null) data.name = name;
    if (sn !== null) data.sn = sn;
    if (dto.printerType !== undefined || dto.brand !== undefined) {
      const brand = this.toOptionalStringOrNull(dto.printerType ?? dto.brand) || "feie";
      data.brand = ['yly', 'xpyun', 'gprinter'].includes(brand) ? brand : 'feie';
    }
    Object.assign(data, this.printService.prepareConnection(data.brand || current?.brand || 'feie', dto, current));
    if (dto.isEnabled !== undefined || dto.autoPrint !== undefined) {
      data.autoPrint = dto.isEnabled ?? dto.autoPrint;
    }
    if (dto.isDefault !== undefined) data.isDefault = Boolean(dto.isDefault);
    if (dto.status !== undefined) data.status = String(dto.status);
    if (merchantId && (!data.name || !data.sn))
      throw new BadRequestException("请输入打印机名称和机器号");
    return data;
  }

  private formatPrinterForMini(printer: any) {
    const { key, credentialCiphertext, ...safe } = printer;
    return {
      ...safe,
      printerName: safe.name,
      printerType: ['yly', 'xpyun', 'gprinter'].includes(safe.brand) ? safe.brand : 'feie',
      machineCode: safe.sn,
      printerKey: '',
      keyConfigured: Boolean(key),
      credentialConfigured: Boolean(credentialCiphertext),
      isEnabled: safe.autoPrint,
    };
  }

  private async assertProductOwner(productId: string, userId: string) {
    const id = this.toOptionalStringOrNull(productId);
    if (!id) throw new BadRequestException("请选择商品");
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!product) throw new NotFoundException("商品不存在");
    if (product.merchant?.userId !== userId)
      throw new ForbiddenException("只能管理自己的商品");
    return product;
  }

  private async resolveManageMerchantIds(merchantId: string, userId: string) {
    if (merchantId === "0") {
      const merchants = await this.prisma.merchant.findMany({
        where: { userId, status: { in: ["approved", "closed"] } },
        select: { id: true },
      });
      return merchants.length
        ? merchants.map((merchant) => merchant.id)
        : ["__empty__"];
    }
    const merchant = await this.assertMerchantOwner(merchantId, userId);
    return [merchant.id];
  }

  private async getOwnedMerchantOrder(orderId: string, userId: string) {
    const id = this.toOptionalStringOrNull(orderId);
    if (!id) throw new BadRequestException("请选择订单");
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true, phone: true },
        },
        merchant: {
          select: {
            id: true,
            userId: true,
            name: true,
            logo: true,
            address: true,
            phone: true,
            businessType: true,
            deliveryMode: true,
            regionId: true,
          },
        },
        items: true,
      },
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.merchant?.userId !== userId)
      throw new ForbiddenException("只能处理自己小店的订单");
    return order;
  }

  private applyTimeRange(where: any, query: any = {}) {
    const range = String(query.time_range || query.timeRange || "all");
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    const dayStart = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (range === "today") {
      start = dayStart(now);
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    } else if (range === "yesterday") {
      end = dayStart(now);
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === "last7days" || range === "week") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === "last30days" || range === "month") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === "thisMonth") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "lastMonth") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "custom") {
      start = query.start_date ? new Date(query.start_date) : null;
      end = query.end_date ? new Date(query.end_date) : null;
    }
    if (start || end) {
      where.createdAt = {};
      if (start && !Number.isNaN(start.getTime())) where.createdAt.gte = start;
      if (end && !Number.isNaN(end.getTime())) where.createdAt.lt = end;
    }
  }

  private async getMerchantOrderStatistics(
    merchantIds: string[],
    query: any = {},
  ) {
    const where: any = { merchantId: { in: merchantIds } };
    this.applyTimeRange(where, query);
    const rows = await this.prisma.order.findMany({
      where,
      select: {
        status: true,
        payAmount: true,
        refundStatus: true,
        refundAmount: true,
        userId: true,
      },
    });
    const total = rows.length;
    const effectiveRows = rows.filter(
      (row) =>
        !["PENDING_PAY", "CANCELLED", "REFUNDED"].includes(
          String(row.status),
        ) && !["refunding", "refunded"].includes(String(row.refundStatus)),
    );
    const completed = effectiveRows.filter((row) =>
      ["DELIVERED", "RECEIVED", "COMPLETED"].includes(String(row.status)),
    ).length;
    const cancelled = rows.filter(
      (row) =>
        ["CANCELLED", "REFUNDED"].includes(String(row.status)) ||
        row.refundStatus === "refunded",
    ).length;
    const amount = effectiveRows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          this.toNumber(row.payAmount) - this.toNumber(row.refundAmount),
        ),
      0,
    );
    return {
      total_orders: total,
      effective_amount: amount.toFixed(2),
      unique_customers: new Set(effectiveRows.map((row) => row.userId)).size,
      completion_rate: total ? Math.round((completed / total) * 100) : 0,
      cancellation_rate: total ? Math.round((cancelled / total) * 100) : 0,
      avg_order_amount: effectiveRows.length
        ? (amount / effectiveRows.length).toFixed(2)
        : "0.00",
    };
  }

  private async normalizeCategoryPayload(
    dto: any,
    userId: string,
    partial = false,
  ) {
    const merchantId = this.toOptionalStringOrNull(
      dto.merchant_id || dto.merchantId,
    );
    const merchant = merchantId
      ? await this.assertMerchantOwner(merchantId, userId)
      : null;
    const name = this.toOptionalStringOrNull(dto.category_name ?? dto.name);
    if (!partial && !name) throw new BadRequestException("请输入分类名称");
    const data: any = {};
    if (name !== null) data.name = name;
    if (dto.category_image !== undefined || dto.icon !== undefined)
      data.icon = this.toOptionalStringOrNull(dto.category_image ?? dto.icon);
    if (dto.sort_order !== undefined || dto.sortOrder !== undefined)
      data.sortOrder = this.toPositiveInt(dto.sort_order ?? dto.sortOrder, 1);
    if (dto.is_visible !== undefined || dto.isShow !== undefined)
      data.isShow = Boolean(dto.is_visible ?? dto.isShow);
    if (
      dto.businessType !== undefined ||
      dto.business_type !== undefined ||
      merchant
    )
      data.businessType =
        merchant?.businessType ||
        dto.businessType ||
        dto.business_type ||
        "takeaway";
    if (!partial) {
      data.type = "product";
      data.status = "active";
      if (!data.businessType) data.businessType = "takeaway";
    }
    return data;
  }

  private async normalizeProductPayload(
    dto: any,
    userId: string,
    partial = false,
    fallbackMerchantId?: string,
  ) {
    const merchantId = this.toOptionalStringOrNull(
      fallbackMerchantId || dto.merchant_id || dto.merchantId,
    );
    if (!partial && !merchantId) throw new BadRequestException("请选择商家");
    const merchant = merchantId
      ? await this.assertMerchantOwner(merchantId, userId)
      : null;
    const data: any = {};
    if (merchant) data.merchantId = merchant.id;
    if (dto.category_id !== undefined || dto.categoryId !== undefined) {
      const categoryId = this.toOptionalStringOrNull(
        dto.category_id ?? dto.categoryId,
      );
      data.categoryId =
        categoryId && categoryId !== "default" ? categoryId : null;
    }
    const name = this.toOptionalStringOrNull(dto.product_name ?? dto.name);
    if (!partial && !name) throw new BadRequestException("请输入商品名称");
    if (name !== null) data.name = name;
    if (
      dto.product_image !== undefined ||
      dto.image !== undefined ||
      dto.images !== undefined
    ) {
      const images = Array.isArray(dto.images)
        ? dto.images.filter(Boolean)
        : [this.toOptionalStringOrNull(dto.product_image ?? dto.image)].filter(
            Boolean,
          );
      data.images = images.length ? images : ["/static/logo.jpg"];
    }
    if (dto.description !== undefined || dto.detail !== undefined)
      data.detail = this.toOptionalStringOrNull(dto.description ?? dto.detail);
    const priceValue = dto.sale_price ?? dto.price;
    if (priceValue !== undefined) {
      const price = Number(priceValue);
      if (!Number.isFinite(price) || price < 0)
        throw new BadRequestException("商品售价不正确");
      data.price = Math.round(price * 100) / 100;
    } else if (!partial) {
      throw new BadRequestException("请输入商品售价");
    }
    const originPriceValue = dto.original_price ?? dto.originPrice;
    if (originPriceValue !== undefined) {
      data.originPrice =
        originPriceValue === "" || originPriceValue === null
          ? null
          : Math.round(Number(originPriceValue) * 100) / 100;
    }
    if (
      dto.total_stock !== undefined ||
      dto.stock !== undefined ||
      dto.daily_stock !== undefined
    ) {
      data.stock = Math.max(
        0,
        Math.floor(
          Number(dto.total_stock ?? dto.stock ?? dto.daily_stock) || 0,
        ),
      );
    }
    if (dto.unit !== undefined)
      data.unit = this.toOptionalStringOrNull(dto.unit);
    if (dto.weight !== undefined)
      data.weight =
        dto.weight === "" || dto.weight === null
          ? null
          : Math.max(0, Math.floor(Number(dto.weight) || 0));
    if (dto.is_hot !== undefined || dto.isHot !== undefined)
      data.isHot = Boolean(dto.is_hot ?? dto.isHot);
    if (dto.sort_order !== undefined || dto.sortOrder !== undefined)
      data.sortOrder = this.toPositiveInt(dto.sort_order ?? dto.sortOrder, 0);
    if (
      dto.status !== undefined ||
      dto.product_status !== undefined ||
      dto.is_available !== undefined
    ) {
      const status = String(dto.status || dto.product_status || "").trim();
      data.status =
        dto.is_available === false || status === "off_sale"
          ? "off_sale"
          : status === "deleted"
            ? "deleted"
            : "on_sale";
    } else if (!partial) {
      data.status = "on_sale";
    }
    if (!partial && data.images === undefined)
      data.images = ["/static/logo.jpg"];
    return data;
  }

  private formatSkuOption(sku: any) {
    const specs =
      typeof sku.specs === "string"
        ? sku.specs
        : Array.isArray(sku.specs)
          ? sku.specs
              .map((item: any) => item?.value || item?.name || String(item))
              .join(" / ")
          : Object.values(sku.specs || {}).join(" / ");
    return {
      id: sku.id,
      option_name: specs || "默认规格",
      external_price: this.toNumber(sku.price),
      in_store_price: this.toNumber(sku.price),
      daily_stock: sku.stock,
      status: sku.status,
    };
  }

  private async syncProductSkus(
    productId: string,
    userId: string,
    specs: any,
    replace: boolean,
  ) {
    await this.assertProductOwner(productId, userId);
    const groups = Array.isArray(specs) ? specs : [];
    if (groups.length > 1)
      throw new BadRequestException("当前仅支持一组 SKU 规格");
    const options = groups.flatMap((group: any) =>
      Array.isArray(group?.options) ? group.options : [],
    );
    const current = await this.prisma.sKU.findMany({
      where: { productId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((sku) => sku.id));
    const keptIds = new Set<string>();

    for (const option of options) {
      const name = String(option?.option_name || "").trim();
      const price = Number(option?.external_price);
      const stock = Number(option?.daily_stock);
      if (
        !name ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(stock) ||
        stock < 0
      ) {
        throw new BadRequestException("请完整填写 SKU 名称、售价和库存");
      }
      const data = {
        specs: name,
        price: Math.round(price * 100) / 100,
        stock: Math.floor(stock),
        status: "on_sale",
      };
      if (option.id && currentIds.has(String(option.id))) {
        keptIds.add(String(option.id));
        await this.prisma.sKU.update({
          where: { id: String(option.id) },
          data,
        });
      } else {
        const sku = await this.prisma.sKU.create({
          data: { productId, ...data },
        });
        keptIds.add(sku.id);
      }
    }
    if (replace)
      await this.prisma.sKU.deleteMany({
        where: { productId, id: { notIn: [...keptIds] } },
      });
    return { success: true };
  }

  private formatModifiersForMini(groups: any[] = [], type: string) {
    return groups
      .filter((group: any) => group.type === type)
      .flatMap((group: any) =>
        (group.options || []).map((option: any) => ({
          id: option.id,
          group_id: group.id,
          attribute_name: type === "attribute" ? group.name : undefined,
          extra_name: type === "extra" ? group.name : undefined,
          is_single: group.maxSelect <= 1 ? 1 : 0,
          is_required: group.isRequired ? 1 : 0,
          max_quantity: group.maxSelect,
          option_name: option.name,
          additional_price: this.toNumber(option.price),
          stock: option.stock,
          sort_order: option.sortOrder,
        })),
      );
  }

  private parseModifierSelections(value: any): any[] {
    return Array.isArray(value) ? value : [];
  }

  private async resolveModifierSelections(productId: string, dto: any) {
    const optionIds = [
      ...(dto.attribute_ids || dto.attributeIds || []),
      dto.extra_id || dto.extraId,
    ]
      .filter(Boolean)
      .map(String);
    const uniqueIds = [...new Set(optionIds)];
    const groups = await this.prisma.productModifierGroup.findMany({
      where: { productId, status: "on_sale" },
      include: { options: { where: { status: "on_sale" } } },
    });
    if (!uniqueIds.length) {
      if (groups.some((group: any) => group.isRequired))
        throw new BadRequestException("请选择必选属性");
      return { key: "", list: [] };
    }
    const byOptionId = new Map<string, any>();
    groups.forEach((group: any) =>
      (group.options || []).forEach((option: any) =>
        byOptionId.set(option.id, { group, option }),
      ),
    );
    const selected = uniqueIds.map((id) => byOptionId.get(id));
    if (selected.some((item) => !item))
      throw new BadRequestException("所选属性或小料已下架");
    const selectedCount = new Map<string, number>();
    for (const { group } of selected)
      selectedCount.set(group.id, (selectedCount.get(group.id) || 0) + 1);
    for (const group of groups) {
      const count = selectedCount.get(group.id) || 0;
      if (group.isRequired && count === 0)
        throw new BadRequestException(`请选择${group.name}`);
      if (count > group.maxSelect)
        throw new BadRequestException(
          `${group.name}最多选择${group.maxSelect}项`,
        );
    }
    const list = selected
      .map(({ group, option }) => {
        if (option.stock !== null && option.stock <= 0)
          throw new BadRequestException(`${option.name} 已售罄`);
        return {
          groupId: group.id,
          groupName: group.name,
          type: group.type,
          optionId: option.id,
          optionName: option.name,
          additionalPrice: this.toNumber(option.price),
        };
      })
      .sort((a, b) => a.optionId.localeCompare(b.optionId));
    return { key: list.map((item) => item.optionId).join("|"), list };
  }

  private async saveProductModifiers(
    productId: string,
    userId: string,
    dto: any,
  ) {
    await this.assertProductOwner(productId, userId);
    const groupCache = new Map<string, any>();
    for (const [type, source] of [
      ["attribute", dto.attributes || []],
      ["extra", dto.extras || []] as any,
    ]) {
      for (const item of source as any[]) {
        const groupName = String(
          type === "attribute" ? item.attribute_name : item.extra_name || "",
        ).trim();
        const optionName = String(item.option_name || "").trim();
        const price = Number(item.additional_price || 0);
        if (!groupName || !optionName || !Number.isFinite(price) || price < 0) {
          throw new BadRequestException("请完整填写属性/小料名称和加价");
        }
        const key = `${type}:${groupName}`;
        let group = groupCache.get(key);
        if (!group) {
          group =
            (await this.prisma.productModifierGroup.findFirst({
              where: { productId, type, name: groupName },
            })) ||
            (await this.prisma.productModifierGroup.create({
              data: {
                productId,
                type,
                name: groupName,
                isRequired: type === "attribute",
                maxSelect: Math.max(1, Number(item.max_quantity || 1)),
                sortOrder: Number(item.sort_order || 0),
              },
            }));
          groupCache.set(key, group);
        }
        const rawStock = item.stock;
        const hasStock =
          type === "extra" &&
          rawStock !== undefined &&
          rawStock !== null &&
          rawStock !== "";
        if (
          hasStock &&
          (!Number.isFinite(Number(rawStock)) || Number(rawStock) < 0)
        ) {
          throw new BadRequestException("小料库存必须是非负整数");
        }
        const stock = hasStock ? Math.floor(Number(rawStock)) : null;
        const data = {
          name: optionName,
          price: Math.round(price * 100) / 100,
          stock,
          sortOrder: Number(item.sort_order || 0),
          status: "on_sale",
        };
        if (item.id) {
          const option = await this.prisma.productModifierOption.findFirst({
            where: { id: String(item.id), group: { productId } },
          });
          if (!option)
            throw new ForbiddenException("只能管理自己商品的属性和小料");
          await this.prisma.productModifierOption.update({
            where: { id: option.id },
            data,
          });
        } else {
          await this.prisma.productModifierOption.create({
            data: { groupId: group.id, ...data },
          });
        }
      }
    }
  }

  private formatCategoryForMini(category: any, products: any[] = []) {
    const goods = products.map((product) => this.formatProductForMini(product));
    return {
      id: category.id,
      category_id: category.id,
      name: category.name,
      category_name: category.name,
      category_image: category.icon || "",
      sort_order: category.sortOrder || 0,
      is_visible: category.isShow ? 1 : 0,
      must_select: 0,
      sale_period: null,
      count: goods.length,
      products: goods,
      goods,
    };
  }

  private formatMerchantOrderForMini(order: any, rider?: any) {
    const items = (order.items || []).map((item: any) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      product_image: item.productImage || "/static/logo.jpg",
      sku_id: item.skuId,
      specifications: item.skuSpecs || {},
      modifier_selections: this.parseModifierSelections(
        item.modifierSelections,
      ),
      unit_price: this.toMoney(item.price),
      price: this.toNumber(item.price),
      quantity: item.quantity,
      total_price: this.toMoney(item.totalPrice),
    }));
    const payAmount = this.toNumber(order.payAmount);
    const freightAmount = this.toNumber(order.freightAmount);
    const packagingAmount = this.toNumber(order.packagingAmount);
    const itemAmount = items.reduce(
      (sum: number, item: any) => sum + Number(item.total_price || 0),
      0,
    );
    return {
      id: order.id,
      order_id: order.id,
      order_no: order.orderNo,
      daily_order_number:
        String(order.orderNo || "")
          .replace(/\D/g, "")
          .slice(-4) || "0001",
      business_type: order.businessType || "takeaway",
      raw_status: order.status,
      status: this.toMerchantMiniStatus(order),
      merchant_accept_time: order.merchantAcceptTime || null,
      rider_id: order.riderId || null,
      refund_status: order.refundStatus || "none",
      refund_amount: this.toNumber(order.refundAmount),
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      delivery_time: order.scheduledDeliveryTime || order.createdAt,
      scheduled_delivery_time: order.scheduledDeliveryTime || null,
      fulfillment_start_time: order.fulfillmentStartTime || null,
      can_fulfill_now: this.isFulfillmentDue(order),
      remarks: order.remark || "",
      remark: order.remark || "",
      commission_rate: Number(
        (this.toNumber(order.merchant?.region?.commissionRate) * 100).toFixed(
          4,
        ),
      ),
      user: {
        id: order.user?.id || "",
        nickname: order.user?.nickname || "用户",
        avatar: order.user?.avatar || "/static/logo.jpg",
        phone: order.user?.phone || "",
        order_count: 1,
      },
      merchant: {
        id: order.merchant?.id || order.merchantId,
        name: order.merchant?.name || "宿舍小店",
        logo: order.merchant?.logo || "/static/logo.jpg",
        address: order.merchant?.address || "",
        phone: order.merchant?.phone || "",
      },
      items,
      delivery: {
        mode: this.getDeliveryModeLabel(
          order.businessType === "dorm_shop"
            ? "self_delivery"
            : order.deliveryMode || "platform_rider",
        ),
        mode_value:
          order.businessType === "dorm_shop"
            ? "self_delivery"
            : order.deliveryMode || "platform_rider",
        display_mode: this.deliveryDisplayModeForOrder(order),
        address: order.receiverAddress || "",
        contact: order.receiverName || "",
        phone: order.receiverPhone || "",
        rider: rider
          ? {
              id: rider.id,
              rider_id: rider.id,
              name: rider.anonymous
                ? "匿名骑手"
                : rider.realName || rider.User?.nickname || "骑手",
              phone: rider.phone || rider.User?.phone || "",
              avatar: rider.User?.avatar || "/static/logo.jpg",
              anonymous: rider.anonymous ? 1 : 0,
            }
          : null,
      },
      delivery_track: this.buildDeliveryTrack(order, order.deliveryNodes || []),
      payment: {
        goods_amount: itemAmount.toFixed(2),
        delivery_fee: freightAmount.toFixed(2),
        package_fee: packagingAmount.toFixed(2),
        total_amount: payAmount.toFixed(2),
        refund_amount: this.toNumber(order.refundAmount).toFixed(2),
      },
    };
  }

  private toMerchantMiniStatus(order: any) {
    if (order.refundStatus === "refunding") return "refunding";
    if (order.refundStatus === "refunded") return "refunded";
    if (order.status === "PAID" && order.businessType !== "dorm_shop") {
      if (order.readyTime) return "ready_for_pickup";
      if (order.merchantAcceptTime) return "preparing";
    }
    if (order.status === "PAID") return "awaiting_delivery";
    return this.toMiniDeliveryStatus(order.status);
  }

  private async notifyMerchantForOrder(order: any) {
    const merchantUserId = order.merchant?.userId;
    if (!merchantUserId) return;
    await this.notifyService.createAndDispatch({
      userId: merchantUserId,
      regionId: order.merchant?.regionId || undefined,
      type: "order",
      scene:
        order.businessType === "dorm_shop"
          ? "new_dorm_shop_order"
          : "new_takeaway_order",
      title:
        order.businessType === "dorm_shop"
          ? "宿舍小店有新订单"
          : "商家有新外卖订单",
      content: `${order.user?.nickname || "用户"} 下单 ¥${this.toMoney(order.payAmount)}，请及时确认接单`,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        merchantId: order.merchantId,
        amount: this.toNumber(order.payAmount),
      },
      linkType: "page",
      linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
      channelMask: { inApp: true, websocket: true },
    });
  }

  private async notifyBuyerOrderStatus(
    order: any,
    title: string,
    content: string,
  ) {
    if (!order.userId) return;
    await this.notifyService
      .createAndDispatch({
        userId: order.userId,
        regionId: order.merchant?.regionId || undefined,
        type: "order",
        scene:
          order.businessType === "dorm_shop"
            ? "dorm_shop_order_status"
            : "takeaway_order_status",
        title,
        content,
        data: {
          orderId: order.id,
          orderNo: order.orderNo,
          merchantId: order.merchantId,
          status: String(order.status),
        },
        linkType: "page",
        linkValue: `/pagesA/order/order-detail/order-detail?id=${order.id}`,
        channelMask: { inApp: true, websocket: true },
      })
      .catch(() => undefined);
  }

  async notifyAvailableShopRiders(order: any, limit = 3) {
    if (this.isRefundBlocking(order?.refundStatus)) return 0;
    if (!this.isFulfillmentDue(order)) return 0;
    const regionId = order.merchant?.regionId;
    if (!regionId) return 0;
    const [riders, locations] = await Promise.all([
      this.prisma.regionRider.findMany({
      where: {
        regionId,
        verifyStatus: "approved",
        status: "online",
        notificationStatus: { not: false },
      },
      select: { userId: true },
      }),
      this.redis.hgetall("rider:location"),
    ]);
    const merchant = order.merchant?.latitude && order.merchant?.longitude
      ? order.merchant
      : await this.prisma.merchant.findUnique({
          where: { id: order.merchantId },
          select: { latitude: true, longitude: true },
        });
    const now = Date.now();
    const candidates = riders.map((rider: any) => {
      try {
        const location = JSON.parse(locations[rider.userId] || "{}");
        const fresh = Number(location.time) > now - 10 * 60 * 1000;
        const distance = fresh ? this.deliveryDistanceMeters(merchant, { latitude: location.lat, longitude: location.lng }) : null;
        return { ...rider, fresh, distance };
      } catch {
        return { ...rider, fresh: false, distance: null };
      }
    }).sort((left: any, right: any) => Number(right.fresh) - Number(left.fresh)
      || (left.distance ?? Number.MAX_SAFE_INTEGER) - (right.distance ?? Number.MAX_SAFE_INTEGER)
      || String(left.userId).localeCompare(String(right.userId)))
      .slice(0, Math.max(1, limit));
    const results = await Promise.allSettled(
      candidates.map((rider: any) =>
        this.notifyService.createAndDispatch({
          userId: rider.userId,
          regionId,
          type: "delivery",
          scene: "shop_order_ready",
          title: "有外卖订单可接",
          content: `${order.merchant?.name || "商家"} 餐品已备好，快去接单`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            merchantId: order.merchantId,
            dispatch_distance_meters: rider.distance,
          },
          linkType: "page",
          linkValue: "/pagesA/Grab/Grab",
          channelMask: { inApp: true, websocket: true },
        }),
      ),
    );
    return results.filter((result) => result.status === "fulfilled").length;
  }

  private merchantPage(
    rows: any[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    return {
      merchants: rows.map((row) => this.formatMerchantForMini(row)),
      pagination: {
        current_page: page,
        page_size: pageSize,
        total_items: total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  private formatMerchantForMini(row: any) {
    const products = Array.isArray(row?.products) ? row.products : [];
    const latitude = this.toNumber(row.latitude, 0);
    const longitude = this.toNumber(row.longitude, 0);
    const minOrderAmount = this.toNumber(
      row.minOrderAmount,
      row.businessType === "dorm_shop" ? 0 : 1,
    );
    const deliveryMode = this.getOrderDeliveryMode(row);
    const deliveryFee = this.getDeliveryFee(row, deliveryMode);
    const isOpenNow =
      row.status === "approved" &&
      this.isMerchantOpenAt(row.businessHours, new Date());
    const closedNotice =
      row.closedNotice ||
      (!isOpenNow && row.status === "approved"
        ? "商家当前不在营业时间，请稍后再试"
        : "");
    return {
      id: row.id,
      merchant_id: row.id,
      name: row.name,
      business_type: row.businessType || "takeaway",
      businessType: row.businessType || "takeaway",
      deliveryMode,
      delivery_mode_value: deliveryMode,
      delivery_mode: this.getDeliveryModeLabel(deliveryMode),
      delivery_mode_label: this.getDeliveryModeLabel(deliveryMode),
      merchant_delivery_fee: deliveryFee.toFixed(2),
      delivery_fee: deliveryFee.toFixed(2),
      logo: row.logo || "/static/logo.jpg",
      avatar: row.logo || "/static/logo.jpg",
      background_url: row.cover || row.logo || "/static/logo.jpg",
      cover: row.cover || row.logo || "/static/logo.jpg",
      notice: row.description || "欢迎光临",
      announcement: row.description || "",
      phone: row.phone || "",
      address: row.address || "",
      building: row.dormBuilding || "",
      room: row.dormRoom || "",
      dorm_building: row.dormBuilding || "",
      dorm_room: row.dormRoom || "",
      student_verified: Boolean(row.studentVerified),
      status: row.status === "approved" ? 0 : 2,
      status_value: row.status,
      raw_status: row.status,
      is_open: isOpenNow ? 0 : 1,
      closed_notice: closedNotice,
      closedNotice,
      shop_closed_notice: closedNotice,
      rating: this.toNumber(row.rating, 5),
      average_rating: this.toNumber(row.rating, 5),
      monthly_sales: row.saleCount || 0,
      monthlyOrders: row.saleCount || 0,
      sale_count: row.saleCount || 0,
      min_order_amount: minOrderAmount,
      minDeliveryPrice: minOrderAmount,
      platform_delivery_fee: deliveryFee,
      deliveryFee,
      deliveryTime: this.toPositiveInt(
        row.deliveryTimeMinutes,
        row.businessType === "dorm_shop" ? 15 : 30,
      ),
      delivery_time: this.toPositiveInt(
        row.deliveryTimeMinutes,
        row.businessType === "dorm_shop" ? 15 : 30,
      ),
      packaging_fee: this.toMoney(row.packagingFee),
      merchant_packaging_fee: "0.00",
      business_license_url: row.businessLicenseUrl || "",
      food_safety_license_url: row.foodSafetyLicenseUrl || "",
      avg_spending: products.length
        ? products.reduce(
            (sum: number, item: any) => sum + this.toNumber(item.price, 0),
            0,
          ) / products.length
        : 0,
      business_hours: this.parseBusinessHours(row.businessHours),
      businessHours: row.businessHours || "",
      location: { x: latitude, y: longitude },
      latitude,
      longitude,
      tags:
        row.businessType === "dorm_shop"
          ? ["学生认证", this.getDeliveryModeLabel(deliveryMode)]
          : [],
      recommended_products: products.map((product: any) =>
        this.formatProductForMini(product),
      ),
    };
  }

  private resolveMerchantDeliveryMode(
    businessType: string,
    value?: string | null,
  ) {
    if (businessType === "dorm_shop") return "self_delivery";
    return "platform_rider";
  }

  private getOrderDeliveryMode(merchant: any, requestedMode?: string | null) {
    const businessType =
      merchant?.businessType || merchant?.business_type || "takeaway";
    if (businessType === "dorm_shop") return "self_delivery";
    return "platform_rider";
  }

  private getDeliveryFee(merchant: any, deliveryMode?: string | null) {
    const businessType =
      merchant?.businessType || merchant?.business_type || "takeaway";
    if (businessType !== "dorm_shop") {
      // FIN-P0-005: 商家显式设置 0 元配送费必须生效；仅在“未设置”时才回退默认 2 元。
      const raw = merchant?.deliveryFee ?? merchant?.delivery_fee;
      if (raw === undefined || raw === null || raw === "") return 2;
      const fee = Number(raw);
      return Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : 2;
    }
    return this.normalizeDeliveryFee(
      merchant?.deliveryFee ??
        merchant?.delivery_fee ??
        merchant?.merchant_delivery_fee,
    );
  }

  private getDeliveryModeLabel(deliveryMode?: string | null) {
    if (deliveryMode === "self_delivery") return "店主自送";
    return "平台配送";
  }

  private async buildMerchantApplicationData(
    userId: string,
    businessType: string,
    dto: any,
  ) {
    const name = this.requiredText(dto.name, "请填写小店名称");
    const contactPerson = this.requiredText(
      dto.contactPerson || dto.contact_name,
      "请填写联系人",
    );
    const phone = this.requiredText(
      dto.phone || dto.contact_phone,
      "请填写手机号",
    );
    const regionId = this.toOptionalStringOrNull(dto.regionId || dto.region_id);
    if (!regionId) throw new BadRequestException("请先选择区域");

    const businessHours =
      dto.businessHours || dto.business_hours
        ? this.normalizeBusinessHours(dto.businessHours || dto.business_hours)
        : null;
    if (businessType === "dorm_shop" && !businessHours) {
      throw new BadRequestException("宿舍小店必须选择营业时间");
    }

    const dormBuilding = this.toOptionalStringOrNull(
      dto.dormBuilding || dto.dorm_building,
    );
    const dormRoom = this.toOptionalStringOrNull(dto.dormRoom || dto.dorm_room);
    if (businessType === "dorm_shop" && (!dormBuilding || !dormRoom)) {
      throw new BadRequestException("请填写宿舍楼和房间号");
    }

    const categoryId = await this.resolveCategoryId(
      dto.categoryId || dto.category_id,
      dto.category || dto.categoryName || dto.category_name,
      businessType,
    );
    const address =
      this.toOptionalStringOrNull(dto.address) ||
      [dormBuilding, dormRoom].filter(Boolean).join(" ");
    const logo = this.toOptionalStringOrNull(dto.logo || dto.logo_url);
    const cover =
      this.toOptionalStringOrNull(dto.cover || dto.cover_url) || logo;

    return {
      userId,
      name,
      phone,
      contactPerson,
      address,
      description: this.toOptionalStringOrNull(dto.description),
      businessType,
      deliveryMode: this.resolveMerchantDeliveryMode(
        businessType,
        dto.deliveryMode || dto.delivery_mode,
      ),
      deliveryFee:
        businessType === "dorm_shop"
          ? this.normalizeDeliveryFee(
              dto.deliveryFee ?? dto.delivery_fee ?? dto.merchant_delivery_fee,
            )
          : 0,
      minOrderAmount:
        businessType === "dorm_shop"
          ? 0
          : this.normalizeNonNegativeMoney(
              dto.minOrderAmount ?? dto.min_order_amount ?? 1,
              "起送金额",
            ),
      packagingFee: this.normalizeNonNegativeMoney(
        dto.packagingFee ?? dto.packaging_fee ?? 0,
        "打包费",
      ),
      deliveryTimeMinutes: this.toPositiveInt(
        dto.deliveryTimeMinutes ?? dto.delivery_time ?? 30,
        30,
      ),
      regionId,
      categoryId,
      dormBuilding,
      dormRoom,
      studentVerified: businessType === "dorm_shop",
      latitude: this.toFloatOrNull(dto.latitude),
      longitude: this.toFloatOrNull(dto.longitude),
      businessHours,
      logo,
      cover,
    };
  }

  private requiredText(value: any, message: string) {
    const text = this.toOptionalStringOrNull(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private async resolveCategoryId(
    categoryId: any,
    categoryName: any,
    businessType: string,
  ) {
    const id = this.toOptionalStringOrNull(categoryId);
    if (id) return id;
    const name = this.toOptionalStringOrNull(categoryName);
    if (!name) return null;
    const existing = await this.prisma.category.findFirst({
      where: { name, businessType, status: { not: "deleted" } },
      orderBy: { sortOrder: "asc" },
    });
    if (existing) return existing.id;
    const created = await this.prisma.category.create({
      data: { name, businessType, type: "product", status: "active" },
    });
    return created.id;
  }

  private normalizeBusinessHours(value?: any) {
    const weeklyHours = this.parseWeeklyBusinessHours(value);
    if (weeklyHours) {
      // Keep the seven-day plan below MySQL's default varchar length.
      return JSON.stringify(
        weeklyHours.map(({ day, open, close }) => [
          this.weekDays.indexOf(day),
          open,
          close,
        ]),
      );
    }
    if (
      Array.isArray(value) ||
      (typeof value === "string" && value.trim().startsWith("["))
    )
      return null;
    return this.normalizeDailyBusinessHours(value);
  }

  private normalizeDailyBusinessHours(value?: any) {
    const match = String(value || "")
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const [, startHourRaw, startMinuteRaw, endHourRaw, endMinuteRaw] = match;
    const startHour = Number(startHourRaw);
    const startMinute = Number(startMinuteRaw);
    const endHour = Number(endHourRaw);
    const endMinute = Number(endMinuteRaw);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (
      startHour < 0 ||
      startHour > 23 ||
      endHour < 0 ||
      endHour > 23 ||
      startMinute < 0 ||
      startMinute > 59 ||
      endMinute < 0 ||
      endMinute > 59 ||
      start >= end
    ) {
      return null;
    }
    return `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
  }

  private isMerchantOpenAt(
    businessHours: string | null | undefined,
    time: Date,
  ): boolean {
    const weeklyHours = this.parseWeeklyBusinessHours(businessHours);
    if (weeklyHours) {
      const today = weeklyHours.find(
        ({ day }) => day === this.weekDays[time.getDay()],
      );
      return Boolean(
        today &&
        today.open !== "Closed" &&
        this.isMerchantOpenAt(today.open + "-" + today.close, time),
      );
    }
    const match = String(businessHours || "").match(
      /^(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})$/,
    );
    if (!match) return true;
    const [, startHour, startMinute, endHour, endMinute] = match;
    const currentMinutes = time.getHours() * 60 + time.getMinutes();
    const startMinutes = Number(startHour) * 60 + Number(startMinute);
    const endMinutes = Number(endHour) * 60 + Number(endMinute);
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  private formatProductForMini(product: any) {
    const image = Array.isArray(product.images)
      ? product.images[0]
      : product.mainImage || product.image;
    return {
      id: product.id,
      product_id: product.id,
      category_id: product.categoryId || null,
      name: product.name,
      product_name: product.name,
      description: product.detail || product.subtitle || "",
      image: image || "/static/logo.jpg",
      product_image: image || "/static/logo.jpg",
      price: this.toNumber(product.price, 0),
      sale_price: this.toNumber(product.price, 0),
      original_price: product.originPrice
        ? this.toNumber(product.originPrice, 0)
        : undefined,
      origin_price: product.originPrice
        ? this.toNumber(product.originPrice, 0)
        : undefined,
      stock: product.stock || 0,
      total_stock: product.stock || 0,
      daily_stock: product.stock || 0,
      unit: product.unit || "",
      weight: product.weight || 0,
      is_hot: Boolean(product.isHot),
      is_available: product.status === "on_sale" && Number(product.stock) > 0,
      product_status: product.status || "on_sale",
      sort_order: product.sortOrder || 0,
      specs: (product.skus || []).map((sku: any) => this.formatSkuOption(sku))
        .length
        ? [
            {
              id: 1,
              spec_name: "规格",
              must_select: true,
              options: (product.skus || []).map((sku: any) =>
                this.formatSkuOption(sku),
              ),
            },
          ]
        : [],
      attributes: this.formatModifiersForMini(
        product.modifierGroups,
        "attribute",
      ),
      extras: this.formatModifiersForMini(product.modifierGroups, "extra"),
      count: 0,
    };
  }

  private parseBusinessHours(
    value?: string | null,
  ): Array<{ day: string; open: string; close: string }> {
    const weeklyHours = this.parseWeeklyBusinessHours(value);
    if (weeklyHours) return weeklyHours;
    if (!value) {
      return [];
    }
    const match = String(value).match(
      /(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/,
    );
    if (!match) return [];
    return this.weekDays.map((day) => ({
      day,
      open: match[1],
      close: match[2],
    }));
  }

  private readonly weekDays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  private parseWeeklyBusinessHours(
    value: any,
  ): Array<{ day: string; open: string; close: string }> | null {
    let source = value;
    if (typeof source === "string" && source.trim().startsWith("[")) {
      try {
        source = JSON.parse(source);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(source) || source.length !== this.weekDays.length)
      return null;
    const hoursByDay = new Map<
      string,
      { day: string; open: string; close: string }
    >();
    for (const item of source) {
      const dayValue = Array.isArray(item) ? item[0] : item?.day;
      const day =
        typeof dayValue === "number" ? this.weekDays[dayValue] : dayValue;
      const open = Array.isArray(item) ? item[1] : item?.open;
      const close = Array.isArray(item) ? item[2] : item?.close;
      if (!this.weekDays.includes(day) || hoursByDay.has(day)) return null;
      if (open === "Closed" || close === "Closed") {
        if (open !== "Closed" || close !== "Closed") return null;
        hoursByDay.set(day, { day, open, close });
        continue;
      }
      const normalized = this.normalizeDailyBusinessHours(
        `${open || ""}-${close || ""}`,
      );
      if (!normalized) return null;
      const [normalizedOpen, normalizedClose] = normalized.split("-");
      hoursByDay.set(day, {
        day,
        open: normalizedOpen,
        close: normalizedClose,
      });
    }
    return this.weekDays.map((day) => hoursByDay.get(day)!);
  }

  private buildDeliveryOrderWhere(
    userId: string,
    status: string,
    keyword: string,
  ) {
    const where: any = { userId };
    this.applyDeliveryStatusFilter(where, status);
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
        { receiverAddress: { contains: keyword } },
        { merchant: { name: { contains: keyword } } },
      ];
    }
    return where;
  }

  private applyDeliveryStatusFilter(where: any, status: string) {
    if (status === "partial_refund") {
      where.refundStatus = "partial";
      return;
    }
    if (
      ["awaiting_delivery", "preparing", "ready_for_pickup"].includes(status)
    ) {
      where.status = "PAID";
      where.refundStatus = { notIn: ["refunding", "refunded"] };
      if (status === "awaiting_delivery") where.merchantAcceptTime = null;
      if (status === "preparing") {
        where.merchantAcceptTime = { not: null };
        where.readyTime = null;
      }
      if (status === "ready_for_pickup") where.readyTime = { not: null };
      return;
    }
    const statuses = this.deliveryStatusesForMini(status);
    if (!statuses?.length) return;
    if (status === "refunding" || status === "refunded") {
      where.AND = [
        ...(where.AND || []),
        { OR: [{ status: { in: statuses } }, { refundStatus: status }] },
      ];
      return;
    }
    where.status = { in: statuses };
    where.refundStatus = { notIn: ["refunding", "refunded"] };
  }

  private buildErrandOrderWhere(
    userId: string,
    status: string,
    keyword: string,
  ) {
    const where: any = { userId };
    const statuses = this.errandStatusesForMini(status);
    if (status === "refunding" || status === "refunded") {
      where.AND = [
        { OR: [{ status: { in: statuses || [] } }, { refundStatus: status }] },
      ];
    } else if (statuses?.length) {
      where.status = { in: statuses };
      where.refundStatus = { notIn: ["refunding", "refunded"] };
    }
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { title: { contains: keyword } },
        { description: { contains: keyword } },
        { pickupAddress: { contains: keyword } },
        { deliverAddress: { contains: keyword } },
        { deliverPhone: { contains: keyword } },
      ];
    }
    return where;
  }

  private deliveryStatusesForMini(status: string) {
    const map: Record<string, string[]> = {
      pending: ["PENDING_PAY"],
      unpaid: ["PENDING_PAY"],
      paid: ["PAID"],
      awaiting_delivery: ["PAID"],
      delivering: ["SHIPPED"],
      shipped: ["SHIPPED"],
      completed: ["DELIVERED", "RECEIVED", "COMPLETED"],
      delivered: ["DELIVERED"],
      received: ["RECEIVED"],
      cancelled: ["CANCELLED"],
      refunding: ["REFUNDING"],
      refunded: ["REFUNDED"],
    };
    return status ? map[status] || [] : undefined;
  }

  private errandStatusesForMini(status: string) {
    const map: Record<string, string[]> = {
      pending: ["pending_pay"],
      unpaid: ["pending_pay"],
      paid: ["pending_accept"],
      confirmed: ["pending_accept"],
      awaiting_delivery: ["pending_accept"],
      delivering: ["accepted", "in_progress", "arrived"],
      dispatched: ["accepted"],
      picked_up: ["in_progress"],
      completed: ["completed"],
      cancelled: ["cancelled"],
      refunding: ["refunding"],
      refunded: ["refunded"],
    };
    return status ? map[status] || [] : undefined;
  }

  private normalizeDeliveryStatus(status: any) {
    const value = String(status || "").trim();
    const map: Record<string, string> = {
      pending: "PENDING_PAY",
      unpaid: "PENDING_PAY",
      pending_pay: "PENDING_PAY",
      paid: "PAID",
      awaiting_delivery: "PAID",
      delivering: "SHIPPED",
      shipped: "SHIPPED",
      delivered: "DELIVERED",
      received: "RECEIVED",
      completed: "COMPLETED",
      cancelled: "CANCELLED",
      refunding: "REFUNDING",
      refunded: "REFUNDED",
      PENDING_PAY: "PENDING_PAY",
      PAID: "PAID",
      SHIPPED: "SHIPPED",
      DELIVERED: "DELIVERED",
      RECEIVED: "RECEIVED",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
      REFUNDING: "REFUNDING",
      REFUNDED: "REFUNDED",
    };
    const normalized = map[value];
    if (!normalized) throw new BadRequestException("订单状态不正确");
    return normalized as any;
  }

  private toMiniDeliveryStatus(status: string) {
    const map: Record<string, string> = {
      PENDING_PAY: "pending",
      PAID: "paid",
      SHIPPED: "delivering",
      DELIVERED: "completed",
      RECEIVED: "completed",
      COMPLETED: "completed",
      CANCELLED: "cancelled",
      REFUNDING: "refunding",
      REFUNDED: "refunded",
    };
    return map[status] || String(status || "").toLowerCase();
  }

  private async getOrderStatistics(userId: string) {
    const [
      deliveryTotal,
      deliveryPaid,
      deliveryDelivering,
      deliveryCompleted,
      deliveryRefunding,
      deliveryRefunded,
      errandTotal,
    ] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.count({
        where: {
          userId,
          status: "PAID" as any,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
      }),
      this.prisma.order.count({
        where: {
          userId,
          status: "SHIPPED" as any,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
      }),
      this.prisma.order.count({
        where: {
          userId,
          status: { in: ["DELIVERED", "RECEIVED", "COMPLETED"] as any },
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
      }),
      this.prisma.order.count({
        where: {
          userId,
          OR: [{ status: "REFUNDING" as any }, { refundStatus: "refunding" }],
        },
      }),
      this.prisma.order.count({
        where: {
          userId,
          OR: [{ status: "REFUNDED" as any }, { refundStatus: "refunded" }],
        },
      }),
      this.prisma.errandOrder.count({ where: { userId } }),
    ]);
    return {
      delivery: {
        total: deliveryTotal,
        paid: deliveryPaid,
        delivering: deliveryDelivering,
        completed: deliveryCompleted,
        refunding: deliveryRefunding,
        refunded: deliveryRefunded,
      },
      errand: {
        total: errandTotal,
      },
    };
  }

  private formatDeliveryOrder(order: any) {
    const status =
      order.refundStatus === "refunding"
        ? "refunding"
        : order.refundStatus === "refunded"
          ? "refunded"
          : order.status === "PAID" && order.businessType !== "dorm_shop"
            ? order.readyTime
              ? "awaiting_delivery"
              : order.merchantAcceptTime
                ? "preparing"
                : "paid"
            : this.toMiniDeliveryStatus(order.status);
    const deliveryMode =
      order.businessType === "dorm_shop"
        ? "self_delivery"
        : order.deliveryMode || "platform_rider";
    const items = (order.items || []).map((item: any) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      product_image: item.productImage,
      sku_id: item.skuId,
      sku_specs: item.skuSpecs,
      modifier_selections: this.parseModifierSelections(
        item.modifierSelections,
      ),
      unit_price: this.toNumber(item.price),
      price: this.toNumber(item.price),
      quantity: item.quantity,
      total_price: this.toNumber(item.totalPrice),
    }));
    const riderUser = order.rider?.User || null;
    return {
      id: order.id,
      order_id: order.id,
      order_no: order.orderNo,
      orderNo: order.orderNo,
      type: order.businessType === "dorm_shop" ? "dorm_shop" : "delivery",
      service_type:
        order.businessType === "dorm_shop" ? "dorm_shop" : "food_delivery",
      business_type: order.businessType || "takeaway",
      delivery_mode: deliveryMode,
      delivery_mode_label: this.getDeliveryModeLabel(deliveryMode),
      raw_status: order.status,
      status,
      payment_status:
        order.status === "REFUNDED"
          ? "refunded"
          : order.status === "PENDING_PAY"
            ? "unpaid"
            : "paid",
      refund_status: order.refundStatus || "none",
      refund_amount: this.toNumber(order.refundAmount),
      total_amount: this.toMoney(order.totalAmount),
      pay_amount: this.toNumber(order.payAmount),
      freight_amount: this.toNumber(order.freightAmount),
      delivery_distance_meters: order.deliveryDistanceMeters ?? null,
      packaging_amount: this.toNumber(order.packagingAmount),
      discount_amount: this.toNumber(order.discountAmount),
      merchant_id: order.merchantId,
      merchant_user_id: order.merchant?.userId || "",
      merchant_name: order.merchant?.name || "商家",
      merchant_avatar: order.merchant?.logo || "/static/logo.jpg",
      merchant_phone: order.merchant?.phone || "",
      receiver_name: order.receiverName,
      receiver_phone: order.receiverPhone,
      receiver_address: order.receiverAddress,
      delivery_time: order.scheduledDeliveryTime || order.createdAt,
      scheduled_delivery_time: order.scheduledDeliveryTime || null,
      fulfillment_start_time: order.fulfillmentStartTime || null,
      can_fulfill_now: this.isFulfillmentDue(order),
      merchant_accept_time: order.merchantAcceptTime || null,
      remark: order.remark || "",
      items,
      is_reviewed: !!order.reviews?.length,
      rider: riderUser
        ? {
            id: order.rider.userId,
            user_id: order.rider.userId,
            name: riderUser.nickname || "配送骑手",
            avatar: riderUser.avatar || "/static/logo.jpg",
            phone: riderUser.phone || "",
            delivery_status:
              order.status === "DELIVERED"
                ? "delivered"
                : order.pickupTime
                  ? "picked_up"
                  : "pending",
          }
        : null,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    };
  }

  private formatErrandOrder(row: any) {
    const riderUser = row.RegionRider?.User || null;
    const user = row.User || null;
    const remark = this.parseErrandRemark(row.remark);
    const miniType = internalErrandTypeToMini(row.type);
    const refundStatus = row.refundStatus || "none";
    const status =
      refundStatus === "refunding" || refundStatus === "refunded"
        ? refundStatus
        : row.status === "pending_pay"
          ? "pending"
          : miniErrandStatus(row.status);
    const payAmount = this.toNumber(row.payAmount);
    const contactName = row.deliverContact || user?.nickname || "用户";
    const mobile = row.deliverPhone || user?.phone || "";
    const addressText = row.deliverAddress || "";
    const pickupContactName = row.pickupContact || contactName;
    const pickupMobile = row.pickupPhone || mobile;
    const pickupAddressText = row.pickupAddress || addressText;
    const address =
      miniType === "express_send"
        ? {
            recipient_name: pickupContactName,
            mobile: pickupMobile,
            address: pickupAddressText,
          }
        : { recipient_name: contactName, mobile, address: addressText };
    const rawTasks =
      Array.isArray(row.tasks) && row.tasks.length
        ? row.tasks.map((task: any) => this.errandTaskRowToPayload(task))
        : remark.tasks;
    const tasks = this.formatErrandTasks(rawTasks, miniType, row, remark);
    return {
      id: row.id,
      order_id: row.id,
      delivery_order_id: row.id,
      order_no: row.orderNo,
      orderNo: row.orderNo,
      type: "errand",
      raw_type: row.type,
      service_type: miniType,
      subType: miniType,
      raw_status: row.status,
      status,
      refund_status: refundStatus,
      refund_amount: this.toNumber(row.refundAmount),
      payment_status: row.status === "pending_pay" ? "unpaid" : "paid",
      title: row.title,
      description: row.description || "",
      total_amount: this.toMoney(row.payAmount),
      pay_amount: payAmount,
      amount: payAmount,
      price: this.toNumber(row.price),
      tip: this.toNumber(row.tip),
      merchant_avatar: "/static/logo.jpg",
      merchant_name: row.title || "跑腿订单",
      merchant_phone: row.deliverPhone || row.pickupPhone || "",
      delivery_address: row.deliverAddress,
      address,
      pickup_address: row.pickupAddress,
      delivery_contact: contactName,
      delivery_phone: mobile,
      recipient_name: contactName,
      mobile,
      latitude: row.deliverLat,
      longitude: row.deliverLng,
      delivery_time: remark.delivery_time || row.deliverTime || row.createdAt,
      tasks,
      details: tasks,
      items: [],
      images: row.images || [],
      rider: row.RegionRider
        ? {
            id: row.RegionRider.id,
            user_id: row.RegionRider.userId,
            real_name: row.RegionRider.realName,
            name: row.RegionRider.realName || riderUser?.nickname || "骑手",
            phone: row.RegionRider.phone || "",
            avatar: riderUser?.avatar || "/static/logo.jpg",
            nickname: riderUser?.nickname || row.RegionRider.realName || "骑手",
            status: row.RegionRider.status || "online",
            account_status:
              row.RegionRider.verifyStatus === "approved"
                ? "normal"
                : "pending",
            rating: row.RegionRider.rating || 5,
          }
        : null,
      rider_id: row.riderId,
      remarks: row.description || "",
      user_gender: user?.gender || 0,
      created_at: row.createdAt,
      assigned_time: row.acceptTime,
      updated_at: row.updatedAt,
    };
  }

  private toNumber(value: any, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  /** FIN-P0-007: 金额定点舍入到分，落库前统一调用。 */
  private roundMoney(value: any) {
    return Math.round(this.toNumber(value) * 100) / 100;
  }

  private isRefundBlocking(refundStatus: any) {
    return ["refunding", "refunded"].includes(String(refundStatus || "none"));
  }

  private toFloatOrNull(value: any) {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toOptionalStringOrNull(value: any) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  private toMoney(value: any) {
    return this.toNumber(value).toFixed(2);
  }

  private normalizeDeliveryFee(value: any) {
    if (value === undefined || value === null || value === "") return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("配送费不能小于 0");
    }
    return Math.round(amount * 100) / 100;
  }

  private normalizeNonNegativeMoney(value: any, label: string) {
    if (value === undefined || value === null || value === "") return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(`${label}不能小于 0`);
    }
    return Math.round(amount * 100) / 100;
  }

  private toPositiveInt(value: any, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
  }

  private parseErrandRemark(value: any) {
    if (!value) return {};
    if (typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private formatErrandTasks(
    tasks: any,
    miniType: string,
    row: any,
    remark: any,
  ) {
    const rawTasks = Array.isArray(tasks) ? tasks : [];
    if (!rawTasks.length) {
      return [
        {
          task_type: miniType,
          description: row.description || row.title || "跑腿任务",
          pickup_address: row.pickupAddress || "",
          computed_fee: this.toMoney(row.price),
          image_urls: Array.isArray(row.images) ? row.images : [],
        },
      ];
    }
    return rawTasks.map((task: any) => ({
      ...task,
      task_type: task.task_type || miniType,
      express_company: task.express_company || "",
      code: task.code || task.pickup_code || "",
      description: task.description || task.item_description || "",
      pickup_point_name: task.pickup_point_name || "",
      item_size_name: task.item_size_name || "",
      pickup_address: task.pickup_address || row.pickupAddress || "",
      computed_fee: this.toMoney(
        task.computed_fee ?? remark.item_size_fee ?? row.price,
      ),
      image_urls: Array.isArray(task.image_urls) ? task.image_urls : [],
    }));
  }

  private errandTaskRowToPayload(task: any) {
    return {
      task_type: task.taskType,
      item_size_id: task.itemSizeId || "",
      pickup_point_id: task.pickupPointId || "",
      express_company: task.expressCompany || "",
      platform: task.platform || "",
      code: task.code || "",
      description: task.description || "",
      item_description: task.itemDescription || "",
      pickup_address: task.pickupAddress || "",
      recipient_address: task.recipientAddress || "",
      budget_amount: this.toNumber(task.budgetAmount),
      computed_fee: this.toNumber(task.computedFee),
      image_urls: Array.isArray(task.imageUrls) ? task.imageUrls : [],
      metadata: task.metadata || {},
    };
  }
}
