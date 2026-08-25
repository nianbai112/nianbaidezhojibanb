import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { PrismaService } from '../../common/services/prisma.service';
import { errandExtendedConfigKey } from '../errand/errand-config.util';

@Injectable()
export class FinanceAdminService {
  private readonly logger = new Logger(FinanceAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adminDataScope: AdminDataScopeService,
  ) {}

  private userRegionScopeWhere(regionIds: string[]) {
    return {
      OR: [
        { profile: { is: { regionId: { in: regionIds } } } },
        { addresses: { some: { regionId: { in: regionIds } } } },
        { posts: { some: { regionId: { in: regionIds } } } },
        { botAccount: { is: { regionId: { in: regionIds } } } },
      ],
    };
  }

  private async assertUserRegionAccess(operatorId: string | undefined, userId: string) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!scope.regionIds.length) throw new ForbiddenException('当前管理员未绑定区域数据范围');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profile: { select: { regionId: true } },
        addresses: { select: { regionId: true } },
        posts: { select: { regionId: true } },
        botAccount: { select: { regionId: true } },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    const userRegions = new Set<string>();
    if (user.profile?.regionId) userRegions.add(user.profile.regionId);
    user.addresses.forEach(item => item.regionId && userRegions.add(item.regionId));
    user.posts.forEach(item => item.regionId && userRegions.add(item.regionId));
    if (user.botAccount?.regionId) userRegions.add(user.botAccount.regionId);
    if (!scope.regionIds.some(regionId => userRegions.has(regionId))) {
      throw new ForbiddenException('无权访问该区域数据');
    }
  }

  private async subsidyLedgerRegionWhere(operatorId?: string) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return {};
    if (!scope.regionIds.length) return { id: { in: [] } };
    const [orders, errandOrders, activityOrders] = await Promise.all([
      this.prisma.order.findMany({ where: { merchant: { regionId: { in: scope.regionIds } } }, select: { id: true } }),
      this.prisma.errandOrder.findMany({ where: { regionId: { in: scope.regionIds } }, select: { id: true } }),
      this.prisma.activityOrder.findMany({ where: { activity: { regionId: { in: scope.regionIds } } }, select: { id: true } }),
    ]);
    return {
      OR: [
        { payerType: 'region', payerId: { in: scope.regionIds } },
        { orderType: 'order', orderId: { in: orders.map(item => item.id) } },
        { orderType: 'errand_order', orderId: { in: errandOrders.map(item => item.id) } },
        { orderType: 'activity_order', orderId: { in: activityOrders.map(item => item.id) } },
      ],
    };
  }

  private async assertMerchantSettlementAccess(operatorId: string | undefined, settlement: any) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!settlement?.merchant?.regionId || !scope.regionIds.includes(settlement.merchant.regionId)) {
      throw new ForbiddenException('无权操作该区域商家结算');
    }
  }

  private async paymentOrderRegionScope(operatorId?: string) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return { scope, where: {} };
    if (!scope.regionIds.length) return { scope, where: { id: { in: [] } } };
    const [orders, errandOrders] = await Promise.all([
      this.prisma.order.findMany({ where: { merchant: { regionId: { in: scope.regionIds } } }, select: { id: true } }),
      this.prisma.errandOrder.findMany({ where: { regionId: { in: scope.regionIds } }, select: { id: true } }),
    ]);
    const branches = [
      ...(orders.length ? [{ bizType: 'order', bizId: { in: orders.map((item) => item.id) } }] : []),
      ...(errandOrders.length ? [{ bizType: 'errand_order', bizId: { in: errandOrders.map((item) => item.id) } }] : []),
    ];
    return { scope, where: branches.length ? { OR: branches } : { id: { in: [] } } };
  }

  private async resolveRiderRegionIds(operatorId?: string, requestedRegionId?: string | null) {
    const regionId = requestedRegionId ? String(requestedRegionId) : '';
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return regionId ? [regionId] : undefined;
    if (regionId) {
      if (!scope.regionIds.includes(regionId)) throw new ForbiddenException('无权访问该区域骑手结算');
      return [regionId];
    }
    return scope.regionIds;
  }

  private async assertRiderSettlementAccess(operatorId: string | undefined, settlement: any) {
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (scope.isSuperAdmin) return;
    if (!settlement?.regionId || !scope.regionIds.includes(settlement.regionId)) {
      throw new ForbiddenException('无权操作该区域骑手结算');
    }
  }

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    return Number(value) || 0;
  }

  private errandIncentives(order: any, config: any, review: any) {
    const rules: Array<{ ruleType: string; type: 'rider_reward' | 'rider_penalty'; amount: number; description: string }> = [];
    const goodReviewReward = this.toNumber(config?.goodReviewReward);
    const badReviewPenalty = this.toNumber(config?.badReviewPenalty);
    const timeoutPenalty = this.toNumber(config?.timeoutPenalty);
    const nightReward = this.toNumber(config?.nightReward);
    if (Number(review?.rating) === 5 && goodReviewReward > 0) {
      rules.push({ ruleType: 'good_review', type: 'rider_reward', amount: goodReviewReward, description: '跑腿五星好评奖励' });
    } else if ([1, 2].includes(Number(review?.rating)) && badReviewPenalty > 0) {
      rules.push({ ruleType: 'bad_review', type: 'rider_penalty', amount: badReviewPenalty, description: '跑腿差评处罚' });
    }
    const pickupAt = order?.pickupTime ? new Date(order.pickupTime) : null;
    const deliveredAt = order?.deliverTime ? new Date(order.deliverTime) : null;
    const timeoutMinutes = Math.max(1, Number(config?.timeoutMinutes || 30));
    if (pickupAt && deliveredAt && deliveredAt.getTime() - pickupAt.getTime() > timeoutMinutes * 60 * 1000 && timeoutPenalty > 0) {
      rules.push({ ruleType: 'delivery_timeout', type: 'rider_penalty', amount: timeoutPenalty, description: `跑腿履约超过${timeoutMinutes}分钟处罚` });
    }
    if (pickupAt && nightReward > 0) {
      const shanghaiHour = (pickupAt.getUTCHours() + 8) % 24;
      if (shanghaiHour >= 22 || shanghaiHour < 6) {
        rules.push({ ruleType: 'night_pickup', type: 'rider_reward', amount: nightReward, description: '跑腿夜间履约奖励' });
      }
    }
    return rules;
  }

  private pageParams(query: any) {
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 20)));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private parseStartDate(value?: string | Date | null): Date | undefined {
    if (!value) return undefined;
    return value instanceof Date ? value : new Date(value);
  }

  private parseEndDate(value?: string | Date | null): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const raw = String(value);
    return new Date(raw.includes('T') ? raw : `${raw}T23:59:59.999`);
  }

  private dateRange(query: any, defaultDays = 7) {
    const end = this.parseEndDate(query?.endDate) || new Date();
    const start = this.parseStartDate(query?.startDate) || new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseSettlementSources(remark?: string | null): any[] {
    if (!remark) return [];
    try {
      const parsed = JSON.parse(remark);
      return Array.isArray(parsed?.sourceOrders) ? parsed.sourceOrders : [];
    } catch {
      return [];
    }
  }

  private isCoveredBySettlement(
    earning: { riderId: string; completeTime: Date },
    settlements: Array<{ riderId: string; periodStart: Date; periodEnd: Date }>,
  ): boolean {
    const completeAt = earning.completeTime.getTime();
    return settlements.some(s =>
      s.riderId === earning.riderId &&
      completeAt >= s.periodStart.getTime() &&
      completeAt <= s.periodEnd.getTime(),
    );
  }

  private async getCompletedRiderEarnings(options: {
    start: Date;
    end: Date;
    riderId?: string;
    regionId?: string;
    regionIds?: string[];
    includeCovered?: boolean;
  }) {
    const { start, end, riderId, regionId, regionIds, includeCovered = false } = options;
    const scopedRegion = regionIds !== undefined ? { in: regionIds } : regionId || undefined;
    const [errandOrders, deliveryOrders, coveredSettlements] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: {
          status: 'completed',
          refundStatus: { notIn: ['refunding', 'refunded'] },
          receiptConfirmedAt: { not: null },
          settlementEligibleAt: { gte: start, lte: end },
          riderId: riderId ? riderId : { not: null },
          ...(scopedRegion ? { regionId: scopedRegion } : {}),
        },
        include: {
          User: { select: { id: true, nickname: true, phone: true } },
          RegionRider: { select: { userId: true, realName: true, phone: true } },
        },
          orderBy: { completeTime: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] as any[] },
          refundStatus: { notIn: ['refunding', 'refunded'] },
          OR: [
            { deliverTime: { gte: start, lte: end } },
            // 兼容上线前未记录送达时间的历史单，避免已确认订单漏结算。
            { deliverTime: null, completeTime: { gte: start, lte: end } },
          ],
          riderId: riderId ? riderId : { not: null },
          deliveryMode: { in: ['platform_rider', 'rider_delivery'] },
          businessType: { not: 'dorm_shop' },
          ...(scopedRegion ? { merchant: { regionId: scopedRegion } } : {}),
        },
        include: {
          merchant: { select: { id: true, name: true, regionId: true } },
          user: { select: { id: true, nickname: true, phone: true } },
        },
        orderBy: [{ deliverTime: 'desc' }, { completeTime: 'desc' }],
      }),
      includeCovered
        ? Promise.resolve([])
        : this.prisma.riderSettlement.findMany({
            where: {
              status: { not: 'REJECTED' },
              periodEnd: { gte: start },
              periodStart: { lte: end },
              ...(riderId ? { riderId } : {}),
              ...(scopedRegion ? { regionId: scopedRegion } : {}),
            },
            select: { riderId: true, periodStart: true, periodEnd: true },
          }),
    ]);

    const errandRegionIds = Array.from(new Set(
      errandOrders.map((order: any) => String(order.regionId || '')).filter(Boolean),
    ));
    const configStore = (this.prisma as any).config;
    const configRows: Array<{ key: string; value: any }> = configStore?.findMany && errandRegionIds.length
      ? await configStore.findMany({
          where: {
            key: {
              in: [
                ...errandRegionIds.map(errandExtendedConfigKey),
                errandExtendedConfigKey('global'),
              ],
            },
          },
          select: { key: true, value: true },
        })
      : [];
    const settlementConfig = new Map(configRows.map(row => [row.key, row.value]));
    const globalSettlementConfig = settlementConfig.get(errandExtendedConfigKey('global')) || {};
    const settlementV2Enabled = (regionId?: string | null) => {
      const value = settlementConfig.get(errandExtendedConfigKey(String(regionId || ''))) || globalSettlementConfig;
      return (value?.settlementV2Enabled ?? value?.settlement_v2_enabled ?? true) !== false;
    };

    const deliverySubsidyMap = new Map<string, number>();
    const deliveryOrderIds = deliveryOrders.map((o: any) => o.id).filter(Boolean);
    if (deliveryOrderIds.length) {
      const groups = await (this.prisma as any).subsidyLedger.groupBy({
        by: ['orderId'],
        where: {
          orderType: 'order',
          orderId: { in: deliveryOrderIds },
          receiverType: 'rider',
          status: { not: 'cancelled' },
        },
        _sum: { amount: true },
      }).catch(() => []);
      for (const item of groups) {
        deliverySubsidyMap.set(item.orderId, this.toNumber(item._sum?.amount));
      }
    }

    const earnings = [
      ...errandOrders
        .filter(o => !!o.riderId && !!o.completeTime && (includeCovered || settlementV2Enabled(o.regionId)))
        .map(o => ({
          source: 'errand',
          id: o.id,
          orderId: o.id,
          orderNo: o.orderNo,
          riderId: o.riderId!,
          riderName: o.RegionRider?.realName || o.RegionRider?.phone || o.riderId!,
          regionId: o.regionId || null,
          title: o.title,
          userName: o.User?.nickname || o.User?.phone || '-',
          amount: this.toNumber(o.price) + this.toNumber(o.tip),
          price: this.toNumber(o.price),
          tip: this.toNumber(o.tip),
          pickupTime: o.pickupTime,
          deliverTime: o.deliverTime,
          completeTime: o.completeTime!,
        })),
      ...deliveryOrders
        .filter(o => !!o.riderId && !!(o.deliverTime || o.completeTime))
        .map(o => {
          const paidFreight = this.toNumber(o.freightAmount);
          const subsidyAmount = deliverySubsidyMap.get(o.id) || 0;
          const originalFreight = this.toNumber((o as any).originalFreightAmount);
          const riderAmount = Math.max(originalFreight, paidFreight + subsidyAmount, paidFreight);
          return {
            source: 'delivery_order',
            id: o.id,
            orderId: o.id,
            orderNo: o.orderNo,
            riderId: o.riderId!,
            riderName: o.riderId!,
            regionId: o.merchant?.regionId || null,
            title: o.merchant?.name || '配送订单',
            userName: o.user?.nickname || o.user?.phone || '-',
            amount: riderAmount,
            price: riderAmount,
            tip: 0,
            subsidyAmount,
            paidFreight,
            completeTime: o.deliverTime || o.completeTime!,
          };
        }),
    ];

    return earnings
      .filter(e => e.amount > 0)
      .filter(e => includeCovered || !this.isCoveredBySettlement(e, coveredSettlements))
      .sort((a, b) => b.completeTime.getTime() - a.completeTime.getTime());
  }

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

  async getSubsidyOverview(query: any = {}, operatorId?: string) {
    const { start, end } = this.dateRange(query, 30);
    const where: any = { createdAt: { gte: start, lte: end } };
    const regionWhere = await this.subsidyLedgerRegionWhere(operatorId);
    if (Object.keys(regionWhere).length) where.AND = [regionWhere];
    if (query?.sourceType) where.sourceType = String(query.sourceType);
    if (query?.benefitKey) where.benefitKey = String(query.benefitKey);
    if (query?.status) where.status = String(query.status);

    const [total, count, bySource, byReceiver, byStatus] = await Promise.all([
      (this.prisma as any).subsidyLedger.aggregate({ where, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
      (this.prisma as any).subsidyLedger.count({ where }).catch(() => 0),
      (this.prisma as any).subsidyLedger.groupBy({ by: ['sourceType'], where, _sum: { amount: true }, _count: { id: true } }).catch(() => []),
      (this.prisma as any).subsidyLedger.groupBy({ by: ['receiverType'], where, _sum: { amount: true }, _count: { id: true } }).catch(() => []),
      (this.prisma as any).subsidyLedger.groupBy({ by: ['status'], where, _sum: { amount: true }, _count: { id: true } }).catch(() => []),
    ]);

    const mapGroup = (rows: any[], key: string) => rows.map(item => ({
      key: item[key],
      amount: this.toNumber(item._sum?.amount),
      count: item._count?.id || 0,
    }));

    return {
      period: { start, end },
      amount: this.toNumber(total._sum?.amount),
      count,
      bySource: mapGroup(bySource, 'sourceType'),
      byReceiver: mapGroup(byReceiver, 'receiverType'),
      byStatus: mapGroup(byStatus, 'status'),
    };
  }

  async getSubsidyLedgers(query: any = {}, operatorId?: string) {
    const { page, pageSize, skip } = this.pageParams(query);
    const where: any = {};
    const regionWhere = await this.subsidyLedgerRegionWhere(operatorId);
    if (Object.keys(regionWhere).length) where.AND = [regionWhere];
    if (query?.sourceType) where.sourceType = String(query.sourceType);
    if (query?.benefitKey) where.benefitKey = String(query.benefitKey);
    if (query?.orderType) where.orderType = String(query.orderType);
    if (query?.status) where.status = String(query.status);
    if (query?.receiverType) where.receiverType = String(query.receiverType);
    if (query?.keyword) {
      const keyword = String(query.keyword).trim();
      where.OR = [
        { subsidyNo: { contains: keyword } },
        { orderNo: { contains: keyword } },
        { orderId: { contains: keyword } },
        { userId: { contains: keyword } },
      ];
    }
    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = this.parseStartDate(query.startDate);
      if (query.endDate) where.createdAt.lte = this.parseEndDate(query.endDate);
    }

    const [list, total] = await Promise.all([
      (this.prisma as any).subsidyLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }).catch(() => []),
      (this.prisma as any).subsidyLedger.count({ where }).catch(() => 0),
    ]);

    return {
      list: list.map((item: any) => ({
        ...item,
        amount: this.toNumber(item.amount),
        sourceText: this.subsidySourceText(item.sourceType),
        receiverText: this.subsidyReceiverText(item.receiverType),
        statusText: this.subsidyStatusText(item.status),
      })),
      total,
      page,
      pageSize,
    };
  }

  private subsidySourceText(value?: string | null) {
    const map: Record<string, string> = {
      membership: '会员权益',
      coupon: '优惠券',
      new_user: '新用户活动',
      referral: '拉新活动',
      campaign: '运营活动',
      manual: '人工补贴',
    };
    return map[String(value || '')] || value || '-';
  }

  private subsidyReceiverText(value?: string | null) {
    const map: Record<string, string> = {
      rider: '骑手',
      merchant: '商家',
      platform: '平台',
      user: '用户',
    };
    return map[String(value || '')] || value || '-';
  }

  private subsidyStatusText(value?: string | null) {
    const map: Record<string, string> = {
      pending: '待结算',
      locked: '已锁定',
      settled: '已结算',
      cancelled: '已取消',
    };
    return map[String(value || '')] || value || '-';
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

  async getRegionBalanceLogs(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, regionId, type } = query;
    const where: any = await this.adminDataScope.regionFieldWhere('regionId', operatorId, regionId);
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

    await this.adminDataScope.assertRegionAccess(operatorId, dto.regionId);

    const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
    if (!region) throw new NotFoundException('区域不存在');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.region.update({
        where: { id: dto.regionId },
        data: { balance: { increment: dto.amount } },
        select: { balance: true },
      });

      return tx.regionBalanceLog.create({
        data: {
          regionId: dto.regionId,
          type: dto.type || 'adjust',
          amount: dto.amount,
          balance: updated.balance ?? 0,
          description: dto.description,
          operatorId: operatorId || null
        }
      });
    });

    return result;
  }

  // ================= 财务总览 =================

  async getFinanceOverview(query: any = {}, operatorId?: string) {
    const { start, end } = this.dateRange(query, 7);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const paymentScope = await this.paymentOrderRegionScope(operatorId);
    const scope = paymentScope.scope;
    const scopedPaymentWhere = (base: any) => scope.isSuperAdmin ? base : { ...base, AND: [paymentScope.where] };
    const scopedUserWhere = scope.isSuperAdmin ? {} : { user: { is: this.userRegionScopeWhere(scope.regionIds) } };
    const scopedRiderWhere = scope.isSuperAdmin ? {} : { regionId: { in: scope.regionIds } };

    const [
      todayIncomeAgg,
      periodIncomeAgg,
      pendingWithdrawAgg,
      pendingSettlementAgg,
      paidRiderSettlementAgg,
      abnormalOrders,
      latestPayments,
      latestWithdrawals,
      latestSettlements,
      unsettledEarnings,
    ] = await Promise.all([
      this.prisma.paymentOrder.aggregate({
        where: scopedPaymentWhere({ status: 'paid', payTime: { gte: todayStart, lte: todayEnd } }),
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.paymentOrder.aggregate({
        where: scopedPaymentWhere({ status: 'paid', payTime: { gte: start, lte: end } }),
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.withdraw.aggregate({
        where: { status: 'PENDING', ...scopedUserWhere },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.riderSettlement.aggregate({
        where: { status: { in: ['PENDING', 'CONFIRMED'] as any[] }, ...scopedRiderWhere },
        _sum: { payableAmount: true },
        _count: true,
      }),
      this.prisma.riderSettlement.aggregate({
        where: { status: 'PAID', paidAt: { gte: start, lte: end }, ...scopedRiderWhere },
        _sum: { paidAmount: true },
        _count: true,
      }),
      this.getAbnormalOrders({ page: 1, pageSize: 1, type: 'all' }, operatorId),
      this.prisma.paymentOrder.findMany({
        where: scopedPaymentWhere({ status: 'paid' }),
        orderBy: { payTime: 'desc' },
        take: 8,
      }),
      this.prisma.withdraw.findMany({
        where: { status: 'PENDING', ...scopedUserWhere },
        include: { user: { select: { id: true, nickname: true, phone: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.riderSettlement.findMany({
        where: scopedRiderWhere,
        include: { rider: { select: { id: true, nickname: true, phone: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.getCompletedRiderEarnings({ start, end, regionIds: scope.isSuperAdmin ? undefined : scope.regionIds }),
    ]);

    const unsettledAmount = unsettledEarnings.reduce((sum, item) => sum + item.amount, 0);
    const unsettledRiderIds = new Set(unsettledEarnings.map(item => item.riderId));

    return {
      period: { start, end },
      cards: {
        todayIncome: {
          label: '今日实收',
          amount: this.toNumber(todayIncomeAgg._sum.amount),
          count: todayIncomeAgg._count,
        },
        periodIncome: {
          label: '周期实收',
          amount: this.toNumber(periodIncomeAgg._sum.amount),
          count: periodIncomeAgg._count,
        },
        pendingWithdrawals: {
          label: '待审核提现',
          amount: this.toNumber(pendingWithdrawAgg._sum.amount),
          count: pendingWithdrawAgg._count,
        },
        unsettledRiderIncome: {
          label: '骑手待结算',
          amount: unsettledAmount,
          count: unsettledEarnings.length,
          riderCount: unsettledRiderIds.size,
        },
        pendingRiderSettlements: {
          label: '待处理结算',
          amount: this.toNumber(pendingSettlementAgg._sum.payableAmount),
          count: pendingSettlementAgg._count,
        },
        abnormalOrders: {
          label: '异常资金单',
          amount: 0,
          count: abnormalOrders.total || 0,
        },
        paidRiderSettlements: {
          label: '周期骑手打款',
          amount: this.toNumber(paidRiderSettlementAgg._sum.paidAmount),
          count: paidRiderSettlementAgg._count,
        },
      },
      latestPayments: latestPayments.map(o => ({
        ...o,
        amount: this.toNumber(o.amount),
        refundedAmount: this.toNumber(o.refundedAmount),
      })),
      latestWithdrawals: latestWithdrawals.map(w => ({
        ...w,
        amount: this.toNumber(w.amount),
        userName: w.user?.nickname || w.user?.phone || w.userId,
      })),
      latestRiderEarnings: unsettledEarnings.slice(0, 10),
      latestRiderSettlements: latestSettlements.map(s => ({
        ...s,
        deliveryFeeTotal: this.toNumber(s.deliveryFeeTotal),
        rewardAmount: this.toNumber(s.rewardAmount),
        penaltyAmount: this.toNumber(s.penaltyAmount),
        payableAmount: this.toNumber(s.payableAmount),
        paidAmount: this.toNumber(s.paidAmount),
        riderName: s.rider?.nickname || s.rider?.phone || s.riderId,
      })),
    };
  }

  // ================= 支付订单查询 =================

  async getPaymentOrders(query: any, operatorId?: string) {
    const { page, pageSize, skip } = this.pageParams(query);
    const { status, channel, startDate, endDate, keyword } = query;
    const where: any = {};
    const paymentScope = await this.paymentOrderRegionScope(operatorId);
    if (Object.keys(paymentScope.where).length) where.AND = [paymentScope.where];
    const statusMap: Record<string, string> = {
      SUCCESS: 'paid',
      PENDING: 'pending',
      PAYING: 'paying',
      FAILED: 'failed',
      CANCELLED: 'closed',
      CLOSED: 'closed',
      REFUNDING: 'refunding',
      REFUNDED: 'refunded',
    };
    if (status) where.status = statusMap[String(status).toUpperCase()] || status;
    if (channel) where.channel = channel;
    if (keyword?.trim()) {
      where.OR = [
        { orderNo: { contains: keyword.trim() } },
        { paymentNo: { contains: keyword.trim() } },
        { wxTransId: { contains: keyword.trim() } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      const start = this.parseStartDate(startDate);
      const end = this.parseEndDate(endDate);
      if (start) where.createdAt.gte = start;
      if (end) where.createdAt.lte = end;
    }

    const [list, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        skip,
        take: pageSize,
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
        refundedAmount: Number(o.refundedAmount || 0),
        userName: userMap.get(o.userId) || '-',
      })),
      total,
      page,
      pageSize,
    };
  }

  // ================= 退款订单查询 =================

  async getRefundOrders(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, status, startDate, endDate, keyword } = query;
    const legacyWhere: any = {};
    const paymentWhere: any = {};
    const paymentScope = await this.paymentOrderRegionScope(operatorId);
    if (!paymentScope.scope.isSuperAdmin) {
      legacyWhere.order = { is: { merchant: { regionId: { in: paymentScope.scope.regionIds } } } };
      paymentWhere.AND = [{ payment: { is: paymentScope.where } }];
    }
    const statusUpper = String(status || '').toUpperCase();
    if (statusUpper) {
      const legacyStatus: Record<string, any> = {
        SUCCESS: 'completed', PROCESSING: { in: ['pending', 'approved', 'processing'] }, FAILED: 'rejected',
      };
      const paymentStatus: Record<string, any> = {
        SUCCESS: 'success', PROCESSING: { in: ['pending', 'processing'] }, FAILED: 'failed',
      };
      legacyWhere.status = legacyStatus[statusUpper] || String(status).toLowerCase();
      paymentWhere.status = paymentStatus[statusUpper] || String(status).toLowerCase();
    }
    if (keyword?.trim()) {
      const value = keyword.trim();
      legacyWhere.OR = [
        { id: { contains: value } },
        { refundNo: { contains: value } },
        { orderId: { contains: value } },
        { order: { is: { orderNo: { contains: value } } } },
      ];
      paymentWhere.OR = [
        { refundNo: { contains: value } },
        { payment: { is: { orderNo: { contains: value } } } },
        { payment: { is: { bizId: { contains: value } } } },
      ];
    }
    if (startDate || endDate) {
      const createdAt: any = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
      legacyWhere.createdAt = createdAt;
      paymentWhere.createdAt = createdAt;
    }
    const currentPage = Math.max(1, +page);
    const currentPageSize = Math.min(100, Math.max(1, +pageSize));
    const take = currentPage * currentPageSize;

    const [legacyList, paymentList, legacyTotal, paymentTotal] = await Promise.all([
      this.prisma.refund.findMany({
        where: legacyWhere,
        include: {
          order: { select: { id: true, orderNo: true, userId: true, user: { select: { id: true, nickname: true, avatar: true, phone: true } } } },
        },
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentRefund.findMany({
        where: paymentWhere,
        include: { payment: { select: { orderNo: true, bizType: true, bizId: true, userId: true } } },
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.refund.count({ where: legacyWhere }),
      this.prisma.paymentRefund.count({ where: paymentWhere }),
    ]);

    const legacyStatus: Record<string, string> = { completed: 'SUCCESS', pending: 'PROCESSING', approved: 'PROCESSING', processing: 'PROCESSING', rejected: 'FAILED' };
    const paymentStatus: Record<string, string> = { success: 'SUCCESS', pending: 'PROCESSING', processing: 'PROCESSING', failed: 'FAILED' };
    const list = [
      ...legacyList.map((r: any) => ({
        ...r, source: 'legacy', bizType: 'order', amount: Number(r.amount),
        orderNo: r.order?.orderNo, user: r.order?.user, userId: r.order?.userId,
        status: legacyStatus[r.status] || String(r.status).toUpperCase(), failureReason: r.rejectReason || '',
      })),
      ...paymentList.map((r: any) => ({
        id: r.id, refundNo: r.refundNo, amount: Number(r.amount), reason: r.reason,
        source: 'payment', bizType: r.payment?.bizType, orderNo: r.payment?.orderNo,
        userId: r.payment?.userId, status: paymentStatus[r.status] || String(r.status).toUpperCase(),
        failureReason: r.failReason || '', createdAt: r.createdAt,
      })),
    ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      list: list.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize),
      total: legacyTotal + paymentTotal,
      page: currentPage,
      pageSize: currentPageSize,
    };
  }

  // ================= 用户余额流水 =================

  async getUserWalletLogs(query: any, operatorId?: string) {
    const { page, pageSize, skip } = this.pageParams(query);
    const { userId, type, startDate, endDate, keyword } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) where.user = { is: this.userRegionScopeWhere(scope.regionIds) };
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (keyword?.trim()) {
      where.OR = [
        { orderNo: { contains: keyword.trim() } },
        { description: { contains: keyword.trim() } },
        { user: { is: { OR: [
          { nickname: { contains: keyword.trim() } },
          { phone: { contains: keyword.trim() } },
        ] } } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      const start = this.parseStartDate(startDate);
      const end = this.parseEndDate(endDate);
      if (start) where.createdAt.gte = start;
      if (end) where.createdAt.lte = end;
    }

    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        },
        skip,
        take: pageSize,
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
      page,
      pageSize,
    };
  }

  // ================= 提现管理 =================

  async getWithdrawals(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, status, startDate, endDate, keyword } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) where.user = { is: this.userRegionScopeWhere(scope.regionIds) };
    if (status) where.status = status;
    if (keyword?.trim()) {
      const value = keyword.trim();
      where.OR = [
        { id: { contains: value } },
        { userId: { contains: value } },
        { account: { contains: value } },
        { realName: { contains: value } },
        { transferNo: { contains: value } },
        { user: { is: { OR: [
          { nickname: { contains: value } },
          { phone: { contains: value } },
        ] } } },
      ];
    }
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
    await this.assertUserRegionAccess(operatorId, withdraw.userId);
    if (withdraw.status !== 'PENDING') {
      throw new BadRequestException(`当前状态 ${withdraw.status} 无法审核`);
    }

    if (dto.approved) {
      const liability = await this.prisma.riderLiability.aggregate({
        where: { riderId: withdraw.userId, status: 'open' },
        _sum: { amount: true, recoveredAmount: true },
      });
      const outstanding = this.toNumber(liability._sum.amount) - this.toNumber(liability._sum.recoveredAmount);
      if (outstanding > 0) throw new BadRequestException('存在未偿还的跑腿退款负债，暂不可提现');
    }

    const status = dto.approved ? 'PROCESSING' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.withdraw.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status,
          failReason: dto.reason,
          processedAt: new Date(),
        },
      });
      if (transition.count !== 1) throw new BadRequestException('提现状态已变更，请刷新后重试');

      if (!dto.approved) {
        // 拒绝时退还余额
        const wallet = await tx.wallet.update({
          where: { userId: withdraw.userId },
          data: { balance: { increment: withdraw.amount }, freeze: { decrement: withdraw.amount } },
        });
        await tx.walletTransaction.create({
          data: {
            userId: withdraw.userId,
            type: 'WITHDRAW',
            amount: withdraw.amount,
            balance: wallet.balance,
            channel: withdraw.channel,
            orderNo: `WD_RETURN_${withdraw.id}`,
            description: `提现被拒退回: ${dto.reason || ''}`,
            status: 'SUCCESS',
          },
        });
      }

      return tx.withdraw.findUnique({ where: { id } });
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

  async completeWithdrawal(id: string, dto: { transferNo?: string }, operatorId?: string, ip?: string) {
    const transferNo = String(dto.transferNo || '').trim();
    if (!transferNo) throw new BadRequestException('请填写打款流水号');
    const withdraw = await this.prisma.withdraw.findUnique({ where: { id } });
    if (!withdraw) throw new NotFoundException('提现记录不存在');
    await this.assertUserRegionAccess(operatorId, withdraw.userId);
    if (withdraw.status !== 'PROCESSING') throw new BadRequestException(`当前状态 ${withdraw.status} 无法确认打款`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.withdraw.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'SUCCESS', transferNo, processedAt: new Date() },
      });
      if (transition.count !== 1) throw new BadRequestException('提现状态已变更，请刷新后重试');
      const wallet = await tx.wallet.update({
        where: { userId: withdraw.userId },
        data: { freeze: { decrement: withdraw.amount }, totalOut: { increment: withdraw.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          userId: withdraw.userId,
          type: 'WITHDRAW',
          amount: withdraw.amount,
          balance: wallet.balance,
          channel: withdraw.channel,
          orderNo: withdraw.id,
          description: `提现打款完成: ${transferNo}`,
          status: 'SUCCESS',
        },
      });
      return tx.withdraw.findUnique({ where: { id } });
    });

    if (operatorId) {
      await this.prisma.adminOperationLog.create({
        data: { accountId: operatorId, action: 'complete_withdraw', module: 'finance', targetId: id, targetType: 'withdraw', detail: { transferNo }, ip: ip || '' },
      }).catch(() => undefined);
    }
    return { success: true, data: updated };
  }

  // ================= 商家结算 =================

  async getMerchantSettlements(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, status, merchantId, startDate, endDate } = query;
    const where: any = {};
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (!scope.isSuperAdmin) where.merchant = { regionId: { in: scope.regionIds } };
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
        netAmount: Number(s.amount || 0) - Number(s.platformFee || 0),
        merchantName: s.merchant?.name,
        isAdjustment: String(s.periodKey || '').startsWith('refund-adjustment:'),
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
    const settlement = await this.prisma.merchantSettlement.findUnique({
      where: { id }, include: { merchant: { select: { regionId: true } } },
    }).catch(() => null);
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertMerchantSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'pending') throw new BadRequestException('只有待确认结算单可以确认');

    const processedAt = new Date();
    const claimed = await this.prisma.merchantSettlement.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'completed',
        remark: dto.remark,
        processedAt,
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('结算状态已变化，请刷新后重试');
    const updated = { ...settlement, status: 'completed', remark: dto.remark, processedAt };

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

  async payMerchantSettlement(
    id: string,
    dto: { transferNo?: string; remark?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const transferNo = String(dto.transferNo || '').trim();
    if (!transferNo) throw new BadRequestException('请填写线下打款流水号');
    const settlement = await this.prisma.merchantSettlement.findUnique({
      where: { id }, include: { merchant: { select: { regionId: true } } },
    }).catch(() => null);
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertMerchantSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'completed') throw new BadRequestException('只有已核算结算单可以登记打款');
    if (Number(settlement.amount || 0) - Number(settlement.platformFee || 0) < 0) {
      throw new BadRequestException('退款差额调整单请登记抵扣，不能登记打款');
    }

    const processedAt = new Date();
    const claimed = await this.prisma.merchantSettlement.updateMany({
      where: { id, status: 'completed' },
      data: { status: 'paid', transferNo, remark: dto.remark ?? settlement.remark, processedAt },
    });
    if (claimed.count !== 1) throw new BadRequestException('结算状态已变化，请刷新后重试');
    const updated = { ...settlement, status: 'paid', transferNo, remark: dto.remark ?? settlement.remark, processedAt };

    if (operatorId) {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId, action: 'pay_merchant_settlement', module: 'finance', targetId: id,
          targetType: 'merchant_settlement', detail: { transferNo, remark: dto.remark }, ip: ip || '',
        },
      }).catch(() => undefined);
    }
    return { success: true, data: updated };
  }

  async offsetMerchantSettlement(
    id: string,
    dto: { reference?: string },
    operatorId?: string,
    ip?: string,
  ) {
    const reference = String(dto.reference || '').trim();
    if (!reference) throw new BadRequestException('请填写抵扣凭证或后续结算单号');
    const settlement = await this.prisma.merchantSettlement.findUnique({
      where: { id }, include: { merchant: { select: { regionId: true } } },
    }).catch(() => null);
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertMerchantSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'completed') throw new BadRequestException('只有已核算差额单可以登记抵扣');
    if (Number(settlement.amount || 0) - Number(settlement.platformFee || 0) >= 0) {
      throw new BadRequestException('正向结算单请登记线下打款');
    }

    const processedAt = new Date();
    const remark = [settlement.remark, `已登记差额抵扣：${reference}`].filter(Boolean).join('\n');
    const claimed = await this.prisma.merchantSettlement.updateMany({
      where: { id, status: 'completed' },
      data: { status: 'paid', transferNo: reference, remark, processedAt },
    });
    if (claimed.count !== 1) throw new BadRequestException('结算状态已变化，请刷新后重试');
    const updated = { ...settlement, status: 'paid', transferNo: reference, remark, processedAt };

    if (operatorId) {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId, action: 'offset_merchant_settlement', module: 'finance', targetId: id,
          targetType: 'merchant_settlement', detail: { reference }, ip: ip || '',
        },
      }).catch(() => undefined);
    }
    return { success: true, data: updated };
  }

  // ================= 骑手结算 =================

  async getRiderSettlements(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, status, riderId, regionId, startDate, endDate } = query;
    const where: any = {};
    const regionIds = await this.resolveRiderRegionIds(operatorId, regionId);
    if (regionIds !== undefined) where.regionId = { in: regionIds };
    if (status) where.status = status;
    if (riderId) where.riderId = riderId;
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

  async getRiderPendingSummary(query: any = {}, operatorId?: string) {
    const { start, end } = this.dateRange(query, 30);
    const regionIds = await this.resolveRiderRegionIds(operatorId, query?.regionId);
    const earnings = await this.getCompletedRiderEarnings({
      start,
      end,
      riderId: query?.riderId,
      regionIds,
    });

    const riderMap = new Map<string, {
      riderId: string;
      riderName: string;
      orderCount: number;
      amount: number;
      lastCompleteTime?: Date;
    }>();

    for (const item of earnings) {
      const current = riderMap.get(item.riderId) || {
        riderId: item.riderId,
        riderName: item.riderName,
        orderCount: 0,
        amount: 0,
        lastCompleteTime: item.completeTime,
      };
      current.orderCount += 1;
      current.amount += item.amount;
      if (!current.lastCompleteTime || item.completeTime > current.lastCompleteTime) {
        current.lastCompleteTime = item.completeTime;
      }
      riderMap.set(item.riderId, current);
    }

    const list = Array.from(riderMap.values())
      .map(item => ({ ...item, amount: Number(item.amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      period: { start, end },
      amount: Number(earnings.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      orderCount: earnings.length,
      riderCount: list.length,
      list,
      latestOrders: earnings.slice(0, 20),
    };
  }

  async getRiderSettlementDetail(id: string, operatorId?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({
      where: { id },
      include: {
        rider: { select: { id: true, nickname: true, avatar: true, phone: true } },
      },
    });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertRiderSettlementAccess(operatorId, settlement);

    const orders = await this.getCompletedRiderEarnings({
      start: settlement.periodStart,
      end: settlement.periodEnd,
      riderId: settlement.riderId,
      regionId: settlement.regionId || undefined,
      includeCovered: true,
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
        source: o.source,
        price: Number(o.price),
        tip: Number(o.tip),
        amount: Number(o.amount),
        completeTime: o.completeTime,
      })),
    };
  }

  async generateRiderSettlements(dto: any, operatorId?: string) {
    const { periodStart, periodEnd, regionId } = dto;
    if (!periodStart || !periodEnd) throw new BadRequestException('结算周期起止时间不能为空');

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const regionIds = await this.resolveRiderRegionIds(operatorId, regionId);
    if (regionIds !== undefined && regionIds.length !== 1) {
      throw new BadRequestException(regionIds.length ? '请选择一个结算区域' : '当前管理员未绑定区域数据范围');
    }
    const settlementRegionId = regionIds?.[0];
    const completedOrders = await this.getCompletedRiderEarnings({ start, end, regionIds });

    if (!completedOrders.length) {
      return { success: true, message: '该周期内无未结算的骑手订单', count: 0 };
    }

    const errandIds = completedOrders.filter(item => item.source === 'errand').map(item => item.orderId);
    const itemKeys = completedOrders.map(item => ({ orderType: item.source, orderId: item.orderId }));
    const [openAppeals, openRisks, existingItems] = await Promise.all([
      errandIds.length ? this.prisma.orderAppeal.findMany({
        where: {
          orderType: { in: ['errand', 'errand_order'] },
          orderId: { in: errandIds },
          status: { notIn: ['resolved', 'rejected', 'closed', 'cancelled'] },
        },
        select: { orderId: true },
      }) : [],
      errandIds.length ? this.prisma.deliveryRiskEvent.findMany({
        where: { orderType: { in: ['errand', 'errand_order'] }, orderId: { in: errandIds }, handled: false },
        select: { orderId: true },
      }) : [],
      itemKeys.length ? this.prisma.riderSettlementItem.findMany({
        where: { OR: itemKeys },
        select: { orderType: true, orderId: true },
      }) : [],
    ]);
    const blockedErrandIds = new Set([...openAppeals, ...openRisks].map(item => item.orderId));
    const settledKeys = new Set(existingItems.map(item => `${item.orderType}:${item.orderId}`));
    const eligibleOrders = completedOrders.filter(item =>
      !blockedErrandIds.has(item.orderId) && !settledKeys.has(`${item.source}:${item.orderId}`),
    );

    if (!eligibleOrders.length) {
      return { success: true, message: '该周期内无可结算的骑手订单', count: 0 };
    }

    const eligibleErrandIds = eligibleOrders
      .filter(item => item.source === 'errand')
      .map(item => item.orderId);
    const eligibleErrandRegionIds = Array.from(new Set(
      eligibleOrders
        .filter(item => item.source === 'errand')
        .map(item => String(item.regionId || ''))
        .filter(Boolean),
    ));
    const [rewardConfigs, reviews] = await Promise.all([
      eligibleErrandRegionIds.length && (this.prisma as any).errandRewardPunish?.findMany
        ? (this.prisma as any).errandRewardPunish.findMany({
            where: { regionId: { in: eligibleErrandRegionIds } },
          })
        : [],
      eligibleErrandIds.length && (this.prisma as any).errandReview?.findMany
        ? (this.prisma as any).errandReview.findMany({
            where: { orderId: { in: eligibleErrandIds }, status: 'active' },
            select: { orderId: true, rating: true },
          })
        : [],
    ]);
    const rewardConfigByRegion = new Map(rewardConfigs.map((config: any) => [config.regionId, config]));
    const reviewByOrder = new Map(reviews.map((review: any) => [review.orderId, review]));
    const enrichedOrders = eligibleOrders.map(order => {
      const incentives = order.source === 'errand'
        ? this.errandIncentives(
            order,
            rewardConfigByRegion.get(String(order.regionId || '')),
            reviewByOrder.get(order.orderId),
          )
        : [];
      return {
        ...order,
        incentives,
        incentiveReward: incentives
          .filter(rule => rule.type === 'rider_reward')
          .reduce((sum, rule) => sum + rule.amount, 0),
        incentivePenalty: incentives
          .filter(rule => rule.type === 'rider_penalty')
          .reduce((sum, rule) => sum + rule.amount, 0),
      };
    });

    const riderMap = new Map<string, {
      orderCount: number;
      deliveryFeeTotal: number;
      rewardAmount: number;
      penaltyAmount: number;
      regionId?: string | null;
      orderIds: string[];
      items: any[];
    }>();
    for (const order of enrichedOrders) {
      const rid = order.riderId!;
      const existing = riderMap.get(rid) || {
        orderCount: 0,
        deliveryFeeTotal: 0,
        rewardAmount: 0,
        penaltyAmount: 0,
        regionId: order.regionId,
        orderIds: [],
        items: [],
      };
      existing.orderCount += 1;
      existing.deliveryFeeTotal += Number(order.amount);
      existing.rewardAmount += Number(order.incentiveReward || 0);
      existing.penaltyAmount += Number(order.incentivePenalty || 0);
      existing.regionId = existing.regionId || order.regionId || null;
      existing.orderIds.push(order.orderId || order.id);
      existing.items.push(order);
      riderMap.set(rid, existing);
    }

    let created = 0;
    for (const [riderId, stats] of riderMap) {
      const periodKey = `${riderId}:${start.toISOString()}:${end.toISOString()}`;
      const existing = await this.prisma.riderSettlement.findFirst({
        where: { riderId, periodStart: start, periodEnd: end },
      });
      if (existing) continue;

      const rewardAmount = Number(stats.rewardAmount.toFixed(2));
      const penaltyAmount = Number(stats.penaltyAmount.toFixed(2));

      const settlementNo = `RS_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const settlement = await this.prisma.$transaction(async tx => {
        const header = await tx.riderSettlement.create({
          data: {
            settlementNo,
            riderId,
            regionId: settlementRegionId || stats.regionId || null,
            periodStart: start,
            periodEnd: end,
            periodKey,
            orderCount: stats.orderCount,
            deliveryFeeTotal: Number(stats.deliveryFeeTotal.toFixed(2)),
            rewardAmount,
            penaltyAmount,
            payableAmount: Number((stats.deliveryFeeTotal + rewardAmount - penaltyAmount).toFixed(2)),
            status: 'PENDING',
            remark: JSON.stringify({
              note: `系统按订单级明细生成，操作人：${operatorId || 'system'}`,
              sourceOrders: stats.items.map(item => ({ id: item.orderId, orderNo: item.orderNo, source: item.source, amount: item.amount, subsidyAmount: item.subsidyAmount || 0 })),
            }),
          },
        });
        for (const item of stats.items) {
          for (const incentive of item.incentives || []) {
            const actionKey = `errand:${item.orderId}:${incentive.ruleType}`;
            await tx.incentiveRecord.upsert({
              where: { actionKey },
              create: {
                actionKey,
                userId: riderId,
                regionId: item.regionId || null,
                orderType: 'errand',
                orderId: item.orderId,
                type: incentive.type,
                ruleType: incentive.ruleType,
                amount: incentive.amount,
                description: incentive.description,
              },
              update: {},
            });
          }
          const itemRewardAmount = Number(
            (Number(item.incentiveReward || 0) + Number(item.subsidyAmount || 0)).toFixed(2),
          );
          const itemPenaltyAmount = Number(Number(item.incentivePenalty || 0).toFixed(2));
          await tx.riderSettlementItem.create({
            data: {
              settlementId: header.id,
              orderType: item.source,
              orderId: item.orderId,
              riderId,
              deliveryFeeAmount: Number(item.price || 0),
              tipAmount: Number(item.tip || 0),
              rewardAmount: itemRewardAmount,
              penaltyAmount: itemPenaltyAmount,
              payableAmount: Number((Number(item.amount) + Number(item.incentiveReward || 0) - itemPenaltyAmount).toFixed(2)),
            },
          });
        }
        await tx.subsidyLedger.updateMany({
          where: { orderId: { in: stats.orderIds }, receiverType: 'rider', status: 'pending' },
          data: { status: 'locked', settlementId: header.id },
        });
        return header;
      }).catch((error: any) => {
        if (error?.code === 'P2002') return null;
        throw error;
      });
      if (!settlement) continue;
      created++;
    }

    return { success: true, count: created, message: `成功生成 ${created} 条骑手结算单` };
  }

  async reverseErrandSettlement(orderId: string, refundId: string, amount: number, reason: string) {
    const item = await this.prisma.riderSettlementItem.findUnique({
      where: { orderType_orderId: { orderType: 'errand', orderId } },
      include: { settlement: true },
    });
    if (!item) return { success: true, reversed: false, liabilityCreated: false };

    const reversalAmount = Number(Math.min(Math.max(0, amount), this.toNumber(item.payableAmount)).toFixed(2));
    if (!reversalAmount) return { success: true, reversed: false, liabilityCreated: false };
    const fullyReversed = reversalAmount >= this.toNumber(item.payableAmount);

    if (item.settlement.status === 'PAID') {
      await this.prisma.$transaction(async tx => {
        await tx.riderSettlementItem.updateMany({
          where: { id: item.id, status: { in: ['included', 'adjusted'] } },
          data: {
            status: fullyReversed ? 'reversed' : 'adjusted',
            reversalAmount,
            reversedAt: new Date(),
            reverseReason: reason,
          },
        });
        await tx.riderLiability.upsert({
          where: { orderId_refundId: { orderId, refundId } },
          create: { riderId: item.riderId, orderId, refundId, amount: reversalAmount, reason },
          update: {},
        });
      });
      return { success: true, reversed: true, liabilityCreated: true };
    }

    await this.prisma.$transaction(async tx => {
      await tx.riderSettlementItem.updateMany({
        where: { id: item.id, status: { in: ['included', 'adjusted'] } },
        data: {
          status: fullyReversed ? 'reversed' : 'adjusted',
          reversalAmount,
          reversedAt: new Date(),
          reverseReason: reason,
        },
      });
      const items = await tx.riderSettlementItem.findMany({ where: { settlementId: item.settlementId } });
      const active = items.filter(entry => entry.status !== 'reversed');
      const payableAmount = active.reduce(
        (sum, entry) => sum + this.toNumber(entry.payableAmount) - this.toNumber(entry.reversalAmount), 0,
      );
      await tx.riderSettlement.update({
        where: { id: item.settlementId },
        data: { orderCount: active.length, payableAmount: Number(payableAmount.toFixed(2)) },
      });
    });
    return { success: true, reversed: true, liabilityCreated: false };
  }

  async confirmRiderSettlement(id: string, dto: any, operatorId?: string, ip?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertRiderSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'PENDING') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法确认`);
    }

    const updated = await this.prisma.riderSettlement.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'CONFIRMED',
        remark: dto?.remark,
        confirmedBy: operatorId,
        confirmedAt: new Date(),
      },
    });
    if (!updated.count) throw new BadRequestException('结算单状态已变更，请刷新后重试');

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: { accountId: operatorId, action: 'confirm_rider_settlement', module: 'finance', targetId: id, targetType: 'rider_settlement', ip: ip || '' },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: { ...settlement, status: 'CONFIRMED' } };
  }

  async payRiderSettlement(id: string, dto: any, operatorId?: string, ip?: string) {
    const settlement = await this.prisma.riderSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    await this.assertRiderSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'CONFIRMED') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法打款`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const liabilities = await tx.riderLiability.findMany({
        where: { riderId: settlement.riderId, status: 'open' },
        orderBy: { createdAt: 'asc' },
      });
      let remainingRecovery = this.toNumber(settlement.payableAmount);
      let liabilityRecovered = 0;
      const liabilityUpdates: Array<{ id: string; recoveredAmount: number; status: string }> = [];
      for (const liability of liabilities) {
        const outstanding = Math.max(0, this.toNumber(liability.amount) - this.toNumber(liability.recoveredAmount));
        const recovered = Math.min(outstanding, remainingRecovery);
        if (!recovered) continue;
        const recoveredAmount = Number((this.toNumber(liability.recoveredAmount) + recovered).toFixed(2));
        liabilityUpdates.push({
          id: liability.id,
          recoveredAmount,
          status: recoveredAmount >= this.toNumber(liability.amount) ? 'recovered' : 'open',
        });
        remainingRecovery = Number((remainingRecovery - recovered).toFixed(2));
        liabilityRecovered = Number((liabilityRecovered + recovered).toFixed(2));
      }
      const netPaidAmount = Number(Math.max(0, this.toNumber(settlement.payableAmount) - liabilityRecovered).toFixed(2));
      const result = await tx.riderSettlement.updateMany({
        where: { id, status: 'CONFIRMED' },
        data: {
          status: 'PAID',
          paidAmount: netPaidAmount,
          paidBy: operatorId,
          paidAt: new Date(),
          remark: dto?.remark,
        },
      });
      if (!result.count) throw new BadRequestException('结算单状态已变更，请刷新后重试');

      for (const liability of liabilityUpdates) {
        await tx.riderLiability.update({
          where: { id: liability.id },
          data: { recoveredAmount: liability.recoveredAmount, status: liability.status },
        });
      }

      if (netPaidAmount > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId: settlement.riderId },
          create: { userId: settlement.riderId, balance: netPaidAmount, totalIn: netPaidAmount },
          update: { balance: { increment: netPaidAmount }, totalIn: { increment: netPaidAmount } },
        });

        await tx.walletTransaction.create({
          data: {
            userId: settlement.riderId,
            type: 'COMMISSION',
            amount: netPaidAmount,
            balance: wallet.balance,
            description: `骑手结算打款 ${settlement.settlementNo}${liabilityRecovered ? `（已抵扣退款负债 ${liabilityRecovered} 元）` : ''}`,
            status: 'SUCCESS',
          },
        });
      }

      return { ...settlement, status: 'PAID', paidAmount: netPaidAmount, liabilityRecovered };
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
    await this.assertRiderSettlementAccess(operatorId, settlement);
    if (settlement.status !== 'PENDING' && settlement.status !== 'CONFIRMED') {
      throw new BadRequestException(`当前状态 ${settlement.status} 无法驳回`);
    }

    const updated = await this.prisma.riderSettlement.updateMany({
      where: { id, status: { in: ['PENDING', 'CONFIRMED'] as any[] } },
      data: {
        status: 'REJECTED',
        rejectReason: dto?.reason,
        rejectedBy: operatorId,
        rejectedAt: new Date(),
      },
    });
    if (!updated.count) throw new BadRequestException('结算单状态已变更，请刷新后重试');

    if (operatorId) {
      try {
        await this.prisma.adminOperationLog.create({
          data: { accountId: operatorId, action: 'reject_rider_settlement', module: 'finance', targetId: id, targetType: 'rider_settlement', ip: ip || '' },
        });
      } catch { /* ignore */ }
    }

    return { success: true, data: { ...settlement, status: 'REJECTED' } };
  }

  // ================= 对账中心 =================

  async getReconciliation(query: any) {
    const { page, pageSize, skip } = this.pageParams(query);
    const { start, end } = this.dateRange(query, 7);

    const [paymentAgg, refundAgg, withdrawAgg, payments, refunds] = await Promise.all([
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
      this.prisma.paymentOrder.findMany({
        where: { status: 'paid', createdAt: { gte: start, lte: end } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.refund.findMany({
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const totalIncome = Number(paymentAgg._sum.amount || 0);
    const totalRefund = Number(refundAgg._sum.amount || 0);
    const totalWithdraw = Number(withdrawAgg._sum.amount || 0);
    const dayMap = new Map<string, { date: string; orderCount: number; payAmount: number; refundAmount: number; netAmount: number; status: string }>();

    for (const item of payments) {
      const date = this.dayKey(item.createdAt);
      const current = dayMap.get(date) || { date, orderCount: 0, payAmount: 0, refundAmount: 0, netAmount: 0, status: 'reconciled' };
      current.orderCount += 1;
      current.payAmount += this.toNumber(item.amount);
      current.netAmount = current.payAmount - current.refundAmount;
      dayMap.set(date, current);
    }

    for (const item of refunds) {
      const date = this.dayKey(item.createdAt);
      const current = dayMap.get(date) || { date, orderCount: 0, payAmount: 0, refundAmount: 0, netAmount: 0, status: 'reconciled' };
      current.refundAmount += this.toNumber(item.amount);
      current.netAmount = current.payAmount - current.refundAmount;
      dayMap.set(date, current);
    }

    const allList = Array.from(dayMap.values())
      .map(row => ({
        ...row,
        payAmount: Number(row.payAmount.toFixed(2)),
        refundAmount: Number(row.refundAmount.toFixed(2)),
        netAmount: Number(row.netAmount.toFixed(2)),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const list = allList.slice(skip, skip + pageSize);

    return {
      period: { start, end },
      income: { total: totalIncome, count: paymentAgg._count },
      refund: { total: totalRefund, count: refundAgg._count },
      withdraw: { total: totalWithdraw, count: withdrawAgg._count },
      netIncome: totalIncome - totalRefund - totalWithdraw,
      list,
      total: allList.length,
      page,
      pageSize,
    };
  }

  // ================= 异常资金单 =================

  async getAbnormalOrders(query: any, operatorId?: string) {
    const { page = 1, pageSize = 20, type, regionId } = query;
    const results: any[] = [];
    const includeType = (value: string) => !type || type === value || type === 'all';
    const scope = await this.adminDataScope.getAdminContext(operatorId);
    if (regionId && !scope.isSuperAdmin && !scope.regionIds.includes(String(regionId))) {
      throw new ForbiddenException('无权访问该区域异常订单');
    }
    const regionIds = scope.isSuperAdmin
      ? (regionId ? [String(regionId)] : undefined)
      : (regionId ? [String(regionId)] : scope.regionIds);
    const shopRegionWhere = regionIds !== undefined ? { merchant: { regionId: { in: regionIds } } } : {};
    const errandRegionWhere = regionIds !== undefined ? { regionId: { in: regionIds } } : {};

    // 长时间未支付订单
    if (includeType('long_unpaid')) {
      const unpaidOrders = await this.prisma.order.findMany({
        where: {
          status: 'PENDING_PAY',
          createdAt: { lte: new Date(Date.now() - 30 * 60 * 1000) },
          ...shopRegionWhere,
        },
        include: { user: { select: { id: true, nickname: true, phone: true } }, merchant: { select: { id: true, name: true, regionId: true } } },
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
        merchantId: o.merchantId,
        merchantName: o.merchant?.name || '',
        regionId: o.merchant?.regionId || '',
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
          refundStatus: 'refunding',
          updatedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ...shopRegionWhere,
        },
        include: { user: { select: { id: true, nickname: true, phone: true } }, merchant: { select: { id: true, name: true, regionId: true } } },
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
        merchantId: o.merchantId,
        merchantName: o.merchant?.name || '',
        regionId: o.merchant?.regionId || '',
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
            { refundStatus: 'refunding', updatedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
          ...errandRegionWhere,
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
          : o.refundStatus === 'refunding'
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
          regionId: o.regionId || '',
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

  // ================= 平台抽成总览 =================

  async getCommissionOverview(query: any = {}) {
    const { start, end } = this.dateRange(query, 30);

    // ── 1. 外卖板块：来自 MerchantSettlement.platformFee ──
    const [settlementsByRegion, dailySettlements] = await Promise.all([
      this.prisma.merchantSettlement.groupBy({
        by: ['merchantId'],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { platformFee: true, amount: true },
        _count: true,
      }),
      this.prisma.merchantSettlement.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { platformFee: true, amount: true, createdAt: true },
      }),
    ]);

    const merchantIds = settlementsByRegion.map(s => s.merchantId);
    const merchants = merchantIds.length
      ? await this.prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true, regionId: true, region: { select: { id: true, name: true, commissionRate: true } } },
        })
      : [];
    const merchantMap = new Map(merchants.map(m => [m.id, m]));

    const regionMap = new Map<string, {
      regionId: string; regionName: string; commissionRate: number;
      totalAmount: number; totalPlatformFee: number; orderCount: number;
    }>();
    let deliveryTotal = { platformFee: 0, amount: 0, count: 0 };
    for (const row of settlementsByRegion) {
      const merchant = merchantMap.get(row.merchantId);
      const regionId = merchant?.regionId || 'unknown';
      const regionName = merchant?.region?.name || '未知区域';
      const commissionRate = this.toNumber(merchant?.region?.commissionRate);
      const existing = regionMap.get(regionId) || { regionId, regionName, commissionRate, totalAmount: 0, totalPlatformFee: 0, orderCount: 0 };
      existing.totalAmount += this.toNumber(row._sum.amount);
      existing.totalPlatformFee += this.toNumber(row._sum.platformFee);
      existing.orderCount += row._count;
      regionMap.set(regionId, existing);
      deliveryTotal.platformFee += this.toNumber(row._sum.platformFee);
      deliveryTotal.amount += this.toNumber(row._sum.amount);
      deliveryTotal.count += row._count;
    }

    // ── 2. 商城板块：MallOrder.platformFee ──
    const [mallAgg, mallOrders] = await Promise.all([
      this.prisma.mallOrder.aggregate({
        where: { status: { in: ['paid', 'shipped', 'received', 'completed'] }, payTime: { gte: start, lte: end } },
        _sum: { platformFee: true, payAmount: true },
        _count: true,
      }),
      this.prisma.mallOrder.findMany({
        where: { status: { in: ['paid', 'shipped', 'received', 'completed'] }, payTime: { gte: start, lte: end } },
        select: { platformFee: true, payAmount: true, payTime: true },
      }),
    ]);

    // ── 3. 跑腿板块：ErrandOrder.platformFee ──
    const [errandAgg, errandOrders] = await Promise.all([
      this.prisma.errandOrder.aggregate({
        where: { status: 'completed', completeTime: { gte: start, lte: end } },
        _sum: { platformFee: true, payAmount: true },
        _count: true,
      }),
      this.prisma.errandOrder.findMany({
        where: { status: 'completed', completeTime: { gte: start, lte: end } },
        select: { platformFee: true, payAmount: true, completeTime: true },
      }),
    ]);

    // ── 4. 其他业务：PaymentOrder 按 bizType 分组（充值/置顶/活动/拼团/交友/二手/会员） ──
    const otherBizTypes = ['recharge', 'topup', 'activity_order', 'group_buy_order', 'dating_order', 'second_hand_order', 'membership'];
    const otherPayments = await this.prisma.paymentOrder.groupBy({
      by: ['bizType'],
      where: { status: 'paid', bizType: { in: otherBizTypes }, payTime: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: true,
    });

    // 拿各业务费率配置
    const feeConfigs = await this.prisma.bizFeeConfig.findMany().catch(() => [] as any[]);
    const feeMap = new Map(feeConfigs.map((c: any) => [c.bizType, { rate: Number(c.rate || 0), fixedFee: Number(c.fixedFee || 0), enabled: c.enabled }]));

    const bizTypeLabels: Record<string, string> = {
      order: '外卖订单', errand_order: '跑腿订单', mall_order: '商城订单',
      recharge: '余额充值', topup: '付费置顶', activity_order: '活动报名',
      group_buy_order: '拼团订单', dating_order: '交友订单', second_hand_order: '二手订单', membership: '会员购买',
    };

    const bizBreakdown: Array<{ bizType: string; label: string; rate: number; fixedFee: number; enabled: boolean; totalAmount: number; totalPlatformFee: number; orderCount: number }> = [];

    // 外卖
    bizBreakdown.push({
      bizType: 'order', label: '外卖订单',
      rate: 0, fixedFee: 0, enabled: true, // 外卖按区域费率，这里显示综合实际费率
      totalAmount: deliveryTotal.amount, totalPlatformFee: deliveryTotal.platformFee, orderCount: deliveryTotal.count,
    });
    // 商城
    const mallFee = feeMap.get('mall_order') || { rate: 0, fixedFee: 0, enabled: false };
    bizBreakdown.push({
      bizType: 'mall_order', label: '商城订单', ...mallFee,
      totalAmount: this.toNumber(mallAgg._sum.payAmount), totalPlatformFee: this.toNumber(mallAgg._sum.platformFee), orderCount: mallAgg._count,
    });
    // 跑腿
    const errandFee = feeMap.get('errand_order') || { rate: 0, fixedFee: 0, enabled: false };
    bizBreakdown.push({
      bizType: 'errand_order', label: '跑腿订单', ...errandFee,
      totalAmount: this.toNumber(errandAgg._sum.payAmount), totalPlatformFee: this.toNumber(errandAgg._sum.platformFee), orderCount: errandAgg._count,
    });
    // 其他业务
    for (const row of otherPayments) {
      const fee = feeMap.get(row.bizType) || { rate: 0, fixedFee: 0, enabled: false };
      const totalAmount = this.toNumber(row._sum.amount);
      const platformFee = fee.enabled ? Math.round((totalAmount * fee.rate + fee.fixedFee * row._count) * 100) / 100 : 0;
      bizBreakdown.push({
        bizType: row.bizType, label: bizTypeLabels[row.bizType] || row.bizType, ...fee,
        totalAmount, totalPlatformFee: platformFee, orderCount: row._count,
      });
    }

    // ── 5. 总计 ──
    const grandTotal = bizBreakdown.reduce(
      (acc, b) => ({ platformFee: acc.platformFee + b.totalPlatformFee, amount: acc.amount + b.totalAmount, count: acc.count + b.orderCount }),
      { platformFee: 0, amount: 0, count: 0 },
    );

    // ── 6. 各区域当前配置 ──
    const allRegions = await this.prisma.region.findMany({ select: { id: true, name: true, commissionRate: true }, orderBy: { name: 'asc' } });
    const regionRates = allRegions.map(r => ({
      regionId: r.id, regionName: r.name, commissionRate: this.toNumber(r.commissionRate),
      totalPlatformFee: regionMap.get(r.id)?.totalPlatformFee || 0,
      totalAmount: regionMap.get(r.id)?.totalAmount || 0,
      orderCount: regionMap.get(r.id)?.orderCount || 0,
    }));

    // ── 7. 按日趋势（外卖+商城+跑腿合并） ──
    const dayTrendMap = new Map<string, { date: string; platformFee: number; amount: number }>();
    const addToTrend = (fee: number, amount: number, date: Date) => {
      const key = this.dayKey(date);
      const cur = dayTrendMap.get(key) || { date: key, platformFee: 0, amount: 0 };
      cur.platformFee += fee;
      cur.amount += amount;
      dayTrendMap.set(key, cur);
    };
    for (const r of dailySettlements) addToTrend(this.toNumber(r.platformFee), this.toNumber(r.amount), r.createdAt);
    for (const r of mallOrders) addToTrend(this.toNumber(r.platformFee), this.toNumber(r.payAmount), r.payTime!);
    for (const r of errandOrders) addToTrend(this.toNumber(r.platformFee), this.toNumber(r.payAmount), r.completeTime!);
    const dailyTrend = Array.from(dayTrendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── 8. 各业务费率配置（含默认值） ──
    const defaultConfigs: Record<string, any> = {
      order: { label: '外卖订单', rate: 0, fixedFee: 0, enabled: true, remark: '按区域独立配置，在区域配置页修改' },
      errand_order: { label: '跑腿订单', rate: 0.05, fixedFee: 0, enabled: true, remark: '' },
      mall_order: { label: '商城订单', rate: 0.03, fixedFee: 0, enabled: true, remark: '' },
      group_buy_order: { label: '拼团订单', rate: 0.03, fixedFee: 0, enabled: false, remark: '' },
      recharge: { label: '余额充值', rate: 0, fixedFee: 0, enabled: false, remark: '充值全额归平台，无需抽成配置' },
      topup: { label: '付费置顶', rate: 1.0, fixedFee: 0, enabled: true, remark: '全额归平台' },
      second_hand_order: { label: '二手订单', rate: 0.02, fixedFee: 0, enabled: false, remark: '' },
      dating_order: { label: '交友订单', rate: 0.1, fixedFee: 0, enabled: false, remark: '' },
      activity_order: { label: '活动报名', rate: 0.05, fixedFee: 0, enabled: false, remark: '' },
      membership: { label: '会员购买', rate: 1.0, fixedFee: 0, enabled: true, remark: '全额归平台' },
    };
    const feeConfigs2 = Object.entries(defaultConfigs).map(([bizType, def]) => {
      const row = feeMap.get(bizType);
      return row ? { bizType, ...def, ...row } : { bizType, ...def };
    });

    return {
      summary: {
        totalPlatformFee: grandTotal.platformFee,
        totalAmount: grandTotal.amount,
        orderCount: grandTotal.count,
        effectiveRate: grandTotal.amount > 0 ? Number(((grandTotal.platformFee / grandTotal.amount) * 100).toFixed(2)) : 0,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      bizBreakdown,
      regionRates,
      dailyTrend,
      feeConfigs: feeConfigs2,
    };
  }

  async updateRegionCommissionRate(regionId: string, commissionRate: number, operatorId?: string) {
    if (commissionRate < 0 || commissionRate > 1) {
      throw new BadRequestException('抽成比例必须在 0～1 之间（如 0.05 表示 5%）');
    }
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');
    await this.prisma.region.update({
      where: { id: regionId },
      data: { commissionRate: commissionRate as any },
    });
    return { success: true, regionId, commissionRate };
  }
}
