import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { errandExtendedConfigKey } from './errand-config.util';

@Injectable()
export class ErrandLifecycleService {
  private readonly logger = new Logger(ErrandLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis?: RedisService,
    private readonly notifyService?: NotifyService,
  ) {}

  @Interval(10 * 60 * 1000)
  async runScheduledAutoReceipt() {
    if (!this.redis) return;
    return this.redis.withLock('errand:auto-receipt', 9 * 60, () => this.autoConfirmDueOrders());
  }

  @Interval(5 * 60 * 1000)
  async runScheduledRiskScan() {
    if (!this.redis) return;
    return this.redis.withLock('errand:risk-scan', 4 * 60, () => this.scanActionableRisks());
  }

  async autoConfirmDueOrders(now = new Date()) {
    const orders = await this.prisma.errandOrder.findMany({
      where: {
        status: 'arrived',
        receiptConfirmDeadline: { lte: now },
      },
      select: {
        id: true,
        orderNo: true,
        userId: true,
        regionId: true,
        refundStatus: true,
      },
      orderBy: { receiptConfirmDeadline: 'asc' },
      take: 100,
    });
    if (!orders.length) return { checked: 0, completed: 0, held: 0 };

    const regionIds = [...new Set(orders.map(order => order.regionId).filter(Boolean))] as string[];
    const configRows = this.prisma.config?.findMany
      ? await this.prisma.config.findMany({
          where: { key: { in: [...regionIds.map(errandExtendedConfigKey), errandExtendedConfigKey('global')] } },
          select: { key: true, value: true },
        }).catch(() => [])
      : [];
    const configs = new Map(configRows.map((row: any) => [row.key, row.value || {}]));
    const globalConfig: any = configs.get(errandExtendedConfigKey('global')) || {};

    const orderIds = orders.map(order => order.id);
    const [appeals, riskEvents] = await Promise.all([
      this.prisma.orderAppeal.findMany({
        where: {
          orderId: { in: orderIds },
          orderType: { in: ['errand', 'errand_order'] },
          status: { notIn: ['resolved', 'rejected', 'closed', 'cancelled', 'completed'] },
        },
        select: { orderId: true },
      }),
      this.prisma.deliveryRiskEvent.findMany({
        where: {
          orderId: { in: orderIds },
          orderType: 'errand',
          handled: false,
          eventLevel: { in: ['error', 'critical'] },
        },
        select: { orderId: true },
      }),
    ]);
    const heldIds = new Set([
      ...appeals.map(item => item.orderId),
      ...riskEvents.map(item => item.orderId),
    ]);
    let completed = 0;
    let held = 0;

    for (const order of orders) {
      const regionConfig: any = configs.get(errandExtendedConfigKey(order.regionId || 'global')) || globalConfig;
      const autoReceiptEnabled = regionConfig.autoReceiptEnabled ?? regionConfig.auto_receipt_enabled ?? true;
      if (
        autoReceiptEnabled === false ||
        heldIds.has(order.id) ||
        ['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))
      ) {
        held += 1;
        continue;
      }
      try {
        await this.confirmReceipt(order.id, order.userId, 'system');
        completed += 1;
        if (this.notifyService) {
          await this.notifyService.createAndDispatch({
            userId: order.userId,
            regionId: order.regionId || undefined,
            type: 'delivery',
            scene: 'errand_order_auto_received',
            title: '跑腿订单已自动确认收货',
            content: '订单送达已满24小时，系统已自动确认收货；如有问题请尽快发起售后。',
            data: { orderId: order.id, orderNo: order.orderNo },
            linkType: 'page',
            linkValue: `/pagesA/order/errand-detail/errand-detail?order_id=${order.id}`,
            channelMask: { inApp: true, websocket: true },
          }).catch(error => {
            this.logger.warn(`跑腿自动确认通知失败 order=${order.id}: ${error?.message || error}`);
          });
        }
      } catch (error: any) {
        held += 1;
        this.logger.warn(`跑腿自动确认跳过 order=${order.id}: ${error?.message || error}`);
      }
    }

    return { checked: orders.length, completed, held };
  }

  async scanActionableRisks(now = new Date()) {
    const [orders, rewardConfigs, failedRefunds] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { status: { in: ['pending_accept', 'accepted', 'in_progress', 'arrived'] } },
        select: {
          id: true, orderNo: true, regionId: true, riderId: true, status: true,
          createdAt: true, acceptTime: true, pickupTime: true, receiptConfirmDeadline: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.errandRewardPunish.findMany({ select: { regionId: true, timeoutMinutes: true } }),
      this.prisma.paymentRefund.findMany({
        where: {
          status: { in: ['failed', 'abnormal', 'closed'] },
          payment: { is: { bizType: 'errand_order' } },
        },
        select: {
          id: true, status: true, failReason: true,
          payment: { select: { bizId: true, orderNo: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 100,
      }),
    ]);
    const timeoutByRegion = new Map(rewardConfigs.map(item => [item.regionId, Math.max(1, Number(item.timeoutMinutes || 30))]));
    const candidates: Array<{ orderId: string; riderId?: string | null; eventType: string; eventLevel: string; description: string }> = [];

    for (const order of orders) {
      const timeoutMinutes = timeoutByRegion.get(order.regionId || '') || 30;
      const cutoff = now.getTime() - timeoutMinutes * 60 * 1000;
      if (order.status === 'pending_accept' && !order.riderId && new Date(order.createdAt).getTime() <= cutoff) {
        candidates.push({
          orderId: order.id,
          eventType: 'unaccepted_timeout',
          eventLevel: 'warning',
          description: `订单 ${order.orderNo} 超过${timeoutMinutes}分钟无人接单，请联系骑手或用户。`,
        });
      }
      const deliverySince = order.pickupTime || order.acceptTime;
      if (['accepted', 'in_progress'].includes(order.status) && deliverySince && new Date(deliverySince).getTime() <= cutoff) {
        candidates.push({
          orderId: order.id,
          riderId: order.riderId,
          eventType: 'delivery_overdue',
          eventLevel: 'error',
          description: `订单 ${order.orderNo} 履约超过${timeoutMinutes}分钟，请核查骑手位置和配送轨迹。`,
        });
      }
      if (
        order.status === 'arrived' &&
        order.receiptConfirmDeadline &&
        new Date(order.receiptConfirmDeadline).getTime() <= now.getTime() - 48 * 60 * 60 * 1000
      ) {
        candidates.push({
          orderId: order.id,
          riderId: order.riderId,
          eventType: 'auto_receipt_hold',
          eventLevel: 'critical',
          description: `订单 ${order.orderNo} 自动确认已冻结超过48小时，请处理申诉、退款或风险事件。`,
        });
      }
    }
    for (const refund of failedRefunds) {
      if (!refund.payment?.bizId) continue;
      candidates.push({
        orderId: refund.payment.bizId,
        eventType: 'refund_failed',
        eventLevel: 'critical',
        description: `订单 ${refund.payment.orderNo || refund.payment.bizId} 退款失败：${refund.failReason || refund.status}。`,
      });
    }

    let created = 0;
    for (const candidate of candidates) {
      const existing = await this.prisma.deliveryRiskEvent.findFirst({
        where: { orderId: candidate.orderId, orderType: 'errand', eventType: candidate.eventType, handled: false },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.deliveryRiskEvent.create({
        data: { ...candidate, orderType: 'errand' },
      });
      created += 1;
    }
    return { checked: candidates.length, created };
  }

  async riderTransition(orderId: string, riderId: string, dto: any) {
    const status = this.normalizeRiderStatus(dto?.status);
    if (status === 'completed') throw new BadRequestException('骑手只能标记送达，不能确认完成');
    if (status === 'in_progress') return this.markInProgress(orderId, riderId, dto);
    if (status === 'arrived') return this.markArrived(orderId, riderId, dto);
    throw new BadRequestException('骑手只能更新取货或送达状态');
  }

  async markInProgress(orderId: string, riderId: string, evidence: any = {}) {
    return this.transitionRiderOrder(orderId, riderId, 'accepted', 'in_progress', {
      pickupTime: new Date(),
    }, evidence);
  }

  async markArrived(orderId: string, riderId: string, evidence: any = {}) {
    const order = await this.requireRiderOrder(orderId, riderId, 'in_progress');
    try {
      this.assertRequiredDeliveryProof(order, evidence);
    } catch (error) {
      const existingRisk = await this.prisma.deliveryRiskEvent.findFirst({
        where: {
          orderId,
          orderType: 'errand',
          eventType: 'delivery_evidence_rejected',
          handled: false,
        },
        select: { id: true },
      });
      if (!existingRisk) {
        await this.prisma.deliveryRiskEvent.create({
          data: {
            orderId,
            orderType: 'errand',
            riderId,
            eventType: 'delivery_evidence_rejected',
            eventLevel: 'error',
            description: `订单 ${order.orderNo || order.id} 缺少要求的送达凭证，送达操作已拦截。`,
          },
        });
      }
      throw error;
    }
    const now = new Date();
    const receiptConfirmDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const updated = await this.transitionRiderOrder(
      orderId,
      riderId,
      'in_progress',
      'arrived',
      {
        deliverTime: now,
        receiptConfirmDeadline,
      },
      evidence,
      order,
    );
    await this.releaseRiderAfterDelivery(orderId, riderId);
    return updated;
  }

  async confirmReceipt(orderId: string, userId: string, source: 'user' | 'system' = 'user') {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (source === 'user' && order.userId !== userId) {
      throw new BadRequestException('无权确认该订单');
    }
    if (order.status === 'completed' && order.receiptConfirmedAt) return order;
    if (order.status !== 'arrived') throw new BadRequestException('订单尚未送达，不能确认收货');
    if (['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) {
      throw new BadRequestException('订单退款处理中，不能确认收货');
    }

    const [appeal, riskEvent] = await Promise.all([
      this.prisma.orderAppeal.findFirst({
        where: {
          orderId,
          orderType: { in: ['errand', 'errand_order'] },
          status: { notIn: ['resolved', 'rejected', 'closed', 'cancelled', 'completed'] },
        },
        select: { id: true, status: true },
      }),
      this.prisma.deliveryRiskEvent.findFirst({
        where: {
          orderId,
          orderType: 'errand',
          handled: false,
          eventLevel: { in: ['error', 'critical'] },
        },
        select: { id: true, eventLevel: true },
      }),
    ]);
    if (appeal) throw new BadRequestException('订单售后处理中，暂不能确认收货');
    if (riskEvent) throw new BadRequestException('订单存在未处理风险事件，暂不能确认收货');

    const now = new Date();
    return this.prisma.$transaction(async tx => {
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id: orderId,
          userId: order.userId,
          status: 'arrived',
          refundStatus: { notIn: ['refunding', 'refunded'] },
        },
        data: {
          status: 'completed',
          receiptConfirmedAt: now,
          receiptConfirmedBy: source,
          completeTime: now,
          settlementEligibleAt: now,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('订单状态已变化，请刷新后重试');
      }
      await tx.deliveryOrderNode.create({
        data: {
          orderId,
          orderType: 'errand',
          nodeType: 'completed',
          nodeLabel: source === 'system' ? '超时自动确认收货' : '用户已确认收货',
          operatorId: source === 'user' ? userId : null,
          operatorType: source,
          riderType: 'part_time',
          displayMode: order.deliveryDisplayMode || 'status_nodes',
          remark: source === 'system' ? '送达24小时后系统自动确认' : '用户主动确认收货',
        },
      });
      return tx.errandOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  private async transitionRiderOrder(
    orderId: string,
    riderId: string,
    fromStatus: string,
    toStatus: string,
    timeData: Record<string, Date>,
    evidence: any,
    existingOrder?: any,
  ) {
    const order = existingOrder || await this.requireRiderOrder(orderId, riderId, fromStatus);
    const proofImages = this.proofImages(evidence);
    return this.prisma.$transaction(async tx => {
      const claimed = await tx.errandOrder.updateMany({
        where: {
          id: orderId,
          riderId,
          status: fromStatus,
          refundStatus: { notIn: ['refunding', 'refunded'] },
        },
        data: { status: toStatus, ...timeData },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('订单状态已变化，请刷新后重试');
      }
      await tx.deliveryOrderNode.create({
        data: {
          orderId,
          orderType: 'errand',
          nodeType: toStatus,
          nodeLabel: toStatus === 'arrived' ? '骑手已送达，等待用户确认' : '骑手已取货',
          operatorId: riderId,
          operatorType: 'rider',
          riderType: 'part_time',
          displayMode: order.deliveryDisplayMode || 'status_nodes',
          lat: this.coordinate(evidence?.lat ?? evidence?.latitude),
          lng: this.coordinate(evidence?.lng ?? evidence?.longitude),
          address: evidence?.address || null,
          proofImages: proofImages.length ? proofImages : undefined,
          remark: evidence?.remark || null,
        },
      });
      return tx.errandOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  private async requireRiderOrder(orderId: string, riderId: string, status: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== riderId) throw new BadRequestException('无权操作该订单');
    if (['refunding', 'refunded'].includes(String(order.refundStatus || 'none'))) {
      throw new BadRequestException('订单退款处理中，不能继续配送');
    }
    if (order.status !== status) throw new BadRequestException('当前订单状态不允许这样操作');
    return order;
  }

  private assertRequiredDeliveryProof(order: any, evidence: any) {
    const remark = this.parseRemark(order?.remark);
    const required = remark?.risk_assessment?.required_evidence;
    if (Array.isArray(required) && required.length > 0 && this.proofImages(evidence).length === 0) {
      throw new BadRequestException('请上传送达凭证');
    }
  }

  private async releaseRiderAfterDelivery(orderId: string, riderId: string) {
    const [activeErrandCount, activeShopCount] = await Promise.all([
      this.prisma.errandOrder.count({
        where: {
          id: { not: orderId },
          riderId,
          status: { in: ['accepted', 'in_progress'] },
        },
      }),
      this.prisma.order.count({ where: { riderId, status: 'SHIPPED' as any } }),
    ]);
    await this.prisma.regionRider.updateMany({
      where: { userId: riderId, verifyStatus: 'approved' },
      data: { status: activeErrandCount + activeShopCount > 0 ? 'busy' : 'online' },
    }).catch(() => undefined);
  }

  private normalizeRiderStatus(value: unknown) {
    const status = String(value || '').trim();
    const map: Record<string, string> = {
      picked_up: 'in_progress',
      delivering: 'in_progress',
      delivered: 'arrived',
    };
    return map[status] || status;
  }

  private proofImages(evidence: any) {
    const images = evidence?.proof_images ?? evidence?.proofImages;
    return Array.isArray(images) ? images.filter(Boolean).slice(0, 9) : [];
  }

  private parseRemark(value: unknown): any {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  }

  private coordinate(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
