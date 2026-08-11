import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 原子条件扣款（AUD-P1-184）：
   * 在同一事务内以 balance >= amount 条件更新钱包，
   * 只有影响行数 === 1 才视为扣款成功；否则视为余额不足并拒绝，
   * 从根本上杜绝“先读后减”的并发透支。
   * 钱包流水（WalletTransaction）的余额字段取扣减成功后的真实余额。
   * 调用方必须传入自己开启的事务 client（tx），以保证与支付单/订单更新原子一致。
   */
  async deductBalanceAtomic(
    userId: string,
    amount: number,
    meta: {
      type?: string;
      channel?: string;
      description?: string;
      status?: string;
      orderNo?: string;
    },
    tx?: any,
  ): Promise<{ balance: number }> {
    const db: any = tx || this.prisma;
    const amt = Number(amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException("扣款金额无效");
    }

    const result = await db.wallet.updateMany({
      where: { userId, balance: { gte: amt } },
      data: { balance: { decrement: amt } },
    });

    if (result.count !== 1) {
      throw new BadRequestException("钱包余额不足");
    }

    const wallet = await db.wallet.findUnique({ where: { userId } });
    const newBalance = Number(wallet?.balance || 0);

    await db.walletTransaction.create({
      data: {
        userId,
        type: (meta.type || "PAY") as any,
        amount: amt,
        balance: newBalance,
        channel: (meta.channel || "BALANCE") as any,
        description: meta.description || "余额支付",
        status: (meta.status || "SUCCESS") as any,
        orderNo: meta.orderNo || null,
      },
    });

    return { balance: newBalance };
  }
}
