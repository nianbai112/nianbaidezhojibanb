import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { PaymentService } from '../payment/payment.service';
import { MembershipService } from '../membership/membership.service';

const RECHARGE_MIN_AMOUNT = 0.01;
const RECHARGE_MAX_AMOUNT = 10000;

type PinPackage = {
  id: string;
  regionId: string;
  name: string;
  amount: any;
  giveAmount?: any;
  originalPrice?: any;
  duration?: number;
  durationUnit?: string;
  description?: string | null;
  sortOrder?: number;
  isShow?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class TopupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly paymentService: PaymentService,
    private readonly membershipService: MembershipService,
  ) {}

  private async runWithLock<T>(key: string, message: string, fn: () => Promise<T>, ttlSeconds = 30): Promise<T> {
    const locked = await this.redis.getLock(key, ttlSeconds);
    if (!locked) throw new BadRequestException(message);
    try {
      return await fn();
    } finally {
      await this.redis.releaseLock(key).catch(() => undefined);
    }
  }

  private money(value: any) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private normalizeRechargeAmount(value: any) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < RECHARGE_MIN_AMOUNT || amount > RECHARGE_MAX_AMOUNT) {
      throw new BadRequestException(`充值金额必须在 ${RECHARGE_MIN_AMOUNT} 至 ${RECHARGE_MAX_AMOUNT} 元之间`);
    }
    if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8) {
      throw new BadRequestException('充值金额最多保留两位小数');
    }
    return amount;
  }

  private positiveInt(value: any, fallback: number, max = 100) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
  }

  private packageDurationMs(pkg: { duration?: number; durationUnit?: string }) {
    const duration = Math.max(1, Number(pkg.duration || 1));
    const unit = String(pkg.durationUnit || 'hours');
    const unitMs: Record<string, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
    };
    return duration * (unitMs[unit] || unitMs.hours);
  }

  private mapPackage(pkg: PinPackage) {
    const currentPrice = this.money(pkg.amount);
    const originalPrice = this.money(pkg.originalPrice) || currentPrice;
    return {
      id: pkg.id,
      package_id: pkg.id,
      package_name: pkg.name,
      name: pkg.name,
      region_id: pkg.regionId,
      regionId: pkg.regionId,
      original_price: originalPrice,
      current_price: currentPrice,
      amount: currentPrice,
      duration: Number(pkg.duration || 24),
      duration_unit: pkg.durationUnit || 'hours',
      durationUnit: pkg.durationUnit || 'hours',
      description: pkg.description || '',
      sort_order: pkg.sortOrder || 0,
      sortOrder: pkg.sortOrder || 0,
      is_show: pkg.isShow !== false ? 1 : 0,
      isShow: pkg.isShow !== false,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  }

  private mapOrder(order: any) {
    const pkg = order.packageSnapshot || {};
    const post = order.post || order.Post;
    return {
      id: order.id,
      order_id: order.id,
      order_no: order.orderNo,
      orderNo: order.orderNo,
      payment_no: order.paymentNo || '',
      paymentNo: order.paymentNo || '',
      user_id: order.userId,
      userId: order.userId,
      post_id: order.postId,
      postId: order.postId,
      region_id: order.regionId,
      regionId: order.regionId,
      package_id: order.packageId,
      packageId: order.packageId,
      package_name: order.packageName || pkg.package_name || '',
      packageName: order.packageName || pkg.package_name || '',
      amount: this.money(order.amount),
      duration: order.duration,
      duration_unit: order.durationUnit,
      durationUnit: order.durationUnit,
      order_status: order.status,
      status: order.status,
      top_expire_at: order.topExpireAt,
      topExpireAt: order.topExpireAt,
      pay_time: order.payTime,
      payTime: order.payTime,
      created_at: order.createdAt,
      createdAt: order.createdAt,
      post_title: post?.title || post?.content?.slice?.(0, 30) || '',
      postTitle: post?.title || post?.content?.slice?.(0, 30) || '',
      user: order.User || order.user,
    };
  }

  async getPackages(regionId: string) {
    const list = await this.prisma.topupPackage.findMany({
      where: { regionId, isShow: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return list.map((item) => this.mapPackage(item as any));
  }

  async createTopupOrder(userId: string, dto: any) {
    const postId = String(dto.post_id || dto.postId || '');
    const packageId = String(dto.package_id || dto.packageId || '');
    return this.runWithLock(`topup:create:${userId}:${postId || 'unknown'}:${packageId || 'unknown'}`, '置顶订单正在创建中，请勿重复提交', () => this.createTopupOrderUnlocked(userId, dto), 45);
  }

  private async createTopupOrderUnlocked(userId: string, dto: any) {
    const postId = String(dto.post_id || dto.postId || '');
    const packageId = String(dto.package_id || dto.packageId || '');
    if (!postId) throw new BadRequestException('缺少笔记ID');
    if (!packageId) throw new BadRequestException('请选择置顶套餐');

    const [user, post, pkg] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, openid: true },
      }),
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          userId: true,
          regionId: true,
          status: true,
          deletedAt: true,
        },
      }),
      this.prisma.topupPackage.findUnique({ where: { id: packageId } }),
    ]);
    if (!user?.openid) throw new BadRequestException('用户未绑定微信，无法发起支付');
    if (!post || post.deletedAt) throw new NotFoundException('笔记不存在');
    if (post.userId !== userId) throw new ForbiddenException('只能置顶自己的笔记');
    // AUD-P1-147: 校验帖子已发布且审核通过（status=PUBLISHED），禁止置顶待审/已拒/草稿笔记
    if (post.status !== 'PUBLISHED') throw new BadRequestException('只能置顶已发布且审核通过的笔记');
    if (!pkg || !pkg.isShow) throw new BadRequestException('置顶套餐不可用');
    if (post.regionId && pkg.regionId !== post.regionId) throw new BadRequestException('置顶套餐与笔记区域不匹配');

    const amount = this.money(pkg.amount);
    if (amount <= 0) throw new BadRequestException('套餐价格异常，请联系平台');

    const freePin = await this.tryUseMemberFreePin(userId, postId, pkg);
    if (freePin) return freePin;

    const order = await this.prisma.topupOrder.create({
      data: {
        userId,
        postId,
        regionId: post.regionId || pkg.regionId,
        packageId: pkg.id,
        orderNo: `PIN${Date.now()}${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, '0')}`,
        amount,
        packageName: pkg.name,
        packageSnapshot: this.mapPackage(pkg as any),
        duration: pkg.duration || 24,
        durationUnit: pkg.durationUnit || 'hours',
        status: 'pending',
      },
    });

    const paymentInfo = await this.paymentService.wxUnifiedOrder({
      bizType: 'topup',
      bizId: order.id,
      orderNo: order.orderNo,
      amount,
      description: `笔记置顶 ${pkg.name}`.slice(0, 127),
      openid: user.openid,
      userId,
    });

    await this.prisma.topupOrder.update({
      where: { id: order.id },
      data: {
        status: 'paying',
        paymentNo: paymentInfo.paymentNo,
        payChannel: 'wx_pay',
      },
    });

    return {
      ...this.mapOrder({
        ...order,
        status: 'paying',
        paymentNo: paymentInfo.paymentNo,
      }),
      paymentInfo,
    };
  }

  private async tryUseMemberFreePin(userId: string, postId: string, pkg: any) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.membershipService.consumeBenefitWithDb(
          userId,
          'post_pin_free_quota',
          {
            targetType: 'post',
            targetId: postId,
            quantity: 1,
            metadata: { packageId: pkg.id, packageName: pkg.name },
          },
          tx,
        );
        const now = new Date();
        const post = await tx.post.findUnique({
          where: { id: postId },
          select: { topExpireAt: true },
        });
        const base = post?.topExpireAt && post.topExpireAt > now ? post.topExpireAt : now;
        const topExpireAt = new Date(base.getTime() + this.packageDurationMs(pkg));
        const order = await tx.topupOrder.create({
          data: {
            userId,
            postId,
            regionId: pkg.regionId,
            packageId: pkg.id,
            orderNo: `PINVIP${Date.now()}${Math.floor(Math.random() * 1000)
              .toString()
              .padStart(3, '0')}`,
            amount: 0,
            packageName: `${pkg.name}（会员权益）`,
            packageSnapshot: this.mapPackage(pkg as any),
            duration: pkg.duration || 24,
            durationUnit: pkg.durationUnit || 'hours',
            status: 'success',
            payChannel: 'membership_benefit',
            payTime: now,
            topExpireAt,
          },
        });
        await tx.post.update({
          where: { id: postId },
          data: { isTop: true, topExpireAt },
        });
        return {
          ...this.mapOrder(order),
          paymentInfo: { amount: 0, status: 'free', method: 'membership' },
          usedMemberBenefit: true,
          message: '已使用会员免费置顶权益',
        };
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        const message = String(error.message || '');
        if (message.includes('没有该权益') || message.includes('权益次数不足')) return null;
      }
      throw error;
    }
  }

  async getPaymentInfo(orderId: string, userId: string) {
    return this.runWithLock(`topup:pay:${orderId}`, '置顶支付正在处理中，请稍后再试', () => this.getPaymentInfoUnlocked(orderId, userId), 45);
  }

  private async getPaymentInfoUnlocked(orderId: string, userId: string) {
    const order = await this.prisma.topupOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('置顶订单不存在');
    if (order.userId !== userId) throw new ForbiddenException('无权查看该订单');
    if (order.status === 'success') {
      return {
        ...this.mapOrder(order),
        paymentInfo: { amount: 0, status: 'free', method: 'membership' },
      };
    }
    if (order.status === 'cancelled') throw new BadRequestException('订单已取消');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { openid: true },
    });
    if (!user?.openid) throw new BadRequestException('用户未绑定微信，无法发起支付');
    const paymentInfo = await this.paymentService.wxUnifiedOrder({
      bizType: 'topup',
      bizId: order.id,
      orderNo: order.orderNo,
      amount: this.money(order.amount),
      description: `笔记置顶 ${order.packageName || order.orderNo}`.slice(0, 127),
      openid: user.openid,
      userId,
    });
    await this.prisma.topupOrder.update({
      where: { id: order.id },
      data: {
        status: 'paying',
        paymentNo: paymentInfo.paymentNo,
        payChannel: 'wx_pay',
      },
    });
    return {
      ...this.mapOrder({
        ...order,
        status: 'paying',
        paymentNo: paymentInfo.paymentNo,
      }),
      paymentInfo,
    };
  }

  async syncOrderPayment(orderId: string, userId: string) {
    const order = await this.prisma.topupOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('置顶订单不存在');
    if (order.userId !== userId) throw new ForbiddenException('无权同步该订单');

    if (order.status === 'success') return this.mapOrder(order);
    if (!order.paymentNo) throw new BadRequestException('该置顶订单暂无支付单号，请重新发起支付');

    await this.paymentService.queryPayment(order.paymentNo);

    const updated = await this.prisma.topupOrder.findUnique({
      where: { id: orderId },
      include: {
        User: { select: { id: true, nickname: true, avatar: true } },
      } as any,
    });
    if (!updated) throw new NotFoundException('置顶订单不存在');
    return this.mapOrder(updated);
  }

  async getUserOrders(userId: string) {
    const list = await this.prisma.topupOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        User: { select: { id: true, nickname: true, avatar: true } },
      } as any,
    });
    return list.map((item) => this.mapOrder(item));
  }

  async cancelOrder(orderId: string, userId: string) {
    return this.runWithLock(`topup:order:${orderId}`, '置顶订单正在处理中，请稍后再试', () => this.cancelOrderUnlocked(orderId, userId));
  }

  private async cancelOrderUnlocked(orderId: string, userId: string) {
    const order = await this.prisma.topupOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('置顶订单不存在');
    if (order.userId !== userId) throw new ForbiddenException('无权取消该订单');
    if (order.status === 'success') throw new BadRequestException('已支付订单不能取消');
    const updated = await this.prisma.topupOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (updated.paymentNo) {
      await this.prisma.paymentOrder
        .updateMany({
          where: { paymentNo: updated.paymentNo, status: { not: 'paid' } },
          data: { status: 'closed' },
        })
        .catch(() => {});
    }
    return this.mapOrder(updated);
  }

  async getRechargeHistory(userId: string, query: any) {
    const page = this.positiveInt(query?.page, 1, 100000);
    const pageSize = this.positiveInt(query?.limit || query?.pageSize, 20, 100);
    const status = String(query?.status || '').trim();
    const where: any = { userId };
    if (status && ['pending', 'success', 'failed'].includes(status)) where.status = status;
    const [records, total] = await Promise.all([
      this.prisma.recharge.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recharge.count({ where }),
    ]);
    return {
      list: records.map((record) => ({
        id: record.id,
        order_no: record.orderNo,
        amount: Number(record.amount),
        pay_type: record.channel === 'WX_PAY' ? 'wechat' : String(record.channel || '').toLowerCase(),
        status: record.status,
        created_at: record.createdAt,
        paid_at: record.payTime,
      })),
      total,
      page,
      pageSize,
      recharge_config: {
        min_recharge: RECHARGE_MIN_AMOUNT,
        max_recharge: RECHARGE_MAX_AMOUNT,
      },
    };
  }

  async createRechargeOrder(userId: string, dto: any) {
    const amount = this.normalizeRechargeAmount(dto?.amount);
    return this.runWithLock(
      `finance:recharge:create:${userId}:${amount}`,
      '充值订单正在创建中，请勿重复提交',
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { openid: true },
        });
        if (!user?.openid) throw new BadRequestException('未绑定微信，无法充值');

        const recharge = await this.prisma.recharge.create({
          data: {
            userId,
            amount,
            channel: 'WX_PAY',
            orderNo: `REC${Date.now()}${Math.floor(Math.random() * 10000)
              .toString()
              .padStart(4, '0')}`,
            status: 'pending',
          },
        });

        try {
          const paymentInfo = await this.paymentService.wxUnifiedOrder({
            bizType: 'recharge',
            bizId: recharge.id,
            orderNo: recharge.orderNo,
            amount,
            description: `余额充值 ${amount} 元`,
            openid: user.openid,
            userId,
          });

          return {
            rechargeId: recharge.id,
            orderNo: recharge.orderNo,
            amount,
            paymentNo: paymentInfo.paymentNo,
            paymentInfo,
          };
        } catch (error) {
          await this.prisma.recharge
            .updateMany({
              where: { id: recharge.id, status: 'pending' },
              data: { status: 'failed' },
            })
            .catch(() => undefined);
          throw error;
        }
      },
      20,
    );
  }

  async checkWechatBinding(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { openid: true },
    });
    const [officialBinding, officialConfig] = await Promise.all([this.prisma.wechatOfficialBinding.findUnique({ where: { userId } }), this.prisma.config.findUnique({ where: { key: 'wechat_official' } })]);
    const official = (officialConfig?.value || {}) as Record<string, any>;
    const miniProgramBound = !!user?.openid;
    const officialAccountBound = !!officialBinding?.officialOpenid && officialBinding.subscribe !== false;
    const officialConfigured = !!(official.appId || official.appid || official.appSecret || official.secret || official.qrUrl || official.bindUrl);

    const bindingStatus = {
      isBound: miniProgramBound,
      miniprogram: miniProgramBound,
      official_account: officialAccountBound,
      wx_openid_mp: user?.openid || null,
      wx_openid_h5: null,
      official_account_name: official.name || official.accountName || '',
      official_account_qr_url: official.qrUrl || '',
      official_account_bind_url: official.bindUrl || '',
      show_official_account_binding: officialConfigured,
    };

    return {
      ...bindingStatus,
      data: bindingStatus,
    };
  }

  calculateTopExpireAt(currentExpireAt: Date | null | undefined, duration: number, durationUnit: string) {
    const now = new Date();
    const base = currentExpireAt && currentExpireAt > now ? currentExpireAt : now;
    return new Date(base.getTime() + this.packageDurationMs({ duration, durationUnit }));
  }
}
