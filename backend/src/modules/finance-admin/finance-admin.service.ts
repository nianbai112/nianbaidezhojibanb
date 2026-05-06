import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class FinanceAdminService {
  constructor(private readonly prisma: PrismaService) {}

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

    // 异步调用支付宝转账（此处为占位，实际接入需 alipay-sdk）
    this.executeAlipayTransfer(transfer.id, transfer.transferNo, dto).catch(err => {
      console.error('[AlipayTransfer] async transfer failed:', err.message);
    });

    return { id: transfer.id, transferNo };
  }

  private async executeAlipayTransfer(id: string, transferNo: string, dto: any) {
    // Mark as processing
    await this.prisma.alipayTransfer.update({
      where: { id },
      data: { status: 'processing' }
    });

    try {
      // TODO: 实际接入支付宝SDK
      // const AlipaySdk = require('alipay-sdk').default;
      // const alipay = new AlipaySdk({ appId, privateKey, ... });
      // const result = await alipay.exec('fund.trans.toaccount.transfer', {
      //   outBizNo: transferNo,
      //   payeeAccount: dto.payeeAccount,
      //   amount: dto.amount,
      //   payeeName: dto.payeeName,
      //   remark: dto.remark || '平台转账'
      // });

      // 模拟成功（生产环境替换为实际SDK调用结果）
      const mockSuccess = true;
      if (mockSuccess) {
        await this.prisma.alipayTransfer.update({
          where: { id },
          data: {
            status: 'success',
            alipayOrderNo: `ALIPAY_${Date.now()}`
          }
        });
      }
    } catch (err: any) {
      await this.prisma.alipayTransfer.update({
        where: { id },
        data: { status: 'failed', failReason: err.message || '转账失败' }
      });
    }
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
}
