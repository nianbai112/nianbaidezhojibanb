import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { RechargeDto, WithdrawDto, QueryDto } from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  async withdraw(userId: string, dto: WithdrawDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < Number(dto.amount)) {
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
      const w = await tx.withdraw.create({
        data: {
          userId,
          amount: dto.amount,
          channel: dto.channel,
          account: dto.account,
          realName: dto.realName,
        },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: dto.amount },
          freeze: { increment: dto.amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          type: 'WITHDRAW',
          amount: dto.amount,
          balance: Number(wallet.balance) - Number(dto.amount),
          channel: dto.channel,
          description: `提现申请: ${dto.account}`,
          status: 'PENDING',
        },
      });

      return w;
    });

    return { ...withdraw, amount: Number(withdraw.amount) };
  }

  // ============ 支付回调处理充值 ============

  async completeRecharge(orderNo: string) {
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
