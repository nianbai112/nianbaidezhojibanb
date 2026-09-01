import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentChannel } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { RechargeDto, WithdrawDto, QueryDto } from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async runWithLock<T>(key: string, message: string, fn: () => Promise<T>, ttlSeconds = 30): Promise<T> {
    const result = await this.redis.withRenewingLock(key, ttlSeconds, fn);
    if (result === undefined) throw new BadRequestException(message);
    return result;
  }

  // ============ 钱包 ============

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }
    return {
      ...wallet,
      balance: Number(wallet.balance),
      freeze: Number(wallet.freeze),
      totalIn: Number(wallet.totalIn),
      totalOut: Number(wallet.totalOut),
    };
  }

  async transactions(userId: string, query: QueryDto) {
    const { type, page = 1, pageSize = 20 } = query;
    const where: any = { userId };
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      list: list.map((t) => ({ ...t, amount: Number(t.amount), balance: Number(t.balance) })),
      total, page, pageSize,
    };
  }

  // ============ 充值 ============

  async recharge(userId: string, dto: RechargeDto) {
    const orderNo = `REC${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const recharge = await this.prisma.recharge.create({
      data: { userId, amount: dto.amount, channel: dto.channel, orderNo },
    });

    // 返回充值单信息，前端调微信支付
    return {
      recharge: { id: recharge.id, amount: Number(recharge.amount), orderNo },
      orderNo,
    };
  }

  // ============ 提现 ============

  private payoutAccountKey(value: unknown) {
    const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 7) return digits.length > 11 ? digits.slice(-11) : digits;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return text;
    if (/^[a-z0-9._-]{6,}$/.test(text)) return text;
    return '';
  }

  private async assertWithdrawRiskClear(tx: any, userId: string, account: string) {
    const accountKey = this.payoutAccountKey(account);
    if (accountKey) {
      // Reuse the database mutex table to serialize registration of the same
      // payout account across different users.
      const mutexKey = `payout:${accountKey}`;
      await tx.errandAssigneeMutex.upsert({
        where: { userId: mutexKey },
        create: { userId: mutexKey, version: 1 },
        update: { version: { increment: 1 } },
      });
    }
    const openAppeals = await tx.orderAppeal.findMany({
      where: {
        orderType: { in: ['errand', 'errand_order'] },
        status: { notIn: ['resolved', 'rejected', 'closed', 'cancelled', 'completed'] },
      },
      select: { orderId: true },
    });
    const appealOrderIds = openAppeals.map((item: any) => item.orderId).filter(Boolean);
    const [hold, openRisk, openAppealOrder, openLiability, sharedWithdraw, sharedRiderAccount] = await Promise.all([
      tx.errandSettlementHold.findFirst({
        where: { riderId: userId, status: 'holding' },
        select: { id: true },
      }),
      tx.deliveryRiskEvent.findFirst({
        where: {
          riderId: userId,
          orderType: 'errand',
          handled: false,
          eventLevel: { in: ['error', 'critical'] },
        },
        select: { id: true },
      }),
      appealOrderIds.length ? tx.errandOrder.findFirst({
        where: { id: { in: appealOrderIds }, riderId: userId },
        select: { id: true },
      }) : null,
      tx.riderLiability.findFirst({
        where: { riderId: userId, status: 'open' },
        select: { id: true },
      }),
      accountKey ? tx.withdraw.findFirst({
        where: {
          userId: { not: userId },
          account: accountKey,
          status: { in: ['PENDING', 'PROCESSING', 'SUCCESS'] },
        },
        select: { id: true },
      }) : null,
      accountKey ? tx.regionRider.findFirst({
        where: { userId: { not: userId }, alipayAccount: accountKey },
        select: { id: true },
      }) : null,
    ]);
    if (hold || openRisk || openAppealOrder || openLiability) {
      throw new BadRequestException('存在冻结收益、未结申诉、退款负债或未处理跑腿风险，暂不可提现');
    }
    if (sharedWithdraw || sharedRiderAccount) {
      throw new BadRequestException('该收款账号已绑定其他用户，请完成风控核验后再提现');
    }
  }

  private normalizeWithdraw(dto: any): WithdrawDto {
    const amount = Number(dto?.amount);
    const rawChannel = String(dto?.channel || dto?.withdraw_type || '').trim().toUpperCase();
    const channel = rawChannel === 'WECHAT' || rawChannel === 'WX' ? PaymentChannel.WX_PAY
      : rawChannel === 'ALIPAY' ? PaymentChannel.ALI_PAY
      : rawChannel as PaymentChannel;
    const rawAccount = String(
      dto?.account || dto?.receiver_mobile || dto?.wechat_mobile || dto?.receiver_name || dto?.wechat_name || dto?.wx_name || '',
    ).trim();
    const account = this.payoutAccountKey(rawAccount);
    const realName = String(dto?.realName || dto?.receiver_name || '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      throw new BadRequestException('提现金额必须为正数且最多两位小数');
    }
    if (channel !== PaymentChannel.WX_PAY && channel !== PaymentChannel.ALI_PAY) {
      throw new BadRequestException('不支持的提现渠道');
    }
    if (!account) throw new BadRequestException('请填写可核验的手机号、邮箱或收款账号，不能仅填写姓名');
    if (account.length > 100) throw new BadRequestException('收款账号不能超过 100 个字符');
    if (!realName) throw new BadRequestException('收款人姓名不能为空');
    if (realName.length > 50) throw new BadRequestException('收款人姓名不能超过 50 个字符');
    return { amount, channel, account, realName };
  }

  async withdraw(userId: string, dto: WithdrawDto) {
    return this.runWithLock(`finance:withdraw:${userId}`, '提现申请正在处理中，请稍后再试', async () => {
    const request = this.normalizeWithdraw(dto);
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < request.amount) {
      throw new BadRequestException('余额不足');
    }

    // 检查是否有正在处理的提现
    const pending = await this.prisma.withdraw.count({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (pending > 0) {
      throw new BadRequestException('有正在处理的提现申请');
    }

    // 使用事务：创建提现申请 + 冻结金额 + 记录流水
    const withdraw = await this.prisma.$transaction(async (tx) => {
      await this.assertWithdrawRiskClear(tx, userId, request.account);
      const w = await tx.withdraw.create({
        data: {
          userId,
          amount: request.amount,
          channel: request.channel,
          account: request.account,
          realName: request.realName,
        },
      });

      const debited = await tx.wallet.updateMany({
        where: { userId, balance: { gte: request.amount } },
        data: {
          balance: { decrement: request.amount },
          freeze: { increment: request.amount },
        },
      });
      if (debited.count !== 1) throw new BadRequestException('余额不足');

      await tx.walletTransaction.create({
        data: {
          userId,
          type: 'WITHDRAW',
          amount: request.amount,
          balance: Number(wallet.balance) - request.amount,
          channel: request.channel,
          description: `提现申请: ${request.account}`,
          status: 'PENDING',
        },
      });

      return w;
    });

    return { ...withdraw, amount: Number(withdraw.amount) };
    }, 60);
  }

  // ============ 支付回调处理充值 ============

  async completeRecharge(orderNo: string) {
    return this.runWithLock(`finance:recharge:${orderNo}`, '充值单正在处理中，请稍后再试', async () => {
    const recharge = await this.prisma.recharge.findUnique({ where: { orderNo } });
    if (!recharge) throw new NotFoundException('充值单不存在');
    if (recharge.status === 'success') return recharge;

    await this.prisma.$transaction(async (tx) => {
      await tx.recharge.update({
        where: { id: recharge.id },
        data: { status: 'success', payTime: new Date() },
      });

      await tx.wallet.upsert({
        where: { userId: recharge.userId },
        create: { userId: recharge.userId, balance: recharge.amount, totalIn: recharge.amount },
        update: {
          balance: { increment: recharge.amount },
          totalIn: { increment: recharge.amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: recharge.userId,
          type: 'RECHARGE',
          amount: recharge.amount,
          balance: recharge.amount,
          channel: recharge.channel,
          orderNo: recharge.orderNo,
          description: '余额充值',
          status: 'SUCCESS',
        },
      });
    });

    return { success: true };
    }, 60);
  }

  // ============ 平台财务统计 ============

  async platformStats() {
    const [totalIncome, totalRefund, platformFees] = await Promise.all([
      this.prisma.platformLedger.aggregate({
        where: { type: 'income', status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.platformLedger.aggregate({
        where: { type: 'refund', status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.platformLedger.aggregate({
        where: { type: 'commission', status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalIncome: Number(totalIncome._sum.amount || 0),
      totalRefund: Number(totalRefund._sum.amount || 0),
      platformFees: Number(platformFees._sum.amount || 0),
      netIncome: Number(totalIncome._sum.amount || 0) - Number(totalRefund._sum.amount || 0),
    };
  }
}
