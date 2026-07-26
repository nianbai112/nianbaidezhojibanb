import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class FinanceAdminService {
  private readonly logger = new Logger(FinanceAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 检查支付宝 SDK 是否已配置 */
  private isAlipayConfigured(): boolean {
    const appId = this.config.get('ALIPAY_APP_ID');
    const privateKey = this.config.get('ALIPAY_PRIVATE_KEY');
    const publicKey = this.config.get('ALIPAY_PUBLIC_KEY');
    if (!(appId && privateKey && publicKey)) return false;
    try {
      require.resolve('alipay-sdk');
      return true;
    } catch {
      return false;
    }
  }

  // ================= 支付宝转账 =================

  async getAlipayTransfers(query: any) {
    const { page = 1, pageSize = 20, status } = query;
    const where: any = {};
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.alipayTransfer.findMany({
        where,
        include: { operator: { select: { id: true, nickname: true } } },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.alipayTransfer.count({ where })
    ]);

    return {
      list: list.map(t => ({
        ...t,
        amount: Number(t.amount),
        payeeAccount: this.maskAccount(t.payeeAccount),
        payeeName: this.maskName(t.payeeName),
        operatorName: t.operator?.nickname
      })),
      total,
      page: +page,
      pageSize: +pageSize
    };
  }

  async getAlipayTransferDetail(id: string) {
    const t = await this.prisma.alipayTransfer.findUnique({
      where: { id },
      include: { operator: { select: { id: true, nickname: true } } }
    });
    if (!t) throw new NotFoundException('转账记录不存在');
    return {
      ...t,
      amount: Number(t.amount),
      payeeAccount: this.maskAccount(t.payeeAccount),
      payeeName: this.maskName(t.payeeName),
      operatorName: t.operator?.nickname
    };
  }

  async createAlipayTransfer(dto: any, operatorId?: string) {
    if (!dto.payeeAccount) throw new BadRequestException('收款账户不能为空');
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('金额必须大于0');

    const transferNo = `ALI_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const transfer = await this.prisma.alipayTransfer.create({
      data: {
        transferNo,
        payeeAccount: dto.payeeAccount,
        payeeName: dto.payeeName,
        amount: dto.amount,
        remark: dto.remark,
        operatorId: operatorId || null
      }
    });

    // 异步调用支付宝转账
    if (this.isAlipayConfigured()) {
      this.executeAlipayTransfer(transfer.id, transfer.transferNo, dto).catch(err => {
        this.logger.error(`[AlipayTransfer] 转账失败: ${err.message}`);
      });
    } else {
      // 支付宝 SDK 未配置 → 标记为需要人工处理
      this.logger.warn(`[AlipayTransfer] 支付宝 SDK 未配置，转账 ${transferNo} 需要人工打款确认`);
      this.prisma.alipayTransfer.update({
        where: { id: transfer.id },
        data: { status: 'manual_required' },
      }).catch(err => this.logger.error(`更新转账状态失败: ${err.message}`));
    }

    return { id: transfer.id, transferNo, autoProcessed: this.isAlipayConfigured() };
  }

  /** 执行真实支付宝转账（仅当 SDK 已配置） */
  private async executeAlipayTransfer(id: string, transferNo: string, dto: any) {
    await this.prisma.alipayTransfer.update({
      where: { id },
      data: { status: 'processing' },
    });

    try {
      // 接入支付宝 SDK（需配置环境变量 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AlipaySdk = require('alipay-sdk').default;
      const alipay = new AlipaySdk({
        appId: this.config.get('ALIPAY_APP_ID'),
        privateKey: this.config.get('ALIPAY_PRIVATE_KEY'),
        alipayPublicKey: this.config.get('ALIPAY_PUBLIC_KEY'),
        gateway: 'https://openapi.alipay.com/gateway.do',
      });

      const result = await alipay.exec('fund.trans.toaccount.transfer', {
        bizContent: {
          outBizNo: transferNo,
          payeeType: 'ALIPAY_LOGONID',
          payeeAccount: dto.payeeAccount,
          amount: dto.amount.toString(),
          payeeRealName: dto.payeeName || undefined,
          remark: dto.remark || '平台转账',
        },
      });

      if (result.code === '10000') {
        await this.prisma.alipayTransfer.update({
          where: { id },
          data: {
            status: 'success',
            alipayOrderNo: result.orderId || transferNo,
          },
        });
        this.logger.log(`支付宝转账成功: ${transferNo}`);
      } else {
        throw new Error(`支付宝返回错误: ${result.msg || result.subMsg || 'unknown'}`);
      }
    } catch (err: any) {
      this.logger.error(`支付宝转账失败: ${err.message}`);
      await this.prisma.alipayTransfer.update({
        where: { id },
        data: { status: 'failed', failReason: err.message || '转账失败' },
      });
    }
  }

  /** 人工确认支付宝转账已打款（用于 SDK 未接入时的兜底流程） */
  async manualConfirmAlipayTransfer(
    id: string,
    dto: { alipayOrderNo: string; reason?: string; evidence?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const transfer = await this.prisma.alipayTransfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException('转账记录不存在');
    if (transfer.status !== 'manual_required') {
      throw new BadRequestException(`只有 manual_required 状态的转账可以人工确认 (当前: ${transfer.status})`);
    }
    if (!dto.alipayOrderNo?.trim()) throw new BadRequestException('请提供支付宝转账单号');

    await this.prisma.alipayTransfer.update({
      where: { id },
      data: {
        status: 'success',
        alipayOrderNo: dto.alipayOrderNo.trim(),
        remark: transfer.remark
          ? `${transfer.remark}; 人工确认: ${dto.reason || ''}`
          : `人工确认打款: ${dto.reason || ''}`,
      },
    });

    this.logger.log(
      `支付宝转账人工确认: ${id} alipayOrderNo=${dto.alipayOrderNo} 操作人=${operatorId || 'unknown'}`,
    );

    // 记录操作日志
    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: {
            accountId: operatorId,
            action: 'manual_confirm_transfer',
            module: 'finance',
            targetId: id,
            targetType: 'alipay_transfer',
            detail: {
              transferNo: transfer.transferNo,
              alipayOrderNo: dto.alipayOrderNo,
              reason: dto.reason,
              amount: Number(transfer.amount),
            },
            ip: ip || '',
          },
        });
      } catch {
        /* 操作日志失败不影响主流程 */
      }
    }

    return { success: true, id, alipayOrderNo: dto.alipayOrderNo };
  }

  private maskAccount(account: string): string {
    if (!account || account.length < 8) return account || '';
    return account.slice(0, 3) + '****' + account.slice(-4);
  }

  private maskName(name?: string | null): string {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name[0] + '*'.repeat(name.length - 1);
  }

  // ================= 区域余额变动 =================

  async getRegionBalanceLogs(query: any) {
    const { page = 1, pageSize = 20, regionId, type } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.regionBalanceLog.findMany({
        where,
        include: {
          region: { select: { id: true, name: true } },
          operator: { select: { id: true, nickname: true } }
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.regionBalanceLog.count({ where })
    ]);

    return {
      list: list.map(l => ({
        ...l,
        amount: Number(l.amount),
        balance: Number(l.balance),
        regionName: l.region.name,
        operatorName: l.operator?.nickname
      })),
      total,
      page: +page,
      pageSize: +pageSize
    };
  }

  async adjustRegionBalance(dto: any, operatorId?: string) {
    if (!dto.regionId) throw new BadRequestException('区域不能为空');
    if (!dto.amount || dto.amount === 0) throw new BadRequestException('金额不能为0');

    const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
    if (!region) throw new NotFoundException('区域不存在');

    const newBalance = Number(region.balance || 0) + dto.amount;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.region.update({
        where: { id: dto.regionId },
        data: { balance: newBalance }
      });

      return tx.regionBalanceLog.create({
        data: {
          regionId: dto.regionId,
          type: dto.type || 'adjust',
          amount: dto.amount,
          balance: newBalance,
          description: dto.description,
          operatorId: operatorId || null
        }
      });
    });

    return result;
  }

  // ================= 支付订单查询 =================

  async getPaymentOrders(query: any) {
    const { page = 1, pageSize = 20, status, channel, startDate, endDate } = query;
    const where: any = {};
    if (status) where.status = status;
    if (channel) where.channel = channel;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);

    // 获取用户信息
    const userIds = [...new Set(list.map(o => o.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.nickname]));

    return {
      list: list.map(o => ({
        ...o,
        amount: Number(o.amount),
        userName: userMap.get(o.userId) || '-',
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ================= 退款订单查询 =================

  async getRefundOrders(query: any) {
    const { page = 1, pageSize = 20, status, startDate, endDate } = query;
    const where: any = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.refund.count({ where }),
    ]);

    return {
      list: list.map(r => ({
        ...r,
        amount: Number(r.amount),
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ================= 用户余额流水 =================

  async getUserWalletLogs(query: any) {
    const { page = 1, pageSize = 20, userId, type, startDate, endDate } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      list: list.map(t => ({
        ...t,
        amount: Number(t.amount),
        balance: Number(t.balance),
        userName: t.user?.nickname,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  // ================= 提现管理 =================

  async getWithdrawals(query: any) {
    const { page = 1, pageSize = 20, status, startDate, endDate } = query;
    const where: any = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.withdraw.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.withdraw.count({ where }),
    ]);

    return {
      list: list.map(w => ({
        ...w,
        amount: Number(w.amount),
        userName: w.user?.nickname,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async reviewWithdrawal(
    id: string,
    dto: { approved: boolean; reason?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const withdraw = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!withdraw) throw new NotFoundException('提现记录不存在');
    if (withdraw.status !== 'PENDING') {
      throw new BadRequestException(`当前状态 ${withdraw.status} 无法审核`);
    }

    const status = dto.approved ? 'PROCESSING' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.withdraw.update({
        where: { id },
        data: {
          status,
          failReason: dto.reason,
          processedAt: new Date(),
        },
      });

      if (!dto.approved) {
        // 拒绝时退还余额
        await tx.wallet.update({
          where: { userId: withdraw.userId },
          data: { balance: { increment: withdraw.amount }, freeze: { decrement: withdraw.amount } },
        });
      }

      return result;
    });

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: {
            accountId: operatorId,
            action: dto.approved ? 'approve_withdraw' : 'reject_withdraw',
            module: 'finance',
            targetId: id,
            targetType: 'withdraw',
            detail: { reason: dto.reason, amount: Number(withdraw.amount) },
            ip: ip || '',
          },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: updated };
  }

  // ================= 商家结算 =================

  async getMerchantSettlements(query: any) {
    const { page = 1, pageSize = 20, status, merchantId, startDate, endDate } = query;
    const where: any = {};
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.merchantSettlement.findMany({
        where,
        include: {
          merchant: { select: { id: true, name: true, logo: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
      this.prisma.merchantSettlement.count({ where }).catch(() => 0),
    ]);

    return {
      list: list.map(s => ({
        ...s,
        amount: Number(s.amount || 0),
        platformFee: Number(s.platformFee || 0),
        merchantName: s.merchant?.name,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async confirmMerchantSettlement(
    id: string,
    dto: { remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const settlement = await this.prisma.merchantSettlement.findUnique({ where: { id } }).catch(() => null);
    if (!settlement) throw new NotFoundException('结算记录不存在');

    const updated = await this.prisma.merchantSettlement.update({
      where: { id },
      data: {
        status: 'completed',
        remark: dto.remark,
        processedAt: new Date(),
      },
    });

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: {
            accountId: operatorId,
            action: 'confirm_settlement',
            module: 'finance',
            targetId: id,
            targetType: 'merchant_settlement',
            detail: { remark: dto.remark },
            ip: ip || '',
          },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: updated };
  }

  // ================= 骑手结算 =================

  async getRiderSettlements(query: any) {
    const { page = 1, pageSize = 20, status, riderId, regionId, startDate, endDate } = query;
    const where: any = {};
    if (status) where.status = status;
    if (riderId) where.riderId = riderId;
    if (regionId) where.regionId = regionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.riderSettlement.findMany({
        where,
        include: {
          rider: { select: { id: true, nickname: true, avatar: true } },
        },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.riderSettlement.count({ where }),
    ]);

    return {
      list: list.map(s => ({
        ...s,
        deliveryFeeTotal: Number(s.deliveryFeeTotal),
        rewardAmount: Number(s.rewardAmount),
        penaltyAmount: Number(s.penaltyAmount),
        payableAmount: Number(s.payableAmount),
        paidAmount: Number(s.paidAmount),
        riderName: s.rider?.nickname,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async getRiderSettlementDetail(id: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({
      where: { id },
      include: {
        rider: { select: { id: true, nickname: true, avatar: true, phone: true } },
      },
    });
    if (!settlement) throw new NotFoundException('结算记录不存在');

    const orders = await this.prisma.deliveryOrder.findMany({
      where: {
        riderId: settlement.riderId,
        status: 'COMPLETED',
        completeTime: { gte: settlement.periodStart, lte: settlement.periodEnd },
      },
      orderBy: { completeTime: 'desc' },
      take: 200,
    });

    return {
      ...settlement,
      deliveryFeeTotal: Number(settlement.deliveryFeeTotal),
      rewardAmount: Number(settlement.rewardAmount),
      penaltyAmount: Number(settlement.penaltyAmount),
      payableAmount: Number(settlement.payableAmount),
      paidAmount: Number(settlement.paidAmount),
      riderName: settlement.rider?.nickname,
      orders: orders.map(o => ({
        id: o.id,
        orderNo: o.orderNo,
        title: o.title,
        price: Number(o.price),
        tip: Number(o.tip),
        completeTime: o.completeTime,
      })),
    };
  }

  async generateRiderSettlements(dto: any, operatorId?: string) {
    const { periodStart, periodEnd, regionId } = dto;
    if (!periodStart || !periodEnd) throw new BadRequestException('结算周期起止时间不能为空');

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const completedOrders = await this.prisma.deliveryOrder.findMany({
      where: {
        status: 'COMPLETED',
        completeTime: { gte: start, lte: end },
        riderId: { not: null },
        ...(regionId ? { rider: { regionRiders: { some: { regionId } } } } : {}),
      },
      select: { riderId: true, price: true, tip: true },
    });

    if (!completedOrders.length) {
      return { success: true, message: '该周期内无已完成的配送订单', count: 0 };
    }

    const riderMap = new Map<string, { orderCount: number; deliveryFeeTotal: number }>();
    for (const order of completedOrders) {
      const rid = order.riderId!;
      const existing = riderMap.get(rid) || { orderCount: 0, deliveryFeeTotal: 0 };
      existing.orderCount += 1;
      existing.deliveryFeeTotal += Number(order.price) + Number(order.tip);
      riderMap.set(rid, existing);
    }

    let created = 0;
    for (const [riderId, stats] of riderMap) {
      const existing = await this.prisma.riderSettlement.findFirst({
        where: { riderId, periodStart: start, periodEnd: end },
      });
      if (existing) continue;

      const rewardAmount = 0;
      const penaltyAmount = 0;

      const settlementNo = `RS_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await this.prisma.riderSettlement.create({
        data: {
          settlementNo,
          riderId,
          regionId: regionId || null,
          periodStart: start,
          periodEnd: end,
          orderCount: stats.orderCount,
          deliveryFeeTotal: stats.deliveryFeeTotal,
          rewardAmount,
          penaltyAmount,
          payableAmount: stats.deliveryFeeTotal + rewardAmount - penaltyAmount,
          status: 'PENDING',
        },
      });
      created++;
    }

    return { success: true, count: created, message: `成功生成 ${created} 条骑手结算单` };
  }

  async confirmRiderSettlement(id: string, dto: any, operatorId?: string, ip?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.status !== 'PENDING') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法确认`);
    }

    const updated = await this.prisma.riderSettlement.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        remark: dto?.remark,
        confirmedBy: operatorId,
        confirmedAt: new Date(),
      },
    });

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: { accountId: operatorId, action: 'confirm_rider_settlement', module: 'finance', targetId: id, targetType: 'rider_settlement', ip: ip || '' },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: updated };
  }

  async payRiderSettlement(id: string, dto: any, operatorId?: string, ip?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.status !== 'CONFIRMED') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法打款`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.riderSettlement.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAmount: settlement.payableAmount,
          paidBy: operatorId,
          paidAt: new Date(),
          remark: dto?.remark,
        },
      });

      const wallet = await tx.wallet.upsert({
        where: { userId: settlement.riderId },
        create: {
          userId: settlement.riderId,
          balance: settlement.payableAmount,
          totalIn: settlement.payableAmount,
        },
        update: {
          balance: { increment: settlement.payableAmount },
          totalIn: { increment: settlement.payableAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: settlement.riderId,
          type: 'COMMISSION',
          amount: settlement.payableAmount,
          balance: wallet.balance,
          description: `骑手结算打款 ${settlement.settlementNo}`,
          status: 'SUCCESS',
        },
      });

      return result;
    });

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: { accountId: operatorId, action: 'pay_rider_settlement', module: 'finance', targetId: id, targetType: 'rider_settlement', ip: ip || '' },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: updated };
  }

  async rejectRiderSettlement(id: string, dto: any, operatorId?: string, ip?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.status !== 'PENDING' && settlement.status !== 'CONFIRMED') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法驳回`);
    }

    const updated = await this.prisma.riderSettlement.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: dto?.reason,
        rejectedBy: operatorId,
        rejectedAt: new Date(),
      },
    });

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: { accountId: operatorId, action: 'reject_rider_settlement', module: 'finance', targetId: id, targetType: 'rider_settlement', ip: ip || '' },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: updated };
  }

  // ================= 对账中心 =================

  async getReconciliation(query: any) {
    const { startDate, endDate } = query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();

    const [paymentAgg, refundAgg, withdrawAgg] = await Promise.all([
      this.prisma.paymentOrder.aggregate({
        where: { status: 'paid', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.refund.aggregate({
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.withdraw.aggregate({
        where: { status: 'SUCCESS', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const totalIncome = Number(paymentAgg._sum.amount || 0);
    const totalRefund = Number(refundAgg._sum.amount || 0);
    const totalWithdraw = Number(withdrawAgg._sum.amount || 0);

    return {
      period: { start, end },
      income: { total: totalIncome, count: paymentAgg._count },
      refund: { total: totalRefund, count: refundAgg._count },
      withdraw: { total: totalWithdraw, count: withdrawAgg._count },
      netIncome: totalIncome - totalRefund - totalWithdraw,
    };
  }

  // ================= 异常资金单 =================

  async getAbnormalOrders(query: any) {
    const { page = 1, pageSize = 20, type } = query;
    const results: any[] = [];
    const includeType = (value: string) => !type || type === value || type === 'all';

    // 长时间未支付订单
    if (includeType('long_unpaid')) {
      const unpaidOrders = await this.prisma.order.findMany({
        where: {
          status: 'PENDING_PAY',
          createdAt: { lte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        include: { user: { select: { id: true, nickname: true, phone: true } } },
        take: 30,
        orderBy: { createdAt: 'asc' },
      });
      results.push(...unpaidOrders.map(o => ({
        id: o.id,
        orderId: o.id,
        orderNo: o.orderNo,
        source: 'order',
        type: 'long_unpaid',
        title: '普通订单长时间未支付',
        description: '订单超过30分钟未支付',
        user: o.user,
        userId: o.userId,
        price: Number(o.payAmount || 0),
        amount: Number(o.payAmount || 0),
        status: String(o.status),
        cancelReason: '订单超过30分钟未支付',
        createdAt: o.createdAt,
      })));
    }

    // 退款中超过24小时
    if (includeType('refund_timeout')) {
      const refundingOrders = await this.prisma.order.findMany({
        where: {
          status: 'REFUNDING',
          updatedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        include: { user: { select: { id: true, nickname: true, phone: true } } },
        take: 30,
        orderBy: { updatedAt: 'asc' },
      });
      results.push(...refundingOrders.map(o => ({
        id: o.id,
        orderId: o.id,
        orderNo: o.orderNo,
        source: 'order',
        type: 'refund_timeout',
        title: '普通订单退款超时',
        description: '退款处理超过24小时',
        user: o.user,
        userId: o.userId,
        price: Number(o.payAmount || 0),
        amount: Number(o.payAmount || 0),
        status: String(o.status),
        cancelReason: '退款处理超过24小时',
        createdAt: o.updatedAt,
      })));
    }

    // 跑腿待接单/履约/退款异常
    if (includeType('errand_overdue')) {
      const errandOrders = await this.prisma.errandOrder.findMany({
        where: {
          OR: [
            { status: 'pending_accept', createdAt: { lte: new Date(Date.now() - 10 * 60 * 1000) } },
            { status: { in: ['accepted', 'in_progress', 'arrived'] }, updatedAt: { lte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
            { status: 'refunding', updatedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
        },
        include: {
          User: { select: { id: true, nickname: true, phone: true } },
          RegionRider: { select: { id: true, userId: true, realName: true, phone: true } },
        },
        take: 60,
        orderBy: { updatedAt: 'asc' },
      });
      results.push(...errandOrders.map(o => {
        const description = o.status === 'pending_accept'
          ? '跑腿订单超过10分钟无人接单'
          : o.status === 'refunding'
            ? '跑腿退款处理超过24小时'
            : '跑腿履约超过2小时未完成';
        return {
          id: o.id,
          orderId: o.id,
          orderNo: o.orderNo,
          source: 'errand',
          type: 'errand_overdue',
          title: o.title,
          description,
          user: o.User,
          rider: o.RegionRider,
          userId: o.userId,
          price: Number(o.payAmount || o.price || 0),
          amount: Number(o.payAmount || o.price || 0),
          status: o.status,
          cancelReason: description,
          createdAt: o.updatedAt,
        };
      }));
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
}
