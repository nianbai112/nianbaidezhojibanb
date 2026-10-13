import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { ACTIVE_PAYOUT_STATES, MIN_TRANSFER_FEN, PayoutKind, payoutId, payoutKindText, payoutSettings, riderFinancialBlock } from './rider-payout.policy';
import { WechatTransferError, WechatTransferGateway } from './wechat-transfer.gateway';
import { isMiniappOpenid } from '../../common/wechat-identity';
import { NotifyService } from '../notify/notify.service';

const BASE = '/v3/fund-app/mch-transfer/transfer-bills';

@Injectable()
export class RiderPayoutService {
  private readonly logger = new Logger(RiderPayoutService.name);
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService,
    private readonly gateway: WechatTransferGateway, @Optional() private readonly notify?: NotifyService) {}

  /**
   * Called inside the SAME transaction that credits this money to the rider's wallet.
   * Returns where the money went; QUEUED rows are announced when the transfer settles,
   * every other outcome is announced by the caller after commit (see announce()).
   */
  async reserve(tx: any, order: any, amount: number, kind: PayoutKind = 'delivery_fee'):
    Promise<{ status: 'QUEUED' | 'WALLET' | 'SKIPPED'; reason: string } | undefined> {
    const settings = payoutSettings((await tx.config.findUnique({ where: { key: 'wechat_pay' } }))?.value);
    if (!order.riderId || amount <= 0) return;
    if (!settings.enabled) return { status: 'SKIPPED', reason: '平台暂未开启微信自动到账' };
    const auth = await tx.riderWechatAuthorization.findUnique({ where: { userId: order.riderId } });
    if (!auth?.enabled || auth.state !== 'TAKING_EFFECT' || !auth.authorizationId || auth.sceneId !== settings.sceneId) {
      return { status: 'SKIPPED', reason: '你还没有开通微信自动收款' };
    }
    const amountFen = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountFen) || amountFen <= 0) throw new Error('骑手结算金额无效');
    // MySQL compares numeric parameters as doubles (8.80 can become 8.800000000000001).
    // Keep every wallet/withdrawal amount as an exact decimal string derived from provider cents.
    const walletAmount = (amountFen / 100).toFixed(2);
    const user = await tx.user.findUnique({ where: { id: order.riderId } });
    const reason = user?.status !== 'ACTIVE' || !isMiniappOpenid(auth.openid) || user?.openid !== auth.openid
      ? '收款身份已变化，请重新核对微信绑定'
      : amountFen < MIN_TRANSFER_FEN ? '本单不足微信单笔最低转账金额 0.10 元，收入保留在钱包'
      : amountFen > Math.min(settings.maxFen, settings.dailyUserFen, settings.dailyTotalFen) ? '本单超出自动转账额度，请从钱包申请提现'
      : await riderFinancialBlock(tx, order.riderId);
    const id = payoutId();
    await tx.riderWechatPayout.create({ data: {
      id, orderId: order.id, kind, orderNo: order.orderNo || order.id, userId: order.riderId,
      withdrawId: reason ? null : id, amountFen, status: reason ? 'WALLET' : 'QUEUED', reason: reason || null,
      appid: auth.appid, mchid: auth.mchid, openid: auth.openid, sceneId: auth.sceneId,
      authorizationId: auth.authorizationId, outAuthorizationNo: auth.outAuthorizationNo,
    } });
    if (reason) return { status: 'WALLET', reason };
    const debit = await tx.wallet.updateMany({ where: { userId: order.riderId, balance: { gte: walletAmount } },
      data: { balance: { decrement: walletAmount }, freeze: { increment: walletAmount } } });
    if (debit.count !== 1) throw new Error('自动转账冻结余额失败');
    const wallet = await tx.wallet.findUnique({ where: { userId: order.riderId } });
    await tx.withdraw.create({ data: { id, userId: order.riderId, amount: walletAmount, channel: 'WX_PAY',
      account: `微信授权:${auth.outAuthorizationNo}`, status: 'PROCESSING' } });
    await tx.walletTransaction.create({ data: {
      userId: order.riderId, type: 'WITHDRAW', amount: walletAmount, balance: wallet.balance, channel: 'WX_PAY',
      orderNo: id, description: `${payoutKindText(kind)}自动转账 ${order.orderNo || order.id}`, status: 'PENDING',
    } });
    return { status: 'QUEUED', reason: '' };
  }

  /** Tells the rider where this order's money went. Event keys make repeats harmless. */
  async announce(input: { userId: string; orderId: string; orderNo: string; kind: PayoutKind; amountFen: number;
    outcome: 'SUCCESS' | 'WALLET'; reason?: string; eventKey: string }) {
    if (!this.notify) return;
    const label = payoutKindText(input.kind);
    const amount = (input.amountFen / 100).toFixed(2);
    const success = input.outcome === 'SUCCESS';
    await this.notify.createAndDispatch({
      userId: input.userId,
      type: 'delivery',
      scene: success ? 'rider_payout_wechat' : 'rider_payout_wallet',
      title: success ? `${label} ¥${amount} 已到账微信零钱` : `${label} ¥${amount} 已存入钱包余额`,
      content: success
        ? `订单 ${input.orderNo} 的${label} ¥${amount} 已转入你的微信零钱，请在微信「我-服务-钱包-零钱明细」查看。`
        : `订单 ${input.orderNo} 的${label} ¥${amount} 已存入平台钱包余额${input.reason ? `（${input.reason}）` : ''}，可在钱包申请提现。`,
      data: { orderId: input.orderId, orderNo: input.orderNo, kind: input.kind, amount: Number(amount), outcome: input.outcome },
      linkType: 'page',
      linkValue: '/pagesA/wallet/wallet',
    } as any, input.eventKey).catch((error: any) => this.logger.warn(`骑手到账通知失败: ${error.message}`));
  }

  /** Announces this order's payouts that were kept in the wallet when they were reserved. */
  async announceKept(orderId: string) {
    const rows = await this.prisma.riderWechatPayout.findMany({ where: { orderId, status: 'WALLET' } });
    for (const row of rows) await this.announce({ userId: row.userId, orderId: row.orderId, orderNo: row.orderNo,
      kind: row.kind as PayoutKind, amountFen: row.amountFen, outcome: 'WALLET', reason: row.reason || '', eventKey: `rider_payout:${row.id}` });
  }

  kick() {
    void this.flush().catch(() => this.logger.warn('骑手自动转账暂未完成，后台将继续查单'));
  }

  async reconcile(id: string) {
    const locked = await this.redis.withRenewingLock('rider-payout:dispatch', 60, async () => {
      const row = await this.prisma.riderWechatPayout.findUnique({ where: { id } });
      if (!row || !row.firstSentAt || !ACTIVE_PAYOUT_STATES.includes(row.status)) return true;
      const cfg = await this.gateway.runtime();
      if (row.mchid !== cfg.mchid || row.appid !== cfg.appid) throw new Error('商户配置与原单不一致');
      const result = await this.gateway.request('GET', `${BASE}/out-bill-no/${id}`, undefined, cfg);
      await this.consume(row, result);
      return true;
    });
    if (!locked) throw new Error('系统正在自动核对，请稍后刷新');
  }

  @Interval(5000)
  async scheduledFlush() {
    await this.flush().catch(() => this.logger.warn('骑手自动转账任务执行失败，等待重试'));
  }

  async flush() {
    // Serializes starts across HTTP and worker processes, including daily limits.
    return this.redis.withRenewingLock('rider-payout:dispatch', 60, async () => {
      const config = payoutSettings((await this.prisma.config.findUnique({ where: { key: 'wechat_pay' } }))?.value);
      // Reconciliation must continue after disabling the feature. A missing new
      // table during a disabled staged deployment is the only ignored DB error.
      let rows: any[];
      try {
        rows = await this.prisma.riderWechatPayout.findMany({
          where: { status: { in: ACTIVE_PAYOUT_STATES }, nextAttemptAt: { lte: new Date() } },
          orderBy: { createdAt: 'asc' }, take: 10,
        });
      } catch (e: any) { if (!config.enabled && e.code === 'P2021') return; throw e; }
      for (const row of rows) {
        try { await this.process(row.id); }
        catch (error: any) {
          // Do not log axios requests (they contain signed credentials).
          const reason = error instanceof WechatTransferError ? error.message : '转账结果尚未核实，系统将继续查单';
          const current = await this.prisma.riderWechatPayout.findUnique({ where: { id: row.id } });
          if (!current || !ACTIVE_PAYOUT_STATES.includes(current.status)) continue;
          const review = !!current.firstSentAt && Date.now() - current.firstSentAt.getTime() > 86400000;
          await this.prisma.riderWechatPayout.updateMany({ where: { id: row.id, status: { in: ACTIVE_PAYOUT_STATES } },
            data: { status: current.firstSentAt ? (review ? 'REVIEW' : 'UNKNOWN') : 'QUEUED', reason,
              nextAttemptAt: new Date(Date.now() + (review ? 3600000 : 60000)) } });
          this.logger.warn(`骑手自动转账待核对: ${row.id}`);
        }
      }
    });
  }

  private async preflight(tx: any, row: any, cfg: any, settings: any) {
    if (!settings.enabled) return '平台已暂停自动转账';
    if (row.appid !== cfg.appid || row.mchid !== cfg.mchid || row.sceneId !== settings.sceneId) return '商户配置已变化';
    if (row.amountFen < MIN_TRANSFER_FEN) return '本单不足微信单笔最低转账金额 0.10 元，收入保留在钱包';
    if (row.amountFen > settings.maxFen) return '本单超出当前单笔转账限额';
    const principal = row.kind === 'purchase_principal';
    const [auth, user, order, item] = await Promise.all([
      tx.riderWechatAuthorization.findUnique({ where: { userId: row.userId } }),
      tx.user.findUnique({ where: { id: row.userId } }),
      tx.errandOrder.findUnique({ where: { id: row.orderId } }),
      // Delivery income must sit in a paid settlement; returned goods money must match the audited reimbursement.
      principal
        ? tx.errandPurchase.findUnique({ where: { id: row.orderId } })
        : tx.riderSettlementItem.findFirst({ where: { orderType: 'errand', orderId: row.orderId,
          riderId: row.userId, status: 'included', settlement: { status: 'PAID' } } }),
    ]);
    if (!isMiniappOpenid(row.openid) || !auth?.enabled || auth.state !== 'TAKING_EFFECT' || auth.authorizationId !== row.authorizationId ||
      auth.outAuthorizationNo !== row.outAuthorizationNo || user?.openid !== row.openid || user?.status !== 'ACTIVE') return '微信授权已暂停或收款身份已变化';
    if (!order || order.riderId !== row.userId || order.userId === row.userId || order.status !== 'completed' ||
      !order.receiptConfirmedAt || !order.settlementEligibleAt || order.settlementEligibleAt > new Date() ||
      (order.refundStatus && order.refundStatus !== 'none') || !item ||
      (principal ? item.reimbursementStatus !== 'paid' || item.reimbursedCents !== row.amountFen : Number(item.reversalAmount || 0) > 0)) return '订单结算状态已变化，请在钱包核对';
    return riderFinancialBlock(tx, row.userId);
  }

  private async postponeForDailyLimit(row: any, settings: any, now: Date, db: any = this.prisma) {
    const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00+08:00`);
    // Same-number retries share today's reservation. A retry after midnight
    // must reserve capacity again, even though the immutable bill number stays.
    if (row.lastSentAt && row.lastSentAt >= start) return false;
    const [merchantDay, riderDay] = await Promise.all([
      db.riderWechatPayout.aggregate({ where: { mchid: row.mchid, lastSentAt: { gte: start } }, _sum: { amountFen: true } }),
      db.riderWechatPayout.aggregate({ where: { mchid: row.mchid, userId: row.userId, lastSentAt: { gte: start } }, _sum: { amountFen: true } }),
    ]);
    if ((merchantDay._sum.amountFen || 0) + row.amountFen <= settings.dailyTotalFen &&
      (riderDay._sum.amountFen || 0) + row.amountFen <= settings.dailyUserFen) return false;
    await db.riderWechatPayout.updateMany({ where: { id: row.id, status: { in: ACTIVE_PAYOUT_STATES } }, data: {
      reason: '今日自动转账额度已达上限，次日继续处理', nextAttemptAt: new Date(start.getTime() + 86400000),
    } });
    return true;
  }

  async process(id: string) {
    let row = await this.prisma.riderWechatPayout.findUnique({ where: { id } });
    if (!row || !ACTIVE_PAYOUT_STATES.includes(row.status)) return;
    const settings = payoutSettings((await this.prisma.config.findUnique({ where: { key: 'wechat_pay' } }))?.value);
    if (!row.firstSentAt && !settings.enabled) {
      await this.finish(row, 'CANCELLED', '平台已暂停自动转账'); return;
    }
    const cfg = await this.gateway.runtime();
    if (row.mchid !== cfg.mchid || row.appid !== cfg.appid) {
      if (!row.firstSentAt) {
        await this.finish(row, 'CANCELLED', '商户配置已变化，金额已退回钱包'); return;
      }
      throw new Error('不可使用新商户查询旧转账');
    }
    if (row.firstSentAt) {
      try {
        const result = await this.gateway.request('GET', `${BASE}/out-bill-no/${id}`, undefined, cfg);
        await this.consume(row, result);
        return;
      } catch (error) {
        // Only a verified NOT_FOUND permits resending the original immutable
        // request. Never change the business number after a timeout.
        if (!(error instanceof WechatTransferError && error.code === 'NOT_FOUND')) throw error;
        if (Date.now() - row.firstSentAt.getTime() >= 86400000) throw new Error('超过自动重试期，保留冻结等待核对');
      }
    }
    if (!row.firstSentAt) {
      const reason = await this.prisma.$transaction(tx => this.preflight(tx, row, cfg, settings));
      if (reason) { await this.finish(row, 'CANCELLED', reason); return; }
      const now = new Date();
      if (await this.postponeForDailyLimit(row, settings, now)) return;
      // Refresh authorization on the server immediately before first payment.
      const auth = await this.gateway.request('GET',
        `/v3/fund-app/mch-transfer/user-confirm-authorization/out-authorization-no/${row.outAuthorizationNo}`, undefined, cfg);
      if (auth.state !== 'TAKING_EFFECT' || auth.authorization_id !== row.authorizationId ||
        auth.out_authorization_no !== row.outAuthorizationNo ||
        (auth.mch_id && auth.mch_id !== row.mchid) || (auth.appid && auth.appid !== row.appid) ||
        (auth.openid && auth.openid !== row.openid) || (auth.transfer_scene_id && auth.transfer_scene_id !== row.sceneId)) {
        await this.finish(row, 'CANCELLED', '微信收款授权已失效'); return;
      }
      const requestBody = { appid: row.appid, out_bill_no: row.id, transfer_scene_id: row.sceneId,
        authorization_id: row.authorizationId, transfer_amount: row.amountFen,
        transfer_remark: row.kind === 'purchase_principal' ? '代买垫付货款返还' : '跑腿订单配送报酬', transfer_scene_report_infos: [
          { info_type: '岗位类型', info_content: '校园跑腿骑手' },
          { info_type: '报酬说明', info_content: `${row.kind === 'purchase_principal' ? '垫付货款' : '配送报酬'} ${row.orderNo}`.slice(0, 32) },
        ] };
      // Repeat business checks in the claim transaction after the network lookup.
      const claimed = await this.prisma.$transaction(async tx => {
        const block = await this.preflight(tx, row, cfg, settings);
        if (block) return { count: 0, reason: block };
        const sendAt = new Date();
        // A Redis lease can expire during a process pause. Recheck and reserve
        // quota with the send claim in a serializable DB transaction as well.
        if (await this.postponeForDailyLimit(row, settings, sendAt, tx)) return { count: 0 };
        return tx.riderWechatPayout.updateMany({ where: { id, status: 'QUEUED', firstSentAt: null },
          data: { status: 'SENDING', firstSentAt: sendAt, lastSentAt: sendAt, requestBody, attempts: { increment: 1 }, reason: null } });
      }, { isolationLevel: 'Serializable' });
      if (claimed.count !== 1) {
        if ('reason' in claimed) await this.finish(row, 'CANCELLED', String(claimed.reason));
        return;
      }
      row = await this.prisma.riderWechatPayout.findUniqueOrThrow({ where: { id } });
    } else {
      // A previously attempted instruction remains bound to its original account.
      if (!settings.enabled) throw new Error('平台暂停，继续查单而不重新发起');
      const retry = await this.prisma.$transaction(async tx => {
        const current = await tx.riderWechatPayout.findUnique({ where: { id } });
        if (!current || !ACTIVE_PAYOUT_STATES.includes(current.status)) return { count: 0 };
        const reason = await this.preflight(tx, current, cfg, settings);
        if (reason) throw new Error('原单结果未确定且业务状态已变化，继续查单');
        const now = new Date();
        if (await this.postponeForDailyLimit(current, settings, now, tx)) return { count: 0 };
        return tx.riderWechatPayout.updateMany({ where: { id, status: { in: ACTIVE_PAYOUT_STATES } },
          data: { lastSentAt: now, attempts: { increment: 1 } } });
      }, { isolationLevel: 'Serializable' });
      if (retry.count !== 1) return;
    }
    if (!row.requestBody) throw new Error('缺少原始转账请求');
    await this.gateway.request('POST', `${BASE}/transfer`, row.requestBody, cfg);
    const result = await this.gateway.request('GET', `${BASE}/out-bill-no/${id}`, undefined, cfg);
    await this.consume(row, result);
  }

  async consume(row: any, result: any) {
    if (result.out_bill_no !== row.id || result.mch_id !== row.mchid || result.appid !== row.appid ||
      result.transfer_amount !== row.amountFen || (result.openid && result.openid !== row.openid) || !result.transfer_bill_no) {
      throw new Error('微信转账单与本地付款指令不匹配');
    }
    if (result.state === 'SUCCESS') return this.finish(row, 'SUCCESS', '', result.transfer_bill_no);
    if (['FAIL', 'CANCELLED'].includes(result.state)) return this.finish(row, 'FAILED', '微信确认转账未成功，金额已退回钱包', result.transfer_bill_no);
    await this.prisma.riderWechatPayout.updateMany({ where: { id: row.id, status: { in: ACTIVE_PAYOUT_STATES } },
      data: { status: 'UNKNOWN', reason: '微信正在处理，正在核实到账结果', nextAttemptAt: new Date(Date.now() + 30000) } });
  }

  async finish(row: any, status: 'SUCCESS' | 'FAILED' | 'CANCELLED', reason: string, transferNo?: string) {
    const label = payoutKindText(row.kind);
    const finished = await this.prisma.$transaction(async tx => {
      const changed = await tx.riderWechatPayout.updateMany({
        where: { id: row.id, status: { in: ACTIVE_PAYOUT_STATES }, ...(status === 'CANCELLED' ? { firstSentAt: null } : {}) },
        data: { status, reason: reason || null, transferNo: transferNo || null },
      });
      if (changed.count !== 1) return false;
      const amount = (row.amountFen / 100).toFixed(2);
      const success = status === 'SUCCESS';
      const withdraw = await tx.withdraw.updateMany({ where: { id: row.withdrawId!, userId: row.userId, amount, channel: 'WX_PAY', status: 'PROCESSING' },
        data: { status: success ? 'SUCCESS' : 'FAILED', transferNo: transferNo || null, failReason: reason || null, processedAt: new Date() } });
      if (withdraw.count !== 1) throw new Error('自动出款账目状态冲突，需核对');
      const walletChanged = await tx.wallet.updateMany({ where: { userId: row.userId, freeze: { gte: amount } },
        data: { freeze: { decrement: amount }, ...(success ? { totalOut: { increment: amount } } : { balance: { increment: amount } }) } });
      if (walletChanged.count !== 1) throw new Error('冻结余额不一致，需核对');
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: row.userId } });
      const ledger = await tx.walletTransaction.updateMany({ where: { userId: row.userId, orderNo: row.id, type: 'WITHDRAW', status: 'PENDING', amount },
        data: { status: success ? 'SUCCESS' : 'FAILED', balance: wallet.balance,
          description: success ? `${label}已到账微信零钱 ${row.orderNo}` : `${label}自动转账未成功 ${row.orderNo}` } });
      if (ledger.count !== 1) throw new Error('自动出款流水不一致，需核对');
      if (!success) await tx.walletTransaction.create({ data: { userId: row.userId, type: 'WITHDRAW', amount,
        balance: wallet.balance, channel: 'WX_PAY', orderNo: `WD_RETURN_${row.id}`,
        description: `${label}自动转账退回余额：${reason}`, status: 'SUCCESS' } });
      return true;
    });
    if (finished) await this.announce({ userId: row.userId, orderId: row.orderId, orderNo: row.orderNo, kind: row.kind,
      amountFen: row.amountFen, outcome: status === 'SUCCESS' ? 'SUCCESS' : 'WALLET', reason, eventKey: `rider_payout:${row.id}` });
  }
}
