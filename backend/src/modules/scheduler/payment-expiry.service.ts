import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { PaymentService } from "../payment/payment.service";
import { MallService } from "../mall/mall.service";
import { ShopService } from "../shop/shop.service";
import { ErrandService } from "../errand/errand.service";
import { ActivityService } from "../activity/activity.service";

/**
 * Releases order-side reservations only after WeChat has confirmed that an
 * expired payment cannot succeed. Domain operations are idempotent and a
 * failed release is retried by the next interval.
 */
@Injectable()
export class PaymentExpiryService {
  private readonly logger = new Logger(PaymentExpiryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly mallService: MallService,
    private readonly shopService: ShopService,
    private readonly errandService: ErrandService,
    private readonly activityService: ActivityService,
    private readonly redis: RedisService = {
      withLock: async (_key: string, _ttl: number, task: () => Promise<any>) =>
        task(),
    } as unknown as RedisService,
  ) {}

  @Interval(60 * 1000)
  async runScheduledReconciliation() {
    if (this.running) return;
    this.running = true;
    try {
      const lock = (this.redis as any).withRenewingLock || this.redis.withLock;
      await lock.call(this.redis, "scheduler:payment-expiry", 55, () =>
        this.reconcileAndRelease(),
      );
    } finally {
      this.running = false;
    }
  }

  async reconcileAndRelease() {
    const terminalPayments =
      await this.paymentService.reconcileExpiredPayments();
    for (const payment of terminalPayments) {
      if (!this.resolveReleaseHandler(payment.bizType)) continue;
      await this.prisma.paymentReservationRelease.upsert({
        where: { paymentId: payment.id },
        create: { paymentId: payment.id },
        update: {},
      });
    }
    const jobs = await this.prisma.paymentReservationRelease.findMany({
      where: {
        OR: [
          { status: { in: ["pending", "failed"] } },
          {
            status: "processing",
            updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
          },
        ],
      },
      include: { payment: true },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
    let released = 0;
    let failed = 0;

    for (const job of jobs) {
      const claimed = await this.prisma.paymentReservationRelease.updateMany({
        where: {
          id: job.id,
          OR: [
            { status: { in: ["pending", "failed"] } },
            {
              status: "processing",
              updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
            },
          ],
        },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      if (claimed.count !== 1) continue;
      const release = this.resolveReleaseHandler(job.payment.bizType);
      if (!release) {
        await this.prisma.paymentReservationRelease.update({
          where: { id: job.id },
          data: { status: "completed", completedAt: new Date() },
        });
        continue;
      }
      try {
        const result = await release(job.payment.bizId);
        if (result !== false) released += 1;
        await this.prisma.paymentReservationRelease.update({
          where: { id: job.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            lastError: null,
          },
        });
      } catch (error: any) {
        failed += 1;
        await this.prisma.paymentReservationRelease.update({
          where: { id: job.id },
          data: {
            status: "failed",
            lastError: String(error?.message || "unknown").slice(0, 500),
          },
        });
        this.logger.error(
          `支付超时释放失败: bizType=${job.payment.bizType}, bizId=${job.payment.bizId}, error=${error?.message || "unknown"}`,
        );
      }
    }

    await this.expireOrphanShopOrders();

    return { checked: jobs.length, released, failed };
  }

  private async expireOrphanShopOrders() {
    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: "PENDING_PAY",
        createdAt: { lte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      select: { id: true },
      take: 100,
    });
    if (!staleOrders.length) return;

    const activePayments = await this.prisma.paymentOrder.findMany({
      where: {
        bizType: "order",
        bizId: { in: staleOrders.map((order) => order.id) },
        status: { in: ["pending", "paying"] },
      },
      select: { bizId: true },
    });
    const activeOrderIds = new Set(
      activePayments.map((payment) => payment.bizId),
    );
    for (const order of staleOrders) {
      if (!activeOrderIds.has(order.id))
        await this.shopService.expirePendingPayment(order.id);
    }
  }

  private resolveReleaseHandler(
    bizType: string,
  ): ((bizId: string) => Promise<any>) | null {
    switch (bizType) {
      case "mall_order":
        return (bizId) => this.mallService.expirePendingPayment(bizId);
      case "order":
        return (bizId) => this.shopService.expirePendingPayment(bizId);
      case "errand_order":
        return (bizId) => this.errandService.expirePendingPayment(bizId);
      case "activity_order":
        return (bizId) => this.activityService.expirePendingPayment(bizId);
      default:
        return null;
    }
  }
}
