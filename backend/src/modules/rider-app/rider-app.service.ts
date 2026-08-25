import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ErrandService } from '../errand/errand.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { FinanceService } from '../finance/finance.service';

@Injectable()
export class RiderAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly errandService: ErrandService,
    private readonly systemConfigService: SystemConfigService,
    private readonly financeService: FinanceService,
  ) {}

  async sendPhoneCode(dto: { phone?: string; mobile?: string }, ip?: string) {
    return this.authService.sendPhoneLoginCode(dto, ip);
  }

  async loginPhone(
    dto: { phone?: string; mobile?: string; code?: string },
    ip?: string,
    ua?: string,
  ) {
    const login = await this.authService.phoneLogin(dto, ip, ua, {
      preferApprovedOfficialRider: true,
    });
    return {
      ...login,
      ...(await this.buildSession(login.id)),
    };
  }

  loginWechat() {
    throw new BadRequestException('骑手 App 微信登录尚未配置，请使用手机号验证码登录');
  }

  getSession(userId: string) {
    return this.buildSession(userId);
  }

  async getOrders(userId: string, query: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.getDeliveryOrdersList(userId, query);
  }

  async getOrderDetail(userId: string, orderId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getRiderDeliveryOrderDetail(orderId, userId);
  }

  async acceptOrder(userId: string, orderId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.acceptOrder(orderId, userId);
  }

  async updateOrderStatus(userId: string, orderId: string, dto: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.updateRiderStatus(orderId, userId, dto);
  }

  async confirmOrderByCode(userId: string, orderId: string, code: string) {
    await this.requireOfficialRider(userId);
    const receiptCode = String(code || '').trim();
    if (!receiptCode) throw new BadRequestException('请输入收货码');
    return this.errandService.confirmReceiptByCode(orderId, userId, receiptCode);
  }

  async updateLocation(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const [activeErrands, activeShopOrders] = await Promise.all([
      this.prisma.errandOrder.count({
        where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } },
      }),
      this.prisma.order.count({
        where: { riderId: userId, status: 'SHIPPED' as any },
      }),
    ]);
    if (activeErrands + activeShopOrders === 0) {
      throw new BadRequestException('没有配送中的订单，定位上传已关闭');
    }
    return this.errandService.updateLocation(userId, dto);
  }

  async updateLocationBatch(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const source = Array.isArray(dto?.points) ? dto.points : [];
    if (source.length === 0) throw new BadRequestException('定位轨迹不能为空');
    if (source.length > 50) throw new BadRequestException('单次最多上传 50 个定位点');

    const configResponse = await this.systemConfigService.getRiderAppControlConfig();
    if (configResponse?.data?.runtime?.backgroundLocationEnabled === false) {
      throw new BadRequestException('后台定位已关闭，请稍后再补传');
    }
    const maxAgeHours = Number(configResponse?.data?.runtime?.locationMaxAgeHours) || 24;
    const now = Date.now();
    const orderCutoff = new Date(now - maxAgeHours * 60 * 60 * 1000);
    const [assignedErrands, assignedShopOrders] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { riderId: userId, updatedAt: { gte: orderCutoff } },
        select: { id: true },
      }),
      this.prisma.order.findMany({
        where: { riderId: userId, updatedAt: { gte: orderCutoff } },
        select: { id: true },
      }),
    ]);
    if (assignedErrands.length + assignedShopOrders.length === 0) {
      throw new BadRequestException('没有可补传的配送订单');
    }
    const orderTypes = new Map<string, string>([
      ...assignedErrands.map((order) => [order.id, 'errand'] as const),
      ...assignedShopOrders.map((order) => [order.id, 'shop'] as const),
    ]);
    type TrackInput = {
      clientId: string;
      riderId: string;
      orderId: string | null;
      orderType: string | null;
      lat: number;
      lng: number;
      accuracy: number | null;
      speed: number | null;
      heading: number | null;
      recordedAt: Date;
    };
    const tracks: TrackInput[] = source.map((item: any): TrackInput => {
      const clientId = String(item?.client_id ?? item?.clientId ?? '').trim();
      if (!clientId || clientId.length > 128) throw new BadRequestException('定位点编号无效');
      const lat = Number(item?.lat ?? item?.latitude);
      const lng = Number(item?.lng ?? item?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new BadRequestException('定位坐标无效');
      }
      const recordedAt = new Date(String(item?.recorded_at ?? item?.recordedAt ?? ''));
      const recordedTime = recordedAt.getTime();
      if (!Number.isFinite(recordedTime)) throw new BadRequestException('定位采集时间无效');
      if (recordedTime > now + 5 * 60 * 1000) throw new BadRequestException('定位采集时间不能晚于服务器时间');
      if (recordedTime < now - maxAgeHours * 60 * 60 * 1000) {
        throw new BadRequestException(`定位点超过补传时效（${maxAgeHours} 小时）`);
      }
      const orderId = String(item?.order_id ?? item?.orderId ?? '').trim() || null;
      if (orderId && !orderTypes.has(orderId)) {
        throw new BadRequestException('定位点订单不属于当前骑手或已超过补传时效');
      }
      const optionalNumber = (value: unknown) => {
        if (value === undefined || value === null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      };
      return {
        clientId,
        riderId: userId,
        orderId,
        orderType: orderId ? orderTypes.get(orderId) || null : null,
        lat,
        lng,
        accuracy: optionalNumber(item?.accuracy),
        speed: optionalNumber(item?.speed),
        heading: optionalNumber(item?.heading),
        recordedAt,
      };
    });

    const result = await this.prisma.riderLocationTrack.createMany({
      data: tracks,
      skipDuplicates: true,
    });
    const newest = tracks.reduce((latest, point) => (
      point.recordedAt >= latest.recordedAt ? point : latest
    ));
    await this.errandService.updateLocationIfNewer(
      userId,
      { lat: newest.lat, lng: newest.lng },
      newest.recordedAt,
    );
    return {
      success: true,
      inserted: result.count,
      accepted_client_ids: tracks.map((point) => point.clientId),
    };
  }

  async getProfile(userId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getRiderInfo(userId);
  }

  async updateProfile(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.updateRiderInfo(userId, dto);
  }

  async getStats(userId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getOrderStats(userId);
  }

  async reportException(userId: string, orderId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const type = String(dto?.type || '').trim();
    const descriptions: Record<string, string> = {
      merchant_delay: '商家未出餐或取货等待',
      cannot_contact: '无法联系用户',
      address_issue: '地址错误或无法进入',
      vehicle_issue: '车辆或设备故障',
      other: '其他配送异常',
    };
    if (!descriptions[type]) throw new BadRequestException('不支持的异常类型');
    const description = String(dto?.description || '').trim();
    if (description.length < 5 || description.length > 300) {
      throw new BadRequestException('异常说明需填写 5-300 个字');
    }
    const proofImages = Array.isArray(dto?.proof_images ?? dto?.proofImages)
      ? (dto.proof_images ?? dto.proofImages).filter(Boolean).map(String).slice(0, 3)
      : [];
    const [errand, shopOrder] = await Promise.all([
      this.prisma.errandOrder.findUnique({
        where: { id: orderId }, select: { id: true, riderId: true, status: true },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId }, select: { id: true, riderId: true, status: true },
      }),
    ]);
    const order = errand || shopOrder;
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('订单未分配给当前骑手');
    const orderType = errand ? 'errand' : 'shop';
    const active = errand
      ? ['accepted', 'in_progress'].includes(String(order.status))
      : String(order.status) === 'SHIPPED';
    if (!active) throw new BadRequestException('当前订单状态不能上报配送异常');

    const existing = await this.prisma.deliveryRiskEvent.findFirst({
      where: { orderId, orderType, riderId: userId, eventType: type, handled: false },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { success: true, duplicate: true, data: existing };

    const risk = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deliveryRiskEvent.create({
        data: {
          orderId, orderType, riderId: userId, eventType: type,
          eventLevel: type === 'vehicle_issue' ? 'error' : 'warning',
          description, handled: false,
        },
      });
      await tx.deliveryOrderNode.create({
        data: {
          orderId, orderType, nodeType: 'exception', nodeLabel: descriptions[type],
          operatorId: userId, operatorType: 'rider', riderType: 'official',
          displayMode: 'live_map', proofImages: proofImages.length ? proofImages : undefined,
          remark: description,
        },
      });
      return created;
    });
    return { success: true, message: '异常已上报，平台将尽快处理', data: risk };
  }

  // ===========================================================================
  // 骑手收入 / 结算 / 提现
  // ===========================================================================

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  private dayStart(date: Date): Date {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  /**
   * 骑手已完成订单的收入（与 finance-admin 的 getCompletedRiderEarnings 口径一致）：
   * - 跑腿单: price + tip
   * - 外卖/商城配送单: max(originalFreight, paidFreight + subsidy, paidFreight)
   * excludeCovered 为 true 时剔除已被结算单覆盖的订单（用于"待结算"口径）。
   */
  private async computeRiderEarnings(
    userId: string,
    start: Date,
    end: Date,
    excludeCovered: boolean,
  ) {
    const [errandOrders, deliveryOrders, coveredItems] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: {
          riderId: userId,
          status: 'completed',
          refundStatus: { notIn: ['refunding', 'refunded'] },
          receiptConfirmedAt: { not: null },
          settlementEligibleAt: { gte: start, lte: end },
        },
        select: { id: true, orderNo: true, title: true, price: true, tip: true, completeTime: true },
      }),
      this.prisma.order.findMany({
        where: {
          riderId: userId,
          status: { in: ['DELIVERED', 'RECEIVED', 'COMPLETED'] },
          refundStatus: { notIn: ['refunding', 'refunded'] },
          OR: [
            { deliverTime: { gte: start, lte: end } },
            { deliverTime: null, completeTime: { gte: start, lte: end } },
          ],
          deliveryMode: { in: ['platform_rider', 'rider_delivery'] },
          businessType: { not: 'dorm_shop' },
        },
        select: {
          id: true,
          orderNo: true,
          freightAmount: true,
          originalFreightAmount: true,
          deliverTime: true,
          completeTime: true,
        },
      }),
      excludeCovered
        ? this.prisma.riderSettlementItem.findMany({
            where: { riderId: userId },
            select: { orderType: true, orderId: true },
          })
        : Promise.resolve([]),
    ]);

    const covered = new Set(
      coveredItems.map((item) => `${String(item.orderType)}:${String(item.orderId)}`),
    );

    const deliveryOrderIds = deliveryOrders.map((order) => order.id).filter(Boolean);
    const subsidyMap = new Map<string, number>();
    if (deliveryOrderIds.length) {
      const groups = await (this.prisma as any).subsidyLedger
        .groupBy({
          by: ['orderId'],
          where: {
            orderType: 'order',
            orderId: { in: deliveryOrderIds },
            receiverType: 'rider',
            status: { not: 'cancelled' },
          },
          _sum: { amount: true },
        })
        .catch(() => []);
      for (const item of groups) subsidyMap.set(item.orderId, this.toNumber(item._sum?.amount));
    }

    const earnings: Array<{
      orderId: string;
      orderType: string;
      orderNo: string;
      title: string;
      amount: number;
      completeTime: Date;
    }> = [];

    for (const order of errandOrders) {
      if (covered.has(`errand:${order.id}`)) continue;
      const amount = this.toNumber(order.price) + this.toNumber(order.tip);
      if (amount <= 0) continue;
      earnings.push({
        orderId: order.id,
        orderType: 'errand',
        orderNo: order.orderNo || order.id,
        title: order.title || '跑腿订单',
        amount,
        completeTime: order.completeTime || new Date(),
      });
    }

    for (const order of deliveryOrders) {
      if (covered.has(`delivery_order:${order.id}`)) continue;
      const paidFreight = this.toNumber(order.freightAmount);
      const subsidy = subsidyMap.get(order.id) || 0;
      const originalFreight = this.toNumber((order as any).originalFreightAmount);
      const amount = Math.max(originalFreight, paidFreight + subsidy, paidFreight);
      if (amount <= 0) continue;
      earnings.push({
        orderId: order.id,
        orderType: 'delivery_order',
        orderNo: order.orderNo || order.id,
        title: '配送订单',
        amount,
        completeTime: order.deliverTime || order.completeTime || new Date(),
      });
    }

    return earnings;
  }

  private toRiderSettlement(settlement: any) {
    return {
      id: settlement.id,
      settlementNo: settlement.settlementNo,
      regionId: settlement.regionId,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      orderCount: settlement.orderCount,
      deliveryFeeTotal: this.toNumber(settlement.deliveryFeeTotal),
      rewardAmount: this.toNumber(settlement.rewardAmount),
      penaltyAmount: this.toNumber(settlement.penaltyAmount),
      payableAmount: this.toNumber(settlement.payableAmount),
      paidAmount: this.toNumber(settlement.paidAmount),
      status: settlement.status,
      remark: settlement.remark,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
    };
  }

  async getRiderIncomeOverview(userId: string) {
    await this.requireOfficialRider(userId);
    const now = new Date();
    const todayStart = this.dayStart(now);
    const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [wallet, todayEarnings, monthEarnings, unsettledEarnings, pendingSettlements, pendingWithdrawals] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.computeRiderEarnings(userId, todayStart, tomorrow, false),
      this.computeRiderEarnings(userId, monthStart, tomorrow, false),
      this.computeRiderEarnings(userId, new Date(0), tomorrow, true),
      this.prisma.riderSettlement.aggregate({
        where: { riderId: userId, status: { in: ['PENDING', 'CONFIRMED'] } },
        _sum: { payableAmount: true },
      }),
      this.prisma.withdraw.aggregate({
        where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
      }),
    ]);

    const sum = (items: Array<{ amount: number }>) => items.reduce((total, item) => total + item.amount, 0);
    return {
      balance: this.round2(this.toNumber(wallet?.balance)),
      freeze: this.round2(this.toNumber(wallet?.freeze)),
      today_income: this.round2(sum(todayEarnings)),
      month_income: this.round2(sum(monthEarnings)),
      pending_settlement: this.round2(
        sum(unsettledEarnings)
        + this.toNumber((pendingSettlements as any)._sum?.payableAmount),
      ),
      withdrawing: this.round2(this.toNumber((pendingWithdrawals as any)._sum?.amount)),
    };
  }

  async getRiderIncomeTransactions(userId: string, query: any = {}) {
    await this.requireOfficialRider(userId);
    return this.financeService.transactions(userId, query);
  }

  async getRiderSettlements(userId: string, query: any = {}) {
    await this.requireOfficialRider(userId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const where = { riderId: userId };
    const [items, total] = await Promise.all([
      this.prisma.riderSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.riderSettlement.count({ where }),
    ]);
    const appeals = items.length
      ? await this.prisma.orderAppeal.findMany({
          where: { orderType: 'rider_settlement', orderId: { in: items.map((item) => item.id) } },
          select: { orderId: true, status: true },
        })
      : [];
    const appealMap = new Map(appeals.map((item) => [item.orderId, item.status]));
    return {
      list: items.map((item) => ({
        ...this.toRiderSettlement(item),
        appealStatus: appealMap.get(item.id) || '',
      })),
      total,
      page,
      pageSize,
    };
  }

  async getRiderSettlementDetail(userId: string, id: string) {
    await this.requireOfficialRider(userId);
    const settlement = await this.prisma.riderSettlement.findFirst({ where: { id, riderId: userId } });
    if (!settlement) throw new NotFoundException('结算记录不存在');

    const [items, appeal] = await Promise.all([
      this.prisma.riderSettlementItem.findMany({
        where: { settlementId: id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.orderAppeal.findFirst({
        where: { orderType: 'rider_settlement', orderId: id },
      }),
    ]);

    const errandIds = items.filter((item) => item.orderType === 'errand').map((item) => item.orderId);
    const deliveryIds = items.filter((item) => item.orderType === 'delivery_order').map((item) => item.orderId);
    const [errandRows, deliveryRows] = await Promise.all([
      errandIds.length
        ? this.prisma.errandOrder.findMany({ where: { id: { in: errandIds } }, select: { id: true, orderNo: true } })
        : (Promise.resolve([]) as Promise<{ id: string; orderNo: string }[]>),
      deliveryIds.length
        ? this.prisma.order.findMany({ where: { id: { in: deliveryIds } }, select: { id: true, orderNo: true } })
        : (Promise.resolve([]) as Promise<{ id: string; orderNo: string }[]>),
    ]);
    const orderNoMap = new Map<string, string>();
    errandRows.forEach((row) => orderNoMap.set(row.id, row.orderNo));
    deliveryRows.forEach((row) => orderNoMap.set(row.id, row.orderNo));

    const orders = items.map((item) => {
      const originalAmount = this.toNumber(item.deliveryFeeAmount) + this.toNumber(item.tipAmount);
      const reversalAmount = this.toNumber(item.reversalAmount);
      const netAmount = this.toNumber(item.payableAmount) - reversalAmount;
      return {
        id: item.id,
        orderNo: orderNoMap.get(item.orderId) || item.orderId,
        source: item.orderType === 'delivery_order' ? '配送订单' : '跑腿订单',
        orderType: item.orderType,
        amount: this.toNumber(item.payableAmount),
        originalAmount,
        netAmount,
        reversalAmount,
        reversalStatus: reversalAmount > 0 ? '已冲正' : '',
        reverseReason: item.reverseReason || '',
        status: item.status,
      };
    });

    return {
      ...this.toRiderSettlement(settlement),
      itemOriginalAmount: this.round2(orders.reduce((sum, item) => sum + item.originalAmount, 0)),
      itemReversalAmount: this.round2(orders.reduce((sum, item) => sum + item.reversalAmount, 0)),
      itemNetAmount: this.round2(orders.reduce((sum, item) => sum + item.netAmount, 0)),
      orders,
      appealStatus: appeal?.status || '',
      appealReason: appeal?.description || '',
      appealReply: appeal?.latestReply || '',
    };
  }

  async createRiderSettlementAppeal(userId: string, id: string, dto: any) {
    await this.requireOfficialRider(userId);
    const reason = String(dto?.reason || '').trim();
    if (reason.length < 5 || reason.length > 500) {
      throw new BadRequestException('申诉说明需填写 5-500 个字');
    }
    const images = Array.isArray(dto?.images)
      ? dto.images.filter(Boolean).map(String).slice(0, 3)
      : [];

    const settlement = await this.prisma.riderSettlement.findFirst({ where: { id, riderId: userId } });
    if (!settlement) throw new NotFoundException('结算记录不存在');

    const existing = await this.prisma.orderAppeal.findUnique({
      where: { orderType_orderId: { orderType: 'rider_settlement', orderId: id } },
    });
    if (existing) {
      if (['pending', 'processing'].includes(String(existing.status))) {
        throw new BadRequestException('该结算已提交申诉，请等待平台处理');
      }
      return this.prisma.orderAppeal.update({
        where: { id: existing.id },
        data: {
          description: reason,
          evidenceImages: images.length ? images : undefined,
          status: 'pending',
          latestReply: null,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.orderAppeal.create({
        data: {
          appealNo: `SA${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          orderType: 'rider_settlement',
          orderId: id,
          orderNo: settlement.settlementNo || id,
          userId,
          regionId: settlement.regionId || undefined,
          appealType: 'settlement',
          description: reason,
          evidenceImages: images.length ? images : undefined,
          status: 'pending',
        },
      });
      await tx.orderAppealEvent.create({
        data: {
          appealId: appeal.id,
          action: 'submit',
          actorType: 'rider',
          actorId: userId,
          status: 'pending',
          content: reason,
        },
      });
      return appeal;
    });
  }

  async getRiderWithdrawals(userId: string, query: any = {}) {
    await this.requireOfficialRider(userId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.withdraw.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.withdraw.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id,
        amount: this.toNumber(item.amount),
        channel: item.channel,
        account: item.account,
        realName: item.realName,
        real_name: item.realName,
        status: item.status,
        failReason: item.failReason,
        createdAt: item.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async createRiderWithdrawal(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    return this.financeService.withdraw(userId, dto);
  }

  async registerPushToken(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const clientId = String(dto?.clientId || dto?.client_id || '').trim();
    if (!clientId || clientId.length > 200) throw new BadRequestException('推送标识无效');
    const platform = String(dto?.platform || '').trim().slice(0, 20) || undefined;
    const os = String(dto?.os || '').trim().slice(0, 50) || undefined;
    const appVersion = String(dto?.appVersion || dto?.app_version || '').trim().slice(0, 50) || undefined;
    await this.prisma.userPushDevice.upsert({
      where: { clientId },
      update: { userId, platform, os, appVersion, lastSeenAt: new Date() },
      create: { clientId, userId, platform, os, appVersion },
    });
    return { success: true, clientId };
  }

  private async requireOfficialRider(userId: string) {
    const session = await this.buildSession(userId);
    if (!session.allowed) {
      throw new BadRequestException(session.message || '当前账号不能使用官方骑手 App');
    }
    return session;
  }

  private async buildSession(userId: string) {
    const [user, rider] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, avatar: true, phone: true },
      }),
      this.prisma.regionRider.findUnique({ where: { userId } }),
    ]);
    if (!user) {
      return { allowed: false, message: '账号不存在，请重新登录', user: null, rider: null };
    }

    const region = rider?.regionId
      ? await this.prisma.region.findUnique({
          where: { id: rider.regionId },
          select: { name: true },
        })
      : null;
    let message = '';
    if (!rider) {
      message = '尚未申请成为骑手，请先在小程序提交骑手申请';
    } else if (rider.verifyStatus !== 'approved') {
      message = rider.verifyStatus === 'rejected'
        ? '骑手申请未通过审核，请联系管理员'
        : '骑手申请审核中，请等待管理员审核';
    } else if (rider.riderType !== 'official') {
      message = '当前是兼职骑手账号，请联系管理员开通官方骑手后再使用 App';
    } else if (!rider.regionId) {
      message = '账号未绑定区域，请联系管理员分配所属区域';
    }

    const allowed = Boolean(rider && !message);
    return {
      allowed,
      message,
      user,
      rider: rider
        ? {
            id: rider.id,
            user_id: rider.userId,
            region_id: rider.regionId,
            region_name: region?.name || '',
            real_name: rider.realName,
            phone: rider.phone,
            rider_bio: rider.riderBio || '',
            status: rider.status,
            verify_status: rider.verifyStatus,
            rider_type: rider.riderType,
            is_official: rider.riderType === 'official',
            rating: rider.rating,
            balance: Number(rider.balance || 0),
            total_orders: rider.totalOrders,
            today_orders: rider.todayOrders,
          }
        : null,
    };
  }
}
