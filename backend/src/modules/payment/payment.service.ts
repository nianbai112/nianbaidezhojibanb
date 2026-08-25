import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { MembershipService } from '../membership/membership.service';
import { PrintService } from '../print/print.service';
import * as crypto from 'crypto';
import axios from 'axios';
import * as fs from 'fs';

type WxPayRuntimeConfig = {
  appid: string;
  mchid: string;
  apiV3Key: string;
  certSerialNo: string;
  notifyUrl: string;
  refundNotifyUrl: string;
  merchantPrivateKey: string;
  platformCert: string;
  platformPublicKey: string;
  platformPublicKeyId: string;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly wxPayBaseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifyService: NotifyService,
    private readonly membershipService: MembershipService,
    private readonly printService: PrintService = {
      enqueueAutomaticOrder: async () => ({ queued: 0 }),
    } as unknown as PrintService,
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

  private text(value: any): string {
    if (typeof value !== 'string') return '';
    const next = value.trim();
    return next && next !== '******' ? next : '';
  }

  private parseErrandPayableDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    const normalized = text.includes('T') ? text : text.replace(/-/g, '/');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseErrandRemark(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'string') return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private assertErrandOrderPayableNow(order: any, now = new Date()) {
    if (!order) throw new BadRequestException('跑腿订单不存在');
    if (order.status !== 'pending_pay') throw new BadRequestException('订单状态不允许支付');
    const remark = this.parseErrandRemark(order.remark);
    const current = this.parseErrandPayableDate(now) || new Date();
    const deliveryTime = this.parseErrandPayableDate(remark.delivery_time || order.deliverTime);
    if (deliveryTime && deliveryTime.getTime() <= current.getTime()) {
      throw new BadRequestException('跑腿订单时间已过期，请重新下单');
    }
    const createdAt = this.parseErrandPayableDate(order.createdAt);
    if (createdAt && createdAt.getTime() + 15 * 60 * 1000 <= current.getTime()) {
      throw new BadRequestException('跑腿订单时间已过期，请重新下单');
    }
  }

  private normalizePem(value: any): string {
    const text = this.text(value).replace(/\\n/g, '\n').trim();
    return text ? `${text}\n` : '';
  }

  private readPemFile(path?: string): string {
    const filePath = this.text(path);
    if (!filePath) return '';
    try {
      return fs.readFileSync(filePath, 'utf8').trim() + '\n';
    } catch (error: any) {
      this.logger.warn(`微信支付证书文件读取失败: ${filePath} ${error?.message || ''}`);
      return '';
    }
  }

  private async readConfigObject(key: string): Promise<Record<string, any>> {
    const item = await this.prisma.config.findUnique({ where: { key } }).catch(() => null);
    const value = item?.value as any;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private async getWxPayConfig(): Promise<WxPayRuntimeConfig> {
    const [pay, miniapp] = await Promise.all([this.readConfigObject('wechat_pay'), this.readConfigObject('miniapp')]);

    const merchantPrivateKey = this.normalizePem(pay.merchantPrivateKey || pay.privateKey || pay.keyCert) || this.readPemFile(this.config.get('WX_PAY_PRIVATE_KEY_PATH'));

    const platformCert = this.normalizePem(pay.platformCert || pay.wechatPayCert || pay.cert) || this.readPemFile(this.config.get('WX_PAY_PLATFORM_CERT_PATH'));

    return {
      appid: this.text(miniapp.appId) || this.text(this.config.get('WX_MINI_APPID')),
      mchid: this.text(pay.mchId || pay.mchid) || this.text(this.config.get('WX_PAY_MCHID')),
      apiV3Key: this.text(pay.apiV3Key) || this.text(this.config.get('WX_PAY_APIV3_KEY')),
      certSerialNo: this.text(pay.certSerialNo) || this.text(this.config.get('WX_PAY_CERT_SERIAL_NO')),
      notifyUrl: this.text(pay.notifyUrl) || this.text(this.config.get('WX_PAY_NOTIFY_URL')),
      refundNotifyUrl: this.text(pay.refundNotifyUrl) || this.text(this.config.get('WX_PAY_REFUND_NOTIFY_URL')),
      merchantPrivateKey,
      platformCert,
      platformPublicKey: this.normalizePem(pay.platformPublicKey || pay.wechatPayPublicKey || pay.publicKey),
      platformPublicKeyId: this.text(pay.platformPublicKeyId || pay.publicKeyId),
    };
  }

  // ============ 微信支付 V3 下单 ============

  async wxUnifiedOrder(dto: { bizType: string; bizId: string; orderNo: string; amount: number; description: string; openid: string; userId?: string }) {
    return this.runWithLock(`payment:unified:${dto.bizType}:${dto.bizId}`, '支付单正在创建中，请勿重复提交', () => this.wxUnifiedOrderUnlocked(dto), 45);
  }

  private async wxUnifiedOrderUnlocked(dto: { bizType: string; bizId: string; orderNo: string; amount: number; description: string; openid: string; userId?: string }) {
    const wxPayConfig = await this.getWxPayConfig();
    const { mchid, appid, notifyUrl } = wxPayConfig;

    if (!mchid || !appid || !notifyUrl) {
      throw new BadRequestException('微信支付未配置完整：请在后台填写商户号、小程序 AppID 和支付回调地址');
    }

    // 幂等检查：如果已有支付单且已支付，直接返回
    const existing = await this.prisma.paymentOrder.findFirst({
      where: { bizType: dto.bizType, bizId: dto.bizId, status: 'paid' },
    });
    if (existing) {
      throw new BadRequestException('该订单已支付');
    }

    if (dto.bizType === 'errand_order') {
      const errandOrderBeforePay = await this.prisma.errandOrder.findUnique({
        where: { id: dto.bizId },
      });
      this.assertErrandOrderPayableNow(errandOrderBeforePay);
    }

    // AUD-P1-057: 查找或创建支付单，只复用 pending/paying 的有效单
    // closed/failed 订单已失效，必须创建新支付单，不复用旧单号
    let paymentOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        bizType: dto.bizType,
        bizId: dto.bizId,
        status: { in: ['pending', 'paying'] },
      },
    });

    if (paymentOrder?.expireTime && paymentOrder.expireTime <= new Date()) {
      const expiredPaymentNo = paymentOrder.paymentNo;
      try {
        const url = `/v3/pay/transactions/out-trade-no/${paymentOrder.paymentNo}?mchid=${mchid}`;
        const wxData = await this.wxPayRequest('GET', url, undefined, wxPayConfig);
        if (wxData.trade_state === 'SUCCESS') {
          await this.handlePaymentSuccess(paymentOrder.paymentNo, wxData.transaction_id);
          throw new BadRequestException('该订单已支付');
        }
        await this.syncPaymentTerminalState(paymentOrder.paymentNo, wxData.trade_state || '');
        paymentOrder = await this.prisma.paymentOrder.findUnique({
          where: { id: paymentOrder.id },
        });
      } catch (error: any) {
        if (error instanceof BadRequestException) throw error;
        this.logger.warn(`过期支付单确认失败: ${expiredPaymentNo} ${error?.message || ''}`);
        throw new BadRequestException('支付单状态确认中，请稍后重试');
      }
      if (paymentOrder && ['closed', 'failed'].includes(paymentOrder.status)) {
        paymentOrder = null;
      }
      if (paymentOrder && ['pending', 'paying'].includes(paymentOrder.status)) {
        throw new BadRequestException('支付单状态确认中，请稍后重试');
      }
    }

    const amountFen = Math.round(dto.amount * 100);
    const paymentNo = `PAY${Date.now()}${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;

    if (!paymentOrder) {
      paymentOrder = await this.prisma.paymentOrder.create({
        data: {
          paymentNo,
          bizType: dto.bizType,
          bizId: dto.bizId,
          orderNo: dto.orderNo,
          userId: dto.userId || '',
          amount: dto.amount,
          channel: 'wx_pay',
          status: 'pending',
          expireTime: new Date(Date.now() + 15 * 60 * 1000), // 15分钟过期
        },
      });
    }

    // 构建 V3 请求体
    const params = {
      appid,
      mchid,
      description: dto.description.slice(0, 127),
      out_trade_no: paymentOrder.paymentNo,
      notify_url: notifyUrl,
      amount: { total: amountFen, currency: 'CNY' },
      payer: { openid: dto.openid },
      time_expire: this.formatRfc3339(paymentOrder.expireTime || new Date(Date.now() + 15 * 60 * 1000)),
    };

    try {
      // 使用 wechatpay-axios-plugin 或直接 HTTP 调用
      const url = `/v3/pay/transactions/jsapi`;
      const response = await this.wxPayRequest('POST', url, params, wxPayConfig);

      const prepayId = response.prepay_id;

      // 更新支付单
      await this.prisma.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { wxPrepayId: prepayId, status: 'paying' },
      });

      // 生成小程序调起支付参数
      const timeStamp = String(Math.floor(Date.now() / 1000));
      const nonceStr = this.generateNonceStr(32);
      const packageStr = `prepay_id=${prepayId}`;
      const paySign = this.generatePaySign(appid, timeStamp, nonceStr, packageStr, wxPayConfig);

      return {
        timeStamp,
        nonceStr,
        package: packageStr,
        signType: 'RSA',
        paySign,
        // AUD-P1-057: 返回支付单已有的 paymentNo，不是新生成的
        paymentNo: paymentOrder.paymentNo,
      };
    } catch (error: any) {
      this.logger.error(`微信支付下单失败: ${error.message}`, error.response?.data);
      // 标记支付单失败
      await this.prisma.paymentOrder
        .update({
          where: { id: paymentOrder.id },
          data: { status: 'failed' },
        })
        .catch(() => {});
      throw new BadRequestException(`支付下单失败: ${error.response?.data?.message || error.message}`);
    }
  }

  // ============ 支付回调 ============

  async wxNotify(body: Buffer, headers: Record<string, string>) {
    const signature = headers['wechatpay-signature'];
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const serial = headers['wechatpay-serial'];

    if (!signature || !timestamp || !nonce) {
      this.logger.error('微信支付回调缺少签名参数');
      return { code: 'FAIL', message: '缺少签名参数' };
    }

    // 验证签名（失败直接 throw）
    const bodyStr = body.toString();
    const wxPayConfig = await this.getWxPayConfig();
    this.verifyWxPaySign(bodyStr, signature, timestamp, nonce, wxPayConfig);

    // 解析回调数据（V3 通知 body 为加密 JSON）
    let notifyData: any;
    try {
      notifyData = JSON.parse(bodyStr);
    } catch {
      return { code: 'FAIL', message: 'JSON解析失败' };
    }

    // 解密 resource.ciphertext（AES-256-GCM）
    let resourcePlain: string;
    try {
      resourcePlain = this.decryptResource(notifyData.resource, wxPayConfig);
    } catch (e: any) {
      this.logger.error(`解密回调数据失败: ${e.message}`);
      return { code: 'FAIL', message: '解密失败' };
    }

    let resourceData: any;
    try {
      resourceData = JSON.parse(resourcePlain);
    } catch {
      return { code: 'FAIL', message: 'resource JSON 解析失败' };
    }

    const { out_trade_no, transaction_id, trade_state } = resourceData;

    if (!out_trade_no) {
      this.logger.error('回调缺少 out_trade_no');
      return { code: 'FAIL', message: '缺少订单号' };
    }

    // 幂等处理：使用 Redis 分布式锁防止重复处理
    const lockKey = `wxpay_notify_lock:${out_trade_no}`;
    const locked = await this.redis.getLock(lockKey, 30);
    if (!locked) {
      this.logger.warn(`重复回调: ${out_trade_no}`);
      return { code: 'SUCCESS', message: 'OK' }; // 返回成功避免微信重复通知
    }

    try {
      if (trade_state === 'SUCCESS') {
        await this.handlePaymentSuccess(out_trade_no, transaction_id);
      } else {
        // AUD-P1-056: 非成功终态同步 — CLOSED/REVOKED → closed，PAYERROR → failed
        this.logger.warn(`支付回调非成功状态: ${out_trade_no} ${trade_state}`);
        await this.syncPaymentTerminalState(out_trade_no, trade_state);
      }
    } finally {
      await this.redis.releaseLock(lockKey);
    }

    return { code: 'SUCCESS', message: 'OK' };
  }

  private async handlePaymentSuccess(paymentNo: string, wxTransId: string) {
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { paymentNo },
    });

    if (!payment) {
      this.logger.error(`支付单不存在: ${paymentNo}`);
      return;
    }

    if (['paid', 'refunding', 'refunded'].includes(payment.status)) {
      this.logger.warn(`支付单已处理: ${paymentNo}`);
      return;
    }

    // 使用事务更新支付单和业务订单
    let bizUpdateResult: any = {};
    await this.prisma.$transaction(async (tx) => {
      // 1. 更新支付单
      await tx.paymentOrder.update({
        where: { id: payment.id },
        data: {
          wxTransId,
          status: 'paid',
          payTime: new Date(),
        },
      });

      // 2. 根据业务类型更新对应订单
      bizUpdateResult = await this.updateBizOrder(tx, payment);
    });

    if ((payment.bizType === 'errand_order' && bizUpdateResult.refundExpiredErrand) || (payment.bizType === 'order' && bizUpdateResult.refundCancelledShopOrder)) {
      const reason = bizUpdateResult.refundCancelledShopOrder ? '订单取消后支付成功自动退款' : '跑腿订单时间已过期自动退款';
      await this.refund({
        bizType: payment.bizType,
        bizId: payment.bizId,
        amount: Number(payment.amount),
        reason,
      }).catch((error) => {
        this.logger.warn(`支付成功后的自动退款失败: ${payment.bizId} ${error?.message || ''}`);
      });
      this.logger.warn(`支付成功但业务订单不可履约，已进入退款流程: ${payment.bizId}`);
      return;
    }

    if (payment.bizType === 'errand_order' && !bizUpdateResult.skipPostPayNotify) {
      await this.notifyAvailableErrandRiders(payment.bizId).catch((error) => {
        this.logger.warn(`跑腿订单支付后通知骑手失败: ${payment.bizId} ${error?.message || ''}`);
      });
    }
    if (payment.bizType === 'order') {
      await this.notifyShopMerchant(payment.bizId).catch((error) => {
        this.logger.warn(`商家支付后通知失败: ${payment.bizId} ${error?.message || ''}`);
      });
      await this.printService.enqueueAutomaticOrder(payment.bizId).catch((error) => {
        this.logger.warn(`商家自动打印入队失败: ${payment.bizId} ${error?.message || ''}`);
      });
    }

    this.logger.log(`支付成功: ${paymentNo}, bizType=${payment.bizType}, bizId=${payment.bizId}`);
  }

  /**
   * AUD-P1-056: 统一支付终态同步 — 将非 SUCCESS 的微信终态同步到本地支付单。
   * CLOSED/REVOKED/NOTPAY → closed，PAYERROR → failed
   */
  private async syncPaymentTerminalState(paymentNo: string, tradeState: string) {
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { paymentNo },
    });
    if (!payment || payment.status === 'paid' || payment.status === 'closed' || payment.status === 'failed') {
      return; // 已到终态，不重复更新
    }

    // AUD-P1-056: NOTPAY 只有在 expireTime 已过期时才改为 closed
    // 未到过期时间的 NOTPAY 说明用户尚未支付但仍在有效期内，不应提前关闭
    const terminalStatus =
      tradeState === 'NOTPAY'
        ? payment.expireTime && new Date() > new Date(payment.expireTime)
          ? ('closed' as const)
          : null
        : ['CLOSED', 'REVOKED'].includes(tradeState)
          ? ('closed' as const)
          : tradeState === 'PAYERROR'
            ? ('failed' as const)
            : null;

    if (!terminalStatus) {
      this.logger.warn(`未知支付终态: ${paymentNo} ${tradeState}，跳过同步`);
      return;
    }

    const updated = await this.prisma.paymentOrder.updateMany({
      where: { id: payment.id, status: { in: ['pending', 'paying'] } },
      data: { status: terminalStatus },
    });
    if (updated.count !== 1) return;

    await this.enqueueReservationRelease(payment);

    this.logger.log(`支付终态同步: ${paymentNo} → ${terminalStatus} (微信: ${tradeState})`);
  }

  private async enqueueReservationRelease(payment: any) {
    if (!['mall_order', 'order', 'errand_order', 'activity_order'].includes(payment.bizType)) return;
    await this.prisma.paymentReservationRelease
      .upsert({
        where: { paymentId: payment.id },
        create: { paymentId: payment.id },
        update: {},
      })
      .catch((error: any) => {
        this.logger.error(`支付终态释放任务创建失败: ${payment.paymentNo} ${error?.message || ''}`);
      });
  }

  private async updateBizOrder(tx: any, payment: any) {
    let result: any = {};
    switch (payment.bizType) {
      case 'order':
        const claimedShopOrder = await tx.order.updateMany({
          where: { id: payment.bizId, status: 'PENDING_PAY' },
          data: { status: 'PAID', payChannel: 'WX_PAY', payTime: new Date() },
        });
        if (claimedShopOrder.count !== 1) {
          const order = await tx.order.findUnique({
            where: { id: payment.bizId },
            select: { status: true },
          });
          if (order?.status === 'CANCELLED') {
            result = {
              skipPostPayNotify: true,
              refundCancelledShopOrder: true,
            };
            break;
          }
          throw new BadRequestException('外卖订单状态已变化，无法确认支付');
        }
        await tx.orderLog.create({
          data: {
            orderId: payment.bizId,
            action: 'PAID',
            fromStatus: 'PENDING_PAY',
            toStatus: 'PAID',
            operatorType: 'system',
            remark: `微信支付成功: ${payment.wxTransId || ''}`,
          },
        });
        break;

      case 'mall_order':
        const mallFeeConfig = await this.prisma.bizFeeConfig.findUnique({ where: { bizType: 'mall_order' } }).catch(() => null);
        const mallFeeRate = mallFeeConfig?.enabled && Number(mallFeeConfig?.rate || 0) ? Number(mallFeeConfig.rate) : 0;
        const mallFixedFee = mallFeeConfig?.enabled ? Number(mallFeeConfig.fixedFee || 0) : 0;
        const mallPlatformFee = mallFeeRate > 0 || mallFixedFee > 0 ? Math.round((Number(payment.amount) * mallFeeRate + mallFixedFee) * 100) / 100 : 0;
        await tx.mallOrder.update({
          where: { id: payment.bizId },
          data: {
            status: 'paid',
            payChannel: 'wx_pay',
            payTime: new Date(),
            ...(mallPlatformFee > 0 ? { platformFee: mallPlatformFee } : {}),
          },
        });
        break;

      case 'delivery_order':
        await tx.deliveryOrder.update({
          where: { id: payment.bizId },
          data: { status: 'PAID', payChannel: 'WX_PAY', payTime: new Date() },
        });
        break;

      case 'errand_order':
        const errandOrderBeforePay = await tx.errandOrder.findUnique({
          where: { id: payment.bizId },
        });
        try {
          this.assertErrandOrderPayableNow(errandOrderBeforePay);
        } catch (error) {
          await tx.errandOrder.update({
            where: { id: payment.bizId },
            data: {
              status: 'cancelled',
              cancelTime: new Date(),
              cancelReason: '订单时间已过期，系统自动关闭',
              refundStatus: 'refunding',
              refundAmount: payment.amount,
            },
          });
          result = { skipPostPayNotify: true, refundExpiredErrand: true };
          break;
        }
        await tx.errandOrder.update({
          where: { id: payment.bizId },
          data: {
            status: 'pending_accept',
            payChannel: 'wx_pay',
            payTime: new Date(),
          },
        });
        break;

      case 'recharge':
        const recharge = await tx.recharge.findUnique({
          where: { id: payment.bizId },
        });
        if (recharge) {
          await tx.recharge.update({
            where: { id: payment.bizId },
            data: { status: 'success', payTime: new Date() },
          });
          const wallet = await tx.wallet.upsert({
            where: { userId: recharge.userId },
            create: {
              userId: recharge.userId,
              balance: recharge.amount,
              totalIn: recharge.amount,
            },
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
              balance: wallet.balance,
              channel: 'WX_PAY',
              orderNo: recharge.orderNo,
              description: '余额充值',
              status: 'SUCCESS',
            },
          });
        }
        break;

      case 'topup':
        const topup = await tx.topupOrder.findUnique({
          where: { id: payment.bizId },
        });
        if (topup) {
          const post = topup.postId
            ? await tx.post.findUnique({
                where: { id: topup.postId },
                select: { topExpireAt: true },
              })
            : null;
          const duration = Math.max(1, Number(topup.duration || 24));
          const unit = String(topup.durationUnit || 'hours');
          const unitMs: Record<string, number> = {
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            weeks: 7 * 24 * 60 * 60 * 1000,
            months: 30 * 24 * 60 * 60 * 1000,
          };
          const now = new Date();
          const base = post?.topExpireAt && post.topExpireAt > now ? post.topExpireAt : now;
          const topExpireAt = new Date(base.getTime() + duration * (unitMs[unit] || unitMs.hours));
          await tx.topupOrder.update({
            where: { id: payment.bizId },
            data: {
              status: 'success',
              payTime: new Date(),
              paymentNo: payment.paymentNo,
              topExpireAt,
            },
          });
          if (topup.postId) {
            await tx.post.update({
              where: { id: topup.postId },
              data: { isTop: true, topExpireAt },
            });
          }
        }
        break;

      case 'second_hand': {
        const order = await tx.secondHandOrder.findUnique({
          where: { id: payment.bizId },
        });
        await tx.secondHandOrder.update({
          where: { id: payment.bizId },
          data: {
            status: 'paid',
            payChannel: 'wx_pay',
            payTime: new Date(),
            paymentNo: payment.paymentNo,
          },
        });
        if (order?.productId) {
          await tx.secondHand
            .update({
              where: { id: order.productId },
              data: { status: 'SOLD' },
            })
            .catch(() => null);
        }
        break;
      }

      case 'activity_order': {
        const order = await tx.activityOrder.findUnique({
          where: { id: payment.bizId },
          include: { package: true },
        });
        if (!order) break;
        if (order.payStatus === 'paid' || order.orderStatus === 'paid' || order.orderStatus === 'joined') break;

        await tx.activityOrder.update({
          where: { id: order.id },
          data: {
            payStatus: 'paid',
            orderStatus: 'paid',
            payChannel: 'wx_pay',
            payTime: new Date(),
          },
        });
        await tx.activityJoin.upsert({
          where: {
            activityId_userId: {
              activityId: order.activityId,
              userId: order.userId,
            },
          },
          create: {
            activityId: order.activityId,
            userId: order.userId,
            status: 'joined',
          },
          update: { status: 'joined' },
        });
        await tx.activity.update({
          where: { id: order.activityId },
          data: { joinCount: { increment: order.quantity } },
        });
        if (order.packageId) {
          // AUD-P1-009: 原子库存扣减 — 防止超卖。只有 availableTickets >= quantity 才扣减。
          const stockResult = await tx.activityPackage.updateMany({
            where: {
              id: order.packageId,
              availableTickets: { gte: order.quantity },
            },
            data: { availableTickets: { decrement: order.quantity } },
          });
          if (stockResult.count === 0) {
            // 库存不足 — 不生成票券，订单进入待退款
            await tx.activityOrder.update({
              where: { id: order.id },
              data: {
                orderStatus: 'pending_refund',
                remark: '库存不足，自动退款',
              },
            });
            result.needsRefund = true;
            break;
          }
        }
        const ticketCount = await tx.activityTicket.count({
          where: { orderId: order.id },
        });
        if (ticketCount === 0) {
          await tx.activityTicket.createMany({
            data: Array.from({ length: order.quantity }).map((_, index) => ({
              orderId: order.id,
              packageId: order.packageId,
              activityId: order.activityId,
              userId: order.userId,
              ticketNumber: `${order.orderNo}-${String(index + 1).padStart(2, '0')}`,
              ticketStatus: 'valid',
            })),
          });
        }
        break;
      }

      case 'membership_order': {
        const order = await tx.membershipOrder.findUnique({
          where: { id: payment.bizId },
          include: { plan: true },
        });
        if (!order || order.status === 'paid') break;
        const now = new Date();
        const active = await tx.userMembership.findFirst({
          where: {
            userId: order.userId,
            status: 'active',
            expiredAt: { gt: now },
          },
          orderBy: { expiredAt: 'desc' },
        });
        const base = active?.expiredAt && active.expiredAt > now ? active.expiredAt : now;
        const expiredAt = new Date(base.getTime() + Number(order.durationDays || 30) * 24 * 60 * 60 * 1000);
        await tx.membershipOrder.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            payChannel: 'wx_pay',
            paymentNo: payment.paymentNo,
            payTime: now,
          },
        });
        const membership = await tx.userMembership.create({
          data: {
            userId: order.userId,
            planId: order.planId,
            planName: order.planName,
            level: Number(order.plan?.level || 1),
            startedAt: now,
            expiredAt,
            source: 'order',
            sourceOrderId: order.id,
          },
        });
        await this.membershipService.issueBenefits(order.userId, membership, order.plan, tx);
        break;
      }

      default:
        this.logger.warn(`未知支付业务类型: ${payment.bizType}`);
    }

    // 记录平台流水
    try {
      await tx.platformLedger.create({
        data: {
          orderNo: payment.paymentNo,
          orderType: payment.bizType,
          amount: payment.amount,
          type: 'income',
          channel: 'wx_pay',
          status: 'completed',
          description: `微信支付收款: ${payment.bizType}`,
        },
      });
    } catch (e: any) {
      this.logger.warn(`记录平台流水失败: ${e.message}`);
    }
    return result;
  }

  // ============ 查询支付状态 ============

  async queryPayment(paymentNo: string) {
    let payment = await this.prisma.paymentOrder.findUnique({
      where: { paymentNo },
    });
    if (!payment) throw new BadRequestException('支付单不存在');

    // 尝试从微信查询
    try {
      const wxPayConfig = await this.getWxPayConfig();
      const url = `/v3/pay/transactions/out-trade-no/${paymentNo}?mchid=${wxPayConfig.mchid}`;
      const wxData = await this.wxPayRequest('GET', url, undefined, wxPayConfig);
      if (wxData.trade_state === 'SUCCESS' && payment.status !== 'paid') {
        await this.handlePaymentSuccess(paymentNo, wxData.transaction_id);
        const refreshedPayment = await this.prisma.paymentOrder.findUnique({
          where: { paymentNo },
        });
        if (refreshedPayment) payment = refreshedPayment;
      } else if (wxData.trade_state && wxData.trade_state !== 'SUCCESS' && ['pending', 'paying'].includes(payment.status)) {
        // AUD-P1-056: 查询结果为非成功终态且本地仍在 paying，同步终态
        await this.syncPaymentTerminalState(paymentNo, wxData.trade_state);
        const refreshedPayment = await this.prisma.paymentOrder.findUnique({
          where: { paymentNo },
        });
        if (refreshedPayment) payment = refreshedPayment;
      }
    } catch (e: any) {
      this.logger.warn(`查询微信支付状态失败: ${e.message}`);
    }

    // 同时查询关联的业务订单
    let bizOrder: any = null;
    switch (payment.bizType) {
      case 'order':
        bizOrder = await this.prisma.order.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'mall_order':
        bizOrder = await this.prisma.mallOrder.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'delivery_order':
        bizOrder = await this.prisma.deliveryOrder.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'errand_order':
        bizOrder = await this.prisma.errandOrder.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'recharge':
        bizOrder = await this.prisma.recharge.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'topup':
        bizOrder = await this.prisma.topupOrder.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'second_hand':
        bizOrder = await this.prisma.secondHandOrder.findUnique({
          where: { id: payment.bizId },
        });
        break;
      case 'activity_order':
        bizOrder = await this.prisma.activityOrder.findUnique({
          where: { id: payment.bizId },
          include: { activity: true, package: true, tickets: true },
        });
        break;
    }

    return {
      payment: {
        paymentNo: payment.paymentNo,
        status: payment.status,
        amount: Number(payment.amount),
        payTime: payment.payTime,
        wxTransId: payment.wxTransId,
      },
      bizOrder: bizOrder
        ? {
            orderNo: bizOrder.orderNo,
            status: bizOrder.status,
            payAmount: bizOrder.payAmount ? Number(bizOrder.payAmount) : null,
          }
        : null,
    };
  }

  /**
   * AUD-P1-052: payment expiry is confirmed with WeChat before the scheduler
   * releases any inventory, coupon, or membership reservation. Local expiry
   * alone is not authoritative because a delayed payment can still succeed.
   */
  async reconcileExpiredPayments(limit = 100) {
    const candidates = await this.prisma.paymentOrder.findMany({
      where: {
        status: { in: ['pending', 'paying'] },
        expireTime: { lte: new Date() },
      },
      orderBy: { expireTime: 'asc' },
      take: limit,
    });
    if (candidates.length === 0) return [];

    let wxPayConfig: any;
    try {
      wxPayConfig = await this.getWxPayConfig();
    } catch (error: any) {
      this.logger.warn(`支付超时微信复核跳过: ${error?.message || '微信支付配置不可用'}`);
      return [];
    }
    const terminalPayments: any[] = [];
    for (const candidate of candidates) {
      try {
        const url = `/v3/pay/transactions/out-trade-no/${candidate.paymentNo}?mchid=${wxPayConfig.mchid}`;
        const wxData = await this.wxPayRequest('GET', url, undefined, wxPayConfig);
        if (wxData.trade_state === 'SUCCESS') {
          await this.handlePaymentSuccess(candidate.paymentNo, wxData.transaction_id);
          continue;
        }
        await this.syncPaymentTerminalState(candidate.paymentNo, wxData.trade_state || '');
        const refreshed = await this.prisma.paymentOrder.findUnique({
          where: { id: candidate.id },
        });
        if (refreshed && ['closed', 'failed'].includes(refreshed.status)) {
          terminalPayments.push(refreshed);
        }
      } catch (error: any) {
        this.logger.warn(`支付超时微信复核失败: ${candidate.paymentNo} ${error?.message || ''}`);
      }
    }
    return terminalPayments;
  }

  private async notifyAvailableErrandRiders(orderId: string) {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: orderId },
    });
    if (!order?.regionId) return;
    const regionId = order.regionId;

    const riders = await this.prisma.regionRider.findMany({
      where: {
        regionId,
        verifyStatus: 'approved',
        status: 'online',
        notificationStatus: { not: false },
      },
      select: { userId: true },
    });
    if (!riders.length) return;

    const amount = Number(order.payAmount || 0);
    const title = '有新的跑腿订单待接单';
    const content = `${this.errandTypeName(order.type)} ${amount.toFixed(2)}元，点击查看接单大厅`;
    const results = await Promise.allSettled(
      riders.map((rider) =>
        this.notifyService.createAndDispatch({
          userId: rider.userId,
          regionId,
          type: 'delivery',
          scene: 'new_errand_order',
          title,
          content,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            serviceType: this.errandMiniType(order.type),
            amount,
          },
          linkType: 'page',
          linkValue: '/RunErrands?tab=pending_orders',
          channelMask: { inApp: true, websocket: true },
        }),
      ),
    );
    const failed = results.filter((item) => item.status === 'rejected').length;
    if (failed) this.logger.warn(`跑腿新单通知部分失败 order=${order.id} failed=${failed}`);
  }

  private async notifyShopMerchant(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, nickname: true } },
        merchant: {
          select: {
            id: true,
            userId: true,
            name: true,
            businessType: true,
            regionId: true,
          },
        },
        items: { select: { id: true } },
      },
    });
    if (
      !order?.merchant?.userId ||
      order.status !== 'PAID' ||
      order.merchantAcceptTime ||
      ['refunding', 'refunded'].includes(String(order.refundStatus || 'none')) ||
      (order.fulfillmentStartTime && new Date(order.fulfillmentStartTime) > new Date())
    )
      return;
    const amount = Number(order.payAmount || 0);
    const isDormShop = order.businessType === 'dorm_shop';
    await this.notifyService.createAndDispatch({
      userId: order.merchant.userId,
      regionId: order.merchant.regionId || undefined,
      type: 'order',
      scene: isDormShop ? 'new_dorm_shop_order' : 'new_takeaway_order',
      title: isDormShop ? '宿舍小店有新订单' : '商家有新外卖订单',
      content: `${order.user?.nickname || '用户'} 已付款 ¥${amount.toFixed(2)}，请及时确认接单`,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        merchantId: order.merchant.id,
        amount,
        itemsCount: order.items.length,
      },
      linkType: 'page',
      linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchant.id}`,
      channelMask: { inApp: true, websocket: true },
    });
    if (order.fulfillmentStartTime) {
      await this.prisma.orderLog.create({
        data: {
          orderId: order.id,
          action: 'SCHEDULED_MERCHANT_NOTIFY',
          fromStatus: 'PAID',
          toStatus: 'PAID',
          operatorType: 'system',
          remark: '预约订单支付时已到履约时间，已通知商家',
        },
      });
    }
  }

  private errandTypeName(type?: string) {
    const map: Record<string, string> = {
      pickup: '帮我取件',
      deliver: '帮我寄件',
      meal: '帮我取餐',
      universal: '万能任务',
    };
    return map[String(type || '')] || '跑腿任务';
  }

  private errandMiniType(type?: string) {
    const map: Record<string, string> = {
      pickup: 'express_pickup',
      deliver: 'express_send',
      meal: 'food_delivery',
      universal: 'custom_task',
    };
    return map[String(type || '')] || String(type || 'custom_task');
  }

  // ============ 退款 ============

  /**
   * AUD-P1-058: 退款金额入口校验 - 必须是有限正数、最多两位小数（分单位）
   */
  private validateRefundAmount(amount: any, refundableCents: number): number {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('退款金额必须为正数');
    }
    // 转为分单位整数并回推元，确保不超过两位小数
    const cents = Math.round(n * 100);
    const backToYuan = cents / 100;
    if (Math.abs(n * 100 - cents) > 1e-8) {
      throw new BadRequestException('退款金额最多支持两位小数');
    }
    if (cents > refundableCents) {
      const refundableYuan = refundableCents / 100;
      throw new BadRequestException(`退款金额超过可退金额(${refundableYuan.toFixed(2)})`);
    }
    return backToYuan;
  }

  /**
   * FIN-P0-001: 用户售后退款申请（商家接单后）。
   * 只创建 pending PaymentRefund 进入后台审核队列，不直接执行退款；
   * 审核通过走 executeRefund，驳回走 rejectRefundById（自动恢复订单状态）。
   */
  async applyShopOrderRefund(orderId: string, userId: string, reason: string, amountInput?: any) {
    return this.runWithLock(
      `payment:refund:order:${orderId}`,
      '退款正在处理中，请勿重复提交',
      async () => {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderNo: true,
            userId: true,
            status: true,
            payAmount: true,
            merchantAcceptTime: true,
            completeTime: true,
            refundStatus: true,
            merchantId: true,
            merchant: { select: { userId: true, name: true, regionId: true } },
          },
        });
        if (!order) throw new BadRequestException('订单不存在');
        if (order.userId !== userId) throw new ForbiddenException('无权操作该订单');
        if (order.refundStatus !== 'none') {
          throw new BadRequestException('该订单已有退款在处理中');
        }
        const allowedStatuses = ['PAID', 'SHIPPED', 'DELIVERED', 'RECEIVED', 'COMPLETED'];
        if (!allowedStatuses.includes(String(order.status))) {
          throw new BadRequestException('当前订单状态不支持申请退款');
        }
        if (order.status === 'PAID' && !order.merchantAcceptTime) {
          throw new BadRequestException('商家尚未接单，请直接使用自助退款');
        }
        // 完成后 48 小时内可申请售后
        if (order.status === 'COMPLETED' && order.completeTime && Date.now() - new Date(order.completeTime).getTime() > 48 * 60 * 60 * 1000) {
          throw new BadRequestException('订单完成超过 48 小时，如需帮助请提交订单申诉');
        }

        const payment = await this.prisma.paymentOrder.findFirst({
          where: {
            bizType: 'order',
            bizId: orderId,
            status: { in: ['paid', 'refunding'] },
          },
        });
        if (!payment) throw new BadRequestException('未找到可退款的支付单');
        const processingCount = await this.prisma.paymentRefund.count({
          where: {
            paymentId: payment.id,
            status: { in: ['pending', 'processing'] },
          },
        });
        if (processingCount > 0) {
          throw new BadRequestException('已有退款申请在处理中，请耐心等待审核结果');
        }

        const refundableCents = Math.round((Number(payment.amount) - Number(payment.refundedAmount)) * 100);
        const amount = amountInput === undefined || amountInput === null || amountInput === '' ? refundableCents / 100 : this.validateRefundAmount(amountInput, refundableCents);
        if (amount <= 0) throw new BadRequestException('该订单无可退金额');

        const refundNo = `REF${Date.now()}${Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, '0')}`;
        const refundRecord = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: orderId, refundStatus: 'none' },
            data: { refundStatus: 'refunding', refundAmount: amount },
          });
          if (claimed.count !== 1) {
            throw new BadRequestException('订单状态已变化，请刷新后重试');
          }
          const created = await tx.paymentRefund.create({
            data: {
              refundNo,
              paymentId: payment.id,
              amount,
              reason,
              sourceType: 'user_after_sale',
              sourceId: orderId,
              status: 'pending',
            },
          });
          await tx.orderLog.create({
            data: {
              orderId,
              action: 'REFUND_APPLIED',
              fromStatus: String(order.status),
              toStatus: String(order.status),
              operatorId: userId,
              operatorType: 'user',
              remark: `用户申请售后退款 ¥${amount.toFixed(2)}：${reason}`,
            },
          });
          return created;
        });

        if (order.merchant?.userId) {
          await this.notifyService
            .createAndDispatch({
              userId: order.merchant.userId,
              regionId: order.merchant.regionId || undefined,
              type: 'order',
              scene: 'shop_order_refund_applied_merchant',
              title: '订单售后退款申请',
              content: `订单 ${order.orderNo} 用户申请退款 ¥${amount.toFixed(2)}，平台将尽快审核：${reason}`,
              data: {
                orderId,
                orderNo: order.orderNo,
                refundId: refundRecord.id,
              },
              linkType: 'page',
              linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
              channelMask: { inApp: true, websocket: true },
            })
            .catch(() => undefined);
        }
        return {
          success: true,
          refundId: refundRecord.id,
          refundNo,
          amount,
          status: 'pending',
          message: '退款申请已提交，平台将尽快审核',
        };
      },
      60,
    );
  }

  /** FIN-P0-001: 用户撤销自己的售后退款申请，恢复订单可处理状态。 */
  async cancelShopOrderRefundApplication(orderId: string, userId: string) {
    return this.runWithLock(
      `payment:refund:order:${orderId}`,
      '退款正在处理中，请勿重复提交',
      async () => {
        const payment = await this.prisma.paymentOrder.findFirst({
          where: { bizType: 'order', bizId: orderId },
          orderBy: { createdAt: 'desc' },
        });
        if (!payment) throw new BadRequestException('未找到支付单');
        if (payment.userId !== userId) throw new ForbiddenException('无权操作该订单');
        const pending = await this.prisma.paymentRefund.findFirst({
          where: {
            paymentId: payment.id,
            status: 'pending',
            sourceType: 'user_after_sale',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!pending) throw new BadRequestException('没有可撤销的退款申请');
        const cancelled = await this.prisma.paymentRefund.updateMany({
          where: { id: pending.id, status: 'pending' },
          data: { status: 'failed', failReason: '用户主动撤销退款申请' },
        });
        if (!cancelled.count) {
          throw new BadRequestException('退款申请状态已变化，请刷新后重试');
        }
        const refundedAmount = Number(payment.refundedAmount || 0);
        await this.prisma.order.updateMany({
          where: { id: orderId, refundStatus: 'refunding' },
          data: {
            refundStatus: refundedAmount > 0 ? 'partial' : 'none',
            refundAmount: refundedAmount || null,
          },
        });
        await this.prisma.orderLog
          .create({
            data: {
              orderId,
              action: 'REFUND_APPLY_CANCELLED',
              operatorId: userId,
              operatorType: 'user',
              remark: '用户撤销售后退款申请，订单恢复可处理状态',
            },
          })
          .catch(() => undefined);
        return { success: true, message: '退款申请已撤销' };
      },
      60,
    );
  }

  async refund(dto: { bizType: string; bizId: string; amount: number; reason: string; operatorId?: string; sourceType?: string; sourceId?: string }) {
    return this.runWithLock(`payment:refund:${dto.bizType}:${dto.bizId}`, '退款正在处理中，请勿重复提交', () => this.refundUnlocked(dto), 60);
  }

  private async refundUnlocked(dto: { bizType: string; bizId: string; amount: number; reason: string; operatorId?: string; sourceType?: string; sourceId?: string }) {
    // 查找支付单
    const payment = await this.prisma.paymentOrder.findFirst({
      where: {
        bizType: dto.bizType,
        bizId: dto.bizId,
        status: { in: ['paid', 'refunding'] },
      },
    });
    if (!payment) throw new BadRequestException('未找到可退款的支付单');

    const processingRefundCount = await this.prisma.paymentRefund.count({
      where: {
        paymentId: payment.id,
        status: { in: ['pending', 'processing'] },
      },
    });
    if (processingRefundCount > 0) {
      throw new BadRequestException('已有退款在处理中，请等待退款结果');
    }

    // AUD-P1-058: 入口金额校验 - 正数、有限、最多两位小数、不超过可退金额
    const refundableCents = Math.round((Number(payment.amount) - Number(payment.refundedAmount)) * 100);
    const amount = this.validateRefundAmount(dto.amount, refundableCents);

    const refundNo = `REF${Date.now()}${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;

    // 创建退款记录
    const refundRecord = await this.prisma.paymentRefund.create({
      data: {
        refundNo,
        paymentId: payment.id,
        amount,
        reason: dto.reason,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        status: 'pending',
      },
    });

    if (String(payment.channel || '').toLowerCase() === 'balance') {
      try {
        const completed = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.paymentRefund.updateMany({
            where: { id: refundRecord.id, status: 'pending' },
            data: { status: 'success', refundedAt: new Date() },
          });
          if (claimed.count !== 1) return false;

          const credited = await tx.wallet.updateMany({
            where: { userId: payment.userId },
            data: {
              balance: { increment: amount },
              totalIn: { increment: amount },
            },
          });
          if (credited.count !== 1) throw new BadRequestException('退款钱包不存在');
          const wallet = await tx.wallet.findUnique({
            where: { userId: payment.userId },
          });
          const newRefundedAmount = Number(payment.refundedAmount || 0) + amount;

          await tx.walletTransaction.create({
            data: {
              userId: payment.userId,
              type: 'REFUND',
              amount,
              balance: Number(wallet?.balance || 0),
              channel: 'BALANCE',
              orderNo: payment.orderNo || payment.paymentNo || null,
              description: `余额退款: ${dto.reason || ''}`,
              status: 'SUCCESS',
            },
          });
          await tx.paymentOrder.update({
            where: { id: payment.id },
            data: {
              refundedAmount: newRefundedAmount,
              status: newRefundedAmount >= Number(payment.amount) ? 'refunded' : 'refunding',
            },
          });
          await this.markBizRefunded(tx, dto.bizType, dto.bizId, amount, newRefundedAmount >= Number(payment.amount), newRefundedAmount, refundRecord.id);
          await tx.platformLedger.create({
            data: {
              orderNo: refundNo,
              orderType: payment.bizType,
              amount,
              type: 'refund',
              channel: 'balance',
              status: 'completed',
              description: `余额退款: ${dto.reason || ''}`,
            },
          });
          return true;
        });
        if (!completed) throw new BadRequestException('退款状态已变化，请刷新后重试');
        await this.notifyShopRefundSuccess(payment, amount, dto.reason);
        return { success: true, refundNo, status: 'success' };
      } catch (error: any) {
        await this.prisma.paymentRefund.updateMany({
          where: { id: refundRecord.id, status: 'pending' },
          data: {
            status: 'failed',
            failReason: error?.message || '余额退款失败',
          },
        });
        throw error instanceof BadRequestException ? error : new BadRequestException(`退款失败: ${error?.message || '余额退款失败'}`);
      }
    }

    // 尝试调用微信退款 API
    try {
      const wxPayConfig = await this.getWxPayConfig();
      const url = `/v3/refund/domestic/refunds`;
      const params: Record<string, any> = {
        transaction_id: payment.wxTransId,
        out_refund_no: refundNo,
        amount: {
          refund: Math.round(amount * 100),
          total: Math.round(Number(payment.amount) * 100),
          currency: 'CNY',
        },
        reason: dto.reason || '用户退款',
      };
      if (wxPayConfig.refundNotifyUrl) {
        params.notify_url = wxPayConfig.refundNotifyUrl;
      }

      const wxRefund = await this.wxPayRequest('POST', url, params, wxPayConfig);

      // AUD-P1-059: PROCESSING 时不累计 refundedAmount、不写 completed 平台流水
      // 只有微信明确返回 SUCCESS 才在本次事务中完成记账
      const isWxSuccess = wxRefund.status === 'SUCCESS';

      await this.prisma.$transaction(async (tx) => {
        // 只有抢到 pending 状态的执行方才能结算，避免同步响应与异步回调重复记账。
        const updated = await tx.paymentRefund.updateMany({
          where: { id: refundRecord.id, status: 'pending' },
          data: {
            wxRefundId: wxRefund.refund_id,
            status: isWxSuccess ? 'success' : 'processing',
            refundedAt: isWxSuccess ? new Date() : null,
          },
        });
        if (updated.count === 0) return;

        if (isWxSuccess) {
          // AUD-P1-059: 只有 SUCCESS 才累计 refundedAmount
          const newRefundedAmount = Number(payment.refundedAmount) + amount;
          await tx.paymentOrder.update({
            where: { id: payment.id },
            data: {
              refundedAmount: newRefundedAmount,
              status: newRefundedAmount >= Number(payment.amount) ? 'refunded' : 'refunding',
            },
          });

          // AUD-P1-060: 退款成功回写业务终态
          await this.markBizRefunded(tx, dto.bizType, dto.bizId, amount, newRefundedAmount >= Number(payment.amount), newRefundedAmount, refundRecord.id);

          // 记录平台退款流水（仅成功时写 completed）
          await tx.platformLedger.create({
            data: {
              orderNo: refundNo,
              orderType: payment.bizType,
              amount,
              type: 'refund',
              channel: 'wx_pay',
              status: 'completed',
              description: `退款: ${dto.reason || ''}`,
            },
          });
        } else {
          // AUD-P1-059: PROCESSING - 只写业务 refunding，不累计金额不写完成流水
          await this.updateBizRefunding(tx, dto.bizType, dto.bizId, amount);
        }
      });

      if (isWxSuccess) {
        await this.notifyShopRefundSuccess(payment, amount, dto.reason);
      } else {
        await this.notifyShopRefundProcessing(payment, amount, dto.reason, dto.operatorId);
      }

      return {
        success: true,
        refundNo,
        status: isWxSuccess ? 'success' : 'processing',
      };
    } catch (error: any) {
      this.logger.error(`退款失败: ${error.message}`);

      // 标记退款失败
      await this.prisma.paymentRefund.updateMany({
        where: { id: refundRecord.id, status: 'pending' },
        data: {
          status: 'failed',
          failReason: error.response?.data?.message || error.message,
        },
      });

      throw new BadRequestException(`退款失败: ${error.response?.data?.message || error.message}`);
    }
  }

  /** AUD-P1-060: 申请退款时只标 refunding，不记账 */
  private async updateBizRefunding(tx: any, bizType: string, bizId: string, amount: number) {
    await this.updateBizRefundStatus(tx, bizType, bizId, amount);
  }

  private parseModifierSelections(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async restoreShopOrderInventory(tx: any, order: any) {
    for (const item of order.items || []) {
      await tx.product.updateMany({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          saleCount: { decrement: item.quantity },
        },
      });
      if (item.skuId) {
        await tx.sKU.updateMany({
          where: { id: item.skuId },
          data: { stock: { increment: item.quantity } },
        });
      }
      for (const modifier of this.parseModifierSelections(item.modifierSelections)) {
        if (modifier.stockManaged) {
          await tx.productModifierOption.updateMany({
            where: { id: modifier.optionId, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    }
  }

  private async restoreShopOrderBenefits(tx: any, order: any) {
    await this.membershipService.restoreBenefitUsagesForTarget('shop_order', order.id, tx);
    await tx.subsidyLedger
      .updateMany({
        where: {
          sourceType: 'membership',
          orderType: 'order',
          orderId: order.id,
        },
        data: { status: 'cancelled' },
      })
      .catch(() => undefined);
    if (order.status !== 'PAID' || order.merchantAcceptTime || !order.userId || !order.orderNo) return;
    const coupon = await tx.couponReceive.findFirst({
      where: { userId: order.userId, orderNo: order.orderNo, status: 'used' },
    });
    if (!coupon) return;
    const released = await tx.couponReceive.updateMany({
      where: { id: coupon.id, status: 'used' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
    if (!released.count) return;
    await tx.coupon.update({
      where: { id: coupon.couponId },
      data: { usedCount: { decrement: 1 } },
    });
    await tx.subsidyLedger.updateMany({
      where: { sourceType: 'coupon', orderType: 'order', orderId: order.id },
      data: { status: 'cancelled' },
    });
  }

  async cancelFreeShopOrder(orderId: string, reason: string, operatorId: string, operatorType: 'user' | 'merchant' | 'system') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.status !== 'PAID' || Number(order.payAmount) !== 0 || order.merchantAcceptTime || order.riderId || order.refundStatus !== 'none' || !order.stockReserved) {
      throw new BadRequestException('当前订单不能取消');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'PAID',
          payAmount: 0,
          merchantAcceptTime: null,
          riderId: null,
          refundStatus: 'none',
          stockReserved: true,
        },
        data: {
          status: 'CANCELLED',
          cancelTime: new Date(),
          cancelReason: reason,
          stockReserved: false,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
      await this.restoreShopOrderInventory(tx, order);
      await this.restoreShopOrderBenefits(tx, order);
      await tx.orderLog.create({
        data: {
          orderId,
          action: 'CANCELLED',
          fromStatus: 'PAID',
          toStatus: 'CANCELLED',
          operatorId,
          operatorType,
          remark: reason,
        },
      });
    });

    await this.notifyService
      .createAndDispatch({
        userId: order.userId,
        type: 'order',
        scene: 'shop_order_cancelled',
        title: '订单已取消',
        content: '该订单无需支付，已取消并退回已占用的优惠权益。',
        data: { orderId, orderNo: order.orderNo },
        linkType: 'page',
        linkValue: `/pagesA/order/order-detail/order-detail?id=${orderId}`,
        channelMask: { inApp: true, websocket: true },
      })
      .catch(() => undefined);
    return { success: true, message: '订单已取消，无需退款' };
  }

  /** AUD-P1-060: 退款成功后把业务单推到 refunded */
  private async adjustSettledShopOrderForRefund(tx: any, order: any, refundAmount: number, isFullRefund: boolean, refundedAmount: number, refundId?: string) {
    if (!order?.merchantId || !order?.completeTime) return;
    const settlement = await tx.merchantSettlement.findFirst({
      where: {
        merchantId: order.merchantId,
        startAt: { lte: order.completeTime },
        endAt: { gte: order.completeTime },
        OR: [{ periodKey: null }, { periodKey: { not: { startsWith: 'refund-adjustment:' } } }],
      },
      select: { id: true, amount: true, platformFee: true, status: true },
    });
    if (!settlement) return;

    const goodsAmount = Math.max(0, Number(order.totalAmount || 0) - Number(order.originalFreightAmount || order.freightAmount || 0));
    const previousRefundedAmount = Math.max(0, Number(refundedAmount || 0) - Number(refundAmount || 0));
    const previousGoodsRefund = Math.min(goodsAmount, previousRefundedAmount);
    const totalGoodsRefund = isFullRefund ? goodsAmount : Math.min(goodsAmount, Math.max(0, Number(refundedAmount || 0)));
    const goodsRefund = Math.max(0, totalGoodsRefund - previousGoodsRefund);
    if (!goodsRefund) return;
    const commissionRate = Number(settlement.amount || 0) ? Number(settlement.platformFee || 0) / Number(settlement.amount) : 0;
    const feeRefund = Math.round(goodsRefund * commissionRate * 100) / 100;

    let adjustmentSettlement = settlement;
    if (settlement.status !== 'paid') {
      const updated = await tx.merchantSettlement.updateMany({
        where: {
          id: settlement.id,
          status: { in: ['pending', 'processing', 'completed', 'failed'] },
        },
        data: {
          amount: { decrement: goodsRefund },
          platformFee: { decrement: feeRefund },
          ...(isFullRefund ? { orderCount: { decrement: 1 } } : {}),
        },
      });
      if (updated.count) return;
      adjustmentSettlement = await tx.merchantSettlement.findFirst({
        where: { id: settlement.id, status: 'paid' },
        select: { id: true, amount: true, platformFee: true, status: true },
      });
      if (!adjustmentSettlement) return;
    }

    const adjustmentKey = `refund-adjustment:${refundId || `${order.id}:${refundAmount}`}`;
    await tx.merchantSettlement.create({
      data: {
        merchantId: order.merchantId,
        settlementNo: `MSA${Date.now()}${adjustmentKey
          .slice(-6)
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()}`,
        amount: -goodsRefund,
        platformFee: -feeRefund,
        startAt: order.completeTime,
        endAt: new Date(),
        orderCount: 0,
        status: 'pending',
        remark: `退款差额调整：订单 ${order.orderNo || order.id}，待财务登记抵扣`,
        periodKey: adjustmentKey,
      },
    });
  }

  private async adjustErrandRiderSettlementForRefund(tx: any, orderId: string, refundId: string | undefined, amount: number) {
    const item = await tx.riderSettlementItem.findUnique({
      where: { orderType_orderId: { orderType: 'errand', orderId } },
      include: { settlement: true },
    });
    if (!item) return;

    const payableAmount = Number(item.payableAmount || 0);
    const reversalAmount = Number(Math.min(Math.max(0, amount), payableAmount).toFixed(2));
    if (!reversalAmount) return;
    const fullyReversed = reversalAmount >= payableAmount;
    const reversalData = {
      status: fullyReversed ? 'reversed' : 'adjusted',
      reversalAmount,
      reversedAt: new Date(),
      reverseReason: '跑腿订单退款',
    };

    const reversed = await tx.riderSettlementItem.updateMany({
      where: { id: item.id, status: { in: ['included', 'adjusted'] } },
      data: reversalData,
    });
    if (reversed.count !== 1) {
      const existingRisk = await tx.deliveryRiskEvent.findFirst({
        where: {
          orderId,
          orderType: 'errand',
          eventType: 'settlement_reversal_failed',
          handled: false,
        },
        select: { id: true },
      });
      if (!existingRisk) {
        await tx.deliveryRiskEvent.create({
          data: {
            orderId,
            orderType: 'errand',
            riderId: item.riderId,
            eventType: 'settlement_reversal_failed',
            eventLevel: 'critical',
            description: `跑腿退款 ${refundId || '-'} 已成功，但骑手结算明细状态已变化，冲正未执行，请财务人工核查。`,
          },
        });
      }
      return;
    }

    if (item.settlement.status === 'PAID') {
      const liabilityRefundId = refundId || `legacy:${orderId}:${reversalAmount}`;
      await tx.riderLiability.upsert({
        where: { orderId_refundId: { orderId, refundId: liabilityRefundId } },
        create: {
          riderId: item.riderId,
          orderId,
          refundId: liabilityRefundId,
          amount: reversalAmount,
          reason: '已打款跑腿订单发生退款',
        },
        update: {},
      });
      return;
    }

    const items = await tx.riderSettlementItem.findMany({
      where: { settlementId: item.settlement.id },
    });
    const activeItems = items.filter((entry: any) => entry.status !== 'reversed');
    const nextPayable = activeItems.reduce((sum: number, entry: any) => sum + Number(entry.payableAmount || 0) - Number(entry.reversalAmount || 0), 0);
    await tx.riderSettlement.update({
      where: { id: item.settlement.id },
      data: {
        orderCount: activeItems.length,
        payableAmount: Number(nextPayable.toFixed(2)),
      },
    });
  }

  private async markBizRefunded(tx: any, bizType: string, bizId: string, amount: number, isFullRefund = true, refundedAmount = amount, refundId?: string) {
    switch (bizType) {
      case 'order': {
        const order = await tx.order.findUnique({
          where: { id: bizId },
          include: { items: true },
        });
        await tx.order.update({
          where: { id: bizId },
          data: {
            ...(isFullRefund ? { status: 'REFUNDED' } : {}),
            refundStatus: isFullRefund ? 'refunded' : 'partial',
            refundAmount: refundedAmount,
          },
        });
        await this.adjustSettledShopOrderForRefund(tx, order, amount, isFullRefund, refundedAmount, refundId);
        if (isFullRefund && order?.status === 'PAID' && !order.merchantAcceptTime && order.stockReserved) {
          const released = await tx.order.updateMany({
            where: { id: bizId, stockReserved: true },
            data: { stockReserved: false },
          });
          if (released.count) await this.restoreShopOrderInventory(tx, order);
        }
        if (isFullRefund && order) await this.restoreShopOrderBenefits(tx, order);
        if (isFullRefund && order?.riderId) {
          const [activeErrands, activeShopOrders] = await Promise.all([
            tx.errandOrder.count({
              where: {
                riderId: order.riderId,
                status: { in: ['accepted', 'in_progress', 'arrived'] },
              },
            }),
            tx.order.count({
              where: { riderId: order.riderId, status: 'SHIPPED' },
            }),
          ]);
          if (!activeErrands && !activeShopOrders) {
            await tx.regionRider.updateMany({
              where: {
                userId: order.riderId,
                verifyStatus: 'approved',
                status: 'busy',
              },
              data: { status: 'online' },
            });
          }
        }
        await tx.orderLog.create({
          data: {
            orderId: bizId,
            action: 'REFUNDED',
            operatorType: 'system',
            remark: `${isFullRefund ? '全额' : '部分'}退款成功，累计金额: ${refundedAmount}`,
          },
        });
        break;
      }
      case 'mall_order':
        await tx.mallOrder.update({
          where: { id: bizId },
          data: { refundStatus: isFullRefund ? 'refunded' : 'refunding' },
        });
        await tx.mallRefund.updateMany({
          where: { orderId: bizId, status: 'processing' },
          data: { status: 'refunded', refundTime: new Date() },
        });
        break;
      case 'delivery_order':
        await tx.deliveryOrder.update({
          where: { id: bizId },
          data: {
            refundStatus: isFullRefund ? 'refunded' : 'refunding',
            refundAmount: refundedAmount,
          },
        });
        break;
      case 'errand_order':
        await tx.errandOrder.update({
          where: { id: bizId },
          data: {
            ...(isFullRefund ? { status: 'refunded' } : {}),
            refundStatus: isFullRefund ? 'refunded' : 'partial',
            refundAmount: refundedAmount,
          },
        });
        await this.adjustErrandRiderSettlementForRefund(tx, bizId, refundId, amount);
        break;
      case 'second_hand':
        const order = await tx.secondHandOrder.findUnique({
          where: { id: bizId },
        });
        await tx.secondHandOrder
          .update({
            where: { id: bizId },
            data: { status: 'refunded' },
          })
          .catch(() => null);
        if (order?.productId) {
          await tx.secondHand
            .update({
              where: { id: order.productId },
              data: {
                status: 'ON_SALE',
                auditReason: '二手订单已退款，商品自动恢复上架',
              },
            })
            .catch(() => null);
        }
        break;
      case 'membership_order':
        await tx.membershipOrder.update({
          where: { id: bizId },
          data: { status: 'refunded' },
        });
        await this.membershipService.revokeMembershipOrder(bizId, '退款成功', tx);
        break;
    }

    if (refundId) {
      const linkedRefund = await tx.paymentRefund.findUnique({
        where: { id: refundId },
        select: { sourceType: true, sourceId: true },
      });
      if (linkedRefund?.sourceType === 'order_appeal' && linkedRefund.sourceId) {
        const resolved = await tx.orderAppeal.updateMany({
          where: { id: linkedRefund.sourceId, status: 'processing' },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        if (resolved.count) {
          await tx.orderAppealEvent.create({
            data: {
              actionKey: `appeal-refund-success:${linkedRefund.sourceId}:${refundId}`,
              appealId: linkedRefund.sourceId,
              action: 'refund_succeeded',
              actorType: 'system',
              status: 'resolved',
              content: `退款记录 ${refundId} 已成功，申诉自动关闭`,
            },
          });
        }
      }
    }
  }

  private async updateBizRefundStatus(tx: any, bizType: string, bizId: string, amount: number) {
    switch (bizType) {
      case 'order':
        await tx.order.update({
          where: { id: bizId },
          data: { refundStatus: 'refunding', refundAmount: amount },
        });
        await tx.orderLog.create({
          data: {
            orderId: bizId,
            action: 'REFUNDING',
            operatorType: 'system',
            remark: `退款处理中，金额: ${amount}`,
          },
        });
        break;
      case 'mall_order':
        await tx.mallOrder.update({
          where: { id: bizId },
          data: { refundStatus: 'refunding' },
        });
        break;
      case 'delivery_order':
        await tx.deliveryOrder.update({
          where: { id: bizId },
          data: { refundStatus: 'refunding', refundAmount: amount },
        });
        break;
      case 'errand_order':
        await tx.errandOrder.update({
          where: { id: bizId },
          data: { refundStatus: 'refunding', refundAmount: amount },
        });
        break;
      case 'second_hand':
        await tx.secondHandOrder.update({
          where: { id: bizId },
          data: { status: 'refunding' },
        });
        break;
      case 'membership_order':
        await tx.membershipOrder.update({
          where: { id: bizId },
          data: { status: 'refunding' },
        });
        break;
    }
  }

  // ============ 微信支付 V3 签名与请求 ============

  private async wxPayRequest(method: string, path: string, body?: any, runtimeConfig?: WxPayRuntimeConfig): Promise<any> {
    const wxPayConfig = runtimeConfig || (await this.getWxPayConfig());
    const mchid = wxPayConfig.mchid;
    const serialNo = wxPayConfig.certSerialNo;
    const privateKey = wxPayConfig.merchantPrivateKey;

    const url = `${this.wxPayBaseUrl}${path}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = this.generateNonceStr(32);
    const bodyStr = body ? JSON.stringify(body) : '';

    // 构建签名串
    const signMessage = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;

    // 从文件读取私钥并签名（V3 规范：RSA-SHA256 加商户私钥）
    if (!mchid || !serialNo) {
      throw new BadRequestException('微信支付商户号或证书序列号未配置');
    }
    if (!privateKey) {
      throw new BadRequestException('微信支付商户私钥未配置：请在后台粘贴 KEY 私钥证书，或配置 WX_PAY_PRIVATE_KEY_PATH');
    }
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signMessage);
    const signature = sign.sign(privateKey, 'base64');

    const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          Accept: 'application/json',
        },
        data: bodyStr || undefined,
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw error; // 微信返回的错误
      }
      throw new Error(`微信支付请求失败: ${error.message}`);
    }
  }

  private verifyWxPaySign(body: string, signature: string, timestamp: string, nonce: string, wxPayConfig: WxPayRuntimeConfig): void {
    // 时间戳容差：微信回调时间戳误差在5分钟内有效
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      throw new BadRequestException(`回调时间戳偏差过大: ${timestamp}`);
    }

    // 构建验签串（V3 规范：TIMESTAMP\nNONCE\nBODY\n）
    const message = `${timestamp}\n${nonce}\n${body}\n`;

    // 使用微信支付平台证书/公钥 RSA-SHA256 验签
    const verifyKey = wxPayConfig.platformPublicKey || wxPayConfig.platformCert;
    if (!verifyKey) {
      throw new BadRequestException('微信支付平台证书或公钥未配置：请在后台粘贴微信支付平台证书/公钥');
    }
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    const isValid = verify.verify(verifyKey, signature, 'base64');
    if (!isValid) {
      throw new BadRequestException('微信支付回调签名验证失败');
    }
  }

  private generatePaySign(appid: string, timestamp: string, nonceStr: string, packageStr: string, wxPayConfig: WxPayRuntimeConfig): string {
    // V3 规范：appId\ntimeStamp\nnonceStr\npackage\n
    const message = `${appid}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;

    if (!wxPayConfig.merchantPrivateKey) {
      throw new BadRequestException('微信支付商户私钥未配置：请在后台粘贴 KEY 私钥证书');
    }
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    return sign.sign(wxPayConfig.merchantPrivateKey, 'base64');
  }

  /**
   * 解密微信支付 V3 回调 resource.ciphertext（AES-256-GCM）
   */
  private decryptResource(
    resource: {
      algorithm: string;
      ciphertext: string;
      associated_data: string;
      nonce: string;
      original_type: string;
    },
    wxPayConfig: WxPayRuntimeConfig,
  ): string {
    if (!resource || !resource.ciphertext) {
      throw new BadRequestException('回调 resource 数据缺失');
    }

    const apiV3Key = wxPayConfig.apiV3Key;
    if (!apiV3Key) {
      throw new BadRequestException('微信支付 APIv3 密钥未配置：请在后台填写');
    }

    // AES-256-GCM 解密
    const key = Buffer.from(apiV3Key, 'utf8');
    const ciphertext = Buffer.from(resource.ciphertext, 'base64');
    const nonce = Buffer.from(resource.nonce, 'utf8');
    const associatedData = Buffer.from(resource.associated_data || '', 'utf8');

    // ciphertext 最后 16 字节是 authTag
    const authTag = ciphertext.slice(ciphertext.length - 16);
    const encryptedData = ciphertext.slice(0, ciphertext.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(associatedData);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * 退款回调处理（验签+解密+幂等）
   */
  async handleRefundNotify(body: Buffer, headers: Record<string, string>) {
    const signature = headers['wechatpay-signature'];
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];

    if (!signature || !timestamp || !nonce) {
      this.logger.error('退款回调缺少签名参数');
      return { code: 'FAIL', message: '缺少签名参数' };
    }

    // 验证签名（失败直接 throw）
    const bodyStr = body.toString();
    const wxPayConfig = await this.getWxPayConfig();
    this.verifyWxPaySign(bodyStr, signature, timestamp, nonce, wxPayConfig);

    // 解析回调数据
    let notifyData: any;
    try {
      notifyData = JSON.parse(bodyStr);
    } catch {
      return { code: 'FAIL', message: 'JSON解析失败' };
    }

    // 解密 resource.ciphertext（AES-256-GCM）
    let resourcePlain: string;
    try {
      resourcePlain = this.decryptResource(notifyData.resource, wxPayConfig);
    } catch (e: any) {
      this.logger.error(`退款解密回调数据失败: ${e.message}`);
      return { code: 'FAIL', message: '解密失败' };
    }

    let resourceData: any;
    try {
      resourceData = JSON.parse(resourcePlain);
    } catch {
      return { code: 'FAIL', message: 'resource JSON 解析失败' };
    }

    const out_refund_no = resourceData.out_refund_no;
    const refund_id = resourceData.refund_id;
    const refund_status = resourceData.refund_status;

    if (!out_refund_no) {
      this.logger.error('退款回调缺少 out_refund_no');
      return { code: 'FAIL', message: '缺少退款单号' };
    }

    // 幂等处理：使用 Redis 分布式锁防止重复处理
    const lockKey = `wxpay_refund_notify_lock:${out_refund_no}`;
    const locked = await this.redis.getLock(lockKey, 30);
    if (!locked) {
      this.logger.warn(`重复退款回调: ${out_refund_no}`);
      return { code: 'SUCCESS', message: 'OK' };
    }

    try {
      if (refund_status === 'SUCCESS') {
        await this.handleRefundSuccess(out_refund_no, refund_id);
      } else if (['ABNORMAL', 'CLOSED'].includes(refund_status)) {
        await this.handleRefundFailure(out_refund_no, refund_status);
      } else {
        this.logger.warn(`退款回调非终态状态: ${out_refund_no} ${refund_status}`);
      }
    } finally {
      await this.redis.releaseLock(lockKey);
    }

    return { code: 'SUCCESS', message: 'OK' };
  }

  private getMembershipRefundTarget(bizType?: string | null) {
    const type = String(bizType || '').trim();
    const map: Record<string, { targetType: string; subsidyOrderType: string }> = {
      order: { targetType: 'shop_order', subsidyOrderType: 'order' },
      shop_order: { targetType: 'shop_order', subsidyOrderType: 'order' },
      delivery_order: { targetType: 'shop_order', subsidyOrderType: 'order' },
      mall_order: { targetType: 'mall_order', subsidyOrderType: 'mall_order' },
      errand_order: {
        targetType: 'errand_order',
        subsidyOrderType: 'errand_order',
      },
      activity_order: {
        targetType: 'activity_order',
        subsidyOrderType: 'activity_order',
      },
    };
    return map[type] || null;
  }

  private async handleRefundSuccess(outRefundNo: string, wxRefundId: string) {
    const refundRecord = await this.prisma.paymentRefund.findFirst({
      where: { refundNo: outRefundNo },
    });

    if (!refundRecord) {
      this.logger.error(`退款记录不存在: ${outRefundNo}`);
      return;
    }

    if (refundRecord.status === 'success') {
      this.logger.warn(`退款记录已处理: ${outRefundNo}`);
      return;
    }

    let completedPayment: any = null;
    await this.prisma.$transaction(async (tx) => {
      // AUD-P1-059: 条件更新 - 只有可结算的中间态才推进，防止终态被回调逆转。
      const updated = await tx.paymentRefund.updateMany({
        where: {
          id: refundRecord.id,
          status: { in: ['pending', 'processing'] },
        },
        data: {
          wxRefundId,
          status: 'success',
          refundedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        this.logger.warn(`退款回调幂等跳过: ${outRefundNo}`);
        return;
      }

      // 更新支付单
      const payment = await tx.paymentOrder.findUnique({
        where: { id: refundRecord.paymentId },
      });
      if (payment) {
        completedPayment = payment;
        const refundAmount = Number(refundRecord.amount);
        const newRefundedAmount = Number(payment.refundedAmount) + refundAmount;
        const isFullRefund = newRefundedAmount >= Number(payment.amount);
        await tx.paymentOrder.update({
          where: { id: payment.id },
          data: {
            refundedAmount: newRefundedAmount,
            status: isFullRefund ? 'refunded' : 'refunding',
          },
        });

        // AUD-P1-060: 退款成功回写业务终态
        await this.markBizRefunded(tx, payment.bizType, payment.bizId, refundAmount, isFullRefund, newRefundedAmount, refundRecord.id);

        await tx.platformLedger.create({
          data: {
            orderNo: refundRecord.refundNo,
            orderType: payment.bizType,
            amount: refundAmount,
            type: 'refund',
            channel: 'wx_pay',
            status: 'completed',
            description: `微信退款回调: ${refundRecord.reason || ''}`,
          },
        });

        if (isFullRefund && payment.bizType !== 'order') {
          const membershipTarget = this.getMembershipRefundTarget(payment.bizType);
          if (membershipTarget) {
            await this.membershipService.restoreBenefitUsagesForTarget(membershipTarget.targetType, payment.bizId, tx);
            await tx.subsidyLedger
              .updateMany({
                where: {
                  sourceType: 'membership',
                  orderType: membershipTarget.subsidyOrderType,
                  orderId: payment.bizId,
                },
                data: { status: 'cancelled' },
              })
              .catch(() => undefined);
          }
        }
      }
    });

    if (completedPayment) await this.notifyShopRefundSuccess(completedPayment, Number(refundRecord.amount), refundRecord.reason || undefined);

    this.logger.log(`退款成功: ${outRefundNo}, wxRefundId=${wxRefundId}`);
  }

  private async notifyShopRefundSuccess(payment: any, amount: number, reason = '') {
    if (payment?.bizType === 'errand_order') {
      const order = await this.getErrandRefundNoticeOrder(payment.bizId);
      const partial = order?.refundStatus === 'partial';
      const notices: Promise<unknown>[] = [];
      if (payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: payment.userId,
            type: 'order',
            scene: 'errand_order_refund_success',
            title: partial ? '跑腿订单部分退款成功' : '跑腿退款成功',
            content: partial ? `跑腿订单已部分退款 ¥${Number(amount).toFixed(2)}，其余服务将按当前进度继续处理。` : `跑腿订单退款 ¥${Number(amount).toFixed(2)} 已原路退回，请留意支付账户。`,
            data: {
              orderId: payment.bizId,
              paymentNo: payment.paymentNo,
              refundAmount: Number(amount),
            },
            linkType: 'page',
            linkValue: `/pagesA/order/errand-detail/errand-detail?id=${payment.bizId}`,
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      if (order?.riderId && order.riderId !== payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.riderId,
            regionId: order.regionId || undefined,
            type: 'delivery',
            scene: 'errand_order_refund_rider_success',
            title: partial ? '跑腿订单部分退款完成' : '跑腿订单已退款',
            content: partial ? '订单部分退款已完成，请按当前进度继续履约。' : '订单已退款，配送任务已关闭，无需继续处理。',
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
              refundAmount: Number(amount),
              refundStatus: order.refundStatus,
            },
            linkType: 'page',
            linkValue: '/pagesA/Grab/Grab',
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      await Promise.allSettled(notices);
      return;
    }
    if (payment?.bizType !== 'order') return;
    const merchantRejected = String(reason).startsWith('商家拒单：');
    const order = await this.prisma.order
      .findUnique({
        where: { id: payment.bizId },
        select: {
          id: true,
          orderNo: true,
          merchantId: true,
          riderId: true,
          refundStatus: true,
          merchant: { select: { userId: true, regionId: true } },
        },
      })
      .catch(() => null);
    const notices: Promise<unknown>[] = [];
    if (payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: payment.userId,
          type: 'order',
          scene: 'shop_order_refund_success',
          title: merchantRejected ? '商家无法接单，退款成功' : '外卖退款成功',
          content: merchantRejected ? `商家无法接单，¥${Number(amount).toFixed(2)} 已原路退回，请留意支付账户。` : `订单退款 ¥${Number(amount).toFixed(2)} 已原路退回，请留意支付账户。`,
          data: {
            orderId: payment.bizId,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
            merchantRejected,
          },
          linkType: 'page',
          linkValue: `/pagesA/order/order-detail/order-detail?id=${payment.bizId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.merchant?.userId && order.merchant.userId !== payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.merchant.userId,
          regionId: order.merchant.regionId || undefined,
          type: 'order',
          scene: 'shop_order_refund_merchant_notice',
          title: '外卖订单退款成功',
          content: `订单 ${order.orderNo || order.id} 已退款 ¥${Number(amount).toFixed(2)}。如该订单已结算，财务将自动冲减或生成退款调整。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
            merchantRejected,
          },
          linkType: 'page',
          linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.riderId && order.riderId !== payment.userId) {
      const refunded = order.refundStatus === 'refunded';
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.riderId,
          regionId: order.merchant?.regionId || undefined,
          type: 'delivery',
          scene: 'shop_order_refund_rider_success',
          title: refunded ? '配送订单已退款' : '配送订单部分退款成功',
          content: refunded ? '订单已退款，配送任务已关闭，无需继续取餐或送达。' : '订单部分退款已完成，请按当前配送流程继续履约。',
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
            refundStatus: order.refundStatus,
          },
          linkType: 'page',
          linkValue: '/pagesA/Grab/Grab',
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    await Promise.allSettled(notices);
  }

  private async notifyShopRefundProcessing(payment: any, amount: number, reason = '', operatorId?: string) {
    if (payment?.bizType === 'errand_order') {
      const order = await this.getErrandRefundNoticeOrder(payment.bizId);
      const notices: Promise<unknown>[] = [];
      if (payment.userId && payment.userId !== operatorId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: payment.userId,
            type: 'order',
            scene: 'errand_order_refund_processing',
            title: '跑腿退款处理中',
            content: `退款 ¥${Number(amount).toFixed(2)} 正在原路退回，订单已暂停处理。`,
            data: {
              orderId: payment.bizId,
              paymentNo: payment.paymentNo,
              refundAmount: Number(amount),
            },
            linkType: 'page',
            linkValue: `/pagesA/order/errand-detail/errand-detail?id=${payment.bizId}`,
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      if (order?.riderId && order.riderId !== payment.userId && order.riderId !== operatorId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.riderId,
            regionId: order.regionId || undefined,
            type: 'delivery',
            scene: 'errand_order_refund_rider_processing',
            title: '跑腿订单退款处理中',
            content: '订单退款处理中，请暂停取件或送达，等待退款结果。',
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
              refundAmount: Number(amount),
            },
            linkType: 'page',
            linkValue: '/pagesA/Grab/Grab',
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      await Promise.allSettled(notices);
      return;
    }
    if (payment?.bizType !== 'order') return;
    const merchantRejected = String(reason).startsWith('商家拒单：');
    const order = await this.prisma.order
      .findUnique({
        where: { id: payment.bizId },
        select: {
          id: true,
          orderNo: true,
          merchantId: true,
          riderId: true,
          merchant: { select: { userId: true, regionId: true } },
        },
      })
      .catch(() => null);
    const notices: Promise<unknown>[] = [];
    if (payment.userId && payment.userId !== operatorId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: payment.userId,
          type: 'order',
          scene: 'shop_order_refund_processing',
          title: merchantRejected ? '商家无法接单，退款处理中' : '外卖退款处理中',
          content: `退款 ¥${Number(amount).toFixed(2)} 正在原路退回，订单已暂停处理。`,
          data: {
            orderId: payment.bizId,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
            merchantRejected,
          },
          linkType: 'page',
          linkValue: `/pagesA/order/order-detail/order-detail?id=${payment.bizId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.merchant?.userId && order.merchant.userId !== payment.userId && order.merchant.userId !== operatorId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.merchant.userId,
          regionId: order.merchant.regionId || undefined,
          type: 'order',
          scene: 'shop_order_refund_processing',
          title: '外卖订单退款处理中',
          content: `订单 ${order.orderNo || order.id} 正在退款，已暂停履约，请勿继续出餐或配送。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
            merchantRejected,
          },
          linkType: 'page',
          linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.riderId && order.riderId !== payment.userId && order.riderId !== operatorId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.riderId,
          regionId: order.merchant?.regionId || undefined,
          type: 'delivery',
          scene: 'shop_order_refund_rider_processing',
          title: '配送订单退款处理中',
          content: '订单退款处理中，请暂停取货或送达，等待退款结果。',
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
            refundAmount: Number(amount),
          },
          linkType: 'page',
          linkValue: '/pagesA/Grab/Grab',
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    await Promise.allSettled(notices);
  }

  private async notifyShopRefundFailure(payment: any) {
    if (payment?.bizType === 'errand_order') {
      const order = await this.getErrandRefundNoticeOrder(payment.bizId);
      const notices: Promise<unknown>[] = [];
      if (payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: payment.userId,
            type: 'order',
            scene: 'errand_order_refund_failed',
            title: '跑腿退款未完成',
            content: '退款未完成，订单已恢复可处理状态。请刷新后重试，或联系客服协助处理。',
            data: { orderId: payment.bizId, paymentNo: payment.paymentNo },
            linkType: 'page',
            linkValue: `/pagesA/order/errand-detail/errand-detail?id=${payment.bizId}`,
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      if (order?.riderId && order.riderId !== payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.riderId,
            regionId: order.regionId || undefined,
            type: 'delivery',
            scene: 'errand_order_refund_rider_failed',
            title: '跑腿订单恢复履约',
            content: '退款未完成，订单已恢复原状态，请刷新后按原流程继续处理。',
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
            },
            linkType: 'page',
            linkValue: '/pagesA/Grab/Grab',
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      await Promise.allSettled(notices);
      return;
    }
    if (payment?.bizType !== 'order') return;
    const order = await this.prisma.order
      .findUnique({
        where: { id: payment.bizId },
        select: {
          id: true,
          orderNo: true,
          merchantId: true,
          riderId: true,
          merchant: { select: { userId: true, regionId: true } },
        },
      })
      .catch(() => null);
    const notices: Promise<unknown>[] = [];
    if (payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: payment.userId,
          type: 'order',
          scene: 'shop_order_refund_failed',
          title: '外卖退款未完成',
          content: '退款未完成，订单已恢复可处理状态。请刷新后重试，或联系客服协助处理。',
          data: { orderId: payment.bizId, paymentNo: payment.paymentNo },
          linkType: 'page',
          linkValue: `/pagesA/order/order-detail/order-detail?id=${payment.bizId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.merchant?.userId && order.merchant.userId !== payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.merchant.userId,
          regionId: order.merchant.regionId || undefined,
          type: 'order',
          scene: 'shop_order_refund_merchant_failed',
          title: '外卖退款未完成',
          content: `订单 ${order.orderNo || order.id} 的退款未完成，订单已恢复原状态，本次不会产生退款调整。`,
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
          },
          linkType: 'page',
          linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (order?.riderId && order.riderId !== payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: order.riderId,
          regionId: order.merchant?.regionId || undefined,
          type: 'delivery',
          scene: 'shop_order_refund_rider_failed',
          title: '配送订单恢复履约',
          content: '退款未完成，订单已恢复配送状态，请刷新后按原流程继续处理。',
          data: {
            orderId: order.id,
            orderNo: order.orderNo,
            paymentNo: payment.paymentNo,
          },
          linkType: 'page',
          linkValue: '/pagesA/Grab/Grab',
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    await Promise.allSettled(notices);
  }

  private async handleRefundFailure(outRefundNo: string, refundStatus: string) {
    const refund = await this.prisma.paymentRefund.findFirst({
      where: { refundNo: outRefundNo },
      include: { payment: true },
    });
    const result = await this.prisma.paymentRefund.updateMany({
      where: {
        refundNo: outRefundNo,
        status: { in: ['pending', 'processing'] },
      },
      data: { status: 'failed', failReason: `微信退款${refundStatus}` },
    });
    if (!result.count) return;
    this.logger.warn(`退款失败: ${outRefundNo}, status=${refundStatus}`);
    if (!refund?.payment || !['order', 'errand_order'].includes(refund.payment.bizType)) return;
    const processing = await this.prisma.paymentRefund.count({
      where: {
        paymentId: refund.paymentId,
        status: { in: ['pending', 'processing'] },
      },
    });
    if (processing) return;
    const refundedAmount = Number(refund.payment.refundedAmount || 0);
    if (refund.payment.bizType === 'order') {
      await this.prisma.order.update({
        where: { id: refund.payment.bizId },
        data: {
          refundStatus: refundedAmount > 0 ? 'partial' : 'none',
          refundAmount: refundedAmount || null,
        },
      });
      await this.prisma.orderLog.create({
        data: {
          orderId: refund.payment.bizId,
          action: 'REFUND_FAILED',
          operatorType: 'system',
          remark: `退款失败（${refundStatus}），订单已恢复可处理状态`,
        },
      });
      await this.notifyShopRefundFailure(refund.payment);
      return;
    }
    await this.prisma.errandOrder.update({
      where: { id: refund.payment.bizId },
      data: {
        refundStatus: refundedAmount > 0 ? 'partial' : 'none',
        refundAmount: refundedAmount || null,
      },
    });
    await this.notifyShopRefundFailure(refund.payment);
  }

  /** 后台拒绝待审核退款时，也必须把业务单从“退款中”恢复。 */
  async rejectRefundById(refundId: string, reason = '', operatorId?: string) {
    return this.runWithLock(
      `payment:refund_reject:${refundId}`,
      '退款审核正在处理中',
      async () => {
        const refund = await this.prisma.paymentRefund.findUnique({
          where: { id: refundId },
          include: { payment: true },
        });
        if (!refund) throw new NotFoundException('退款记录不存在');
        if (refund.status !== 'pending') throw new BadRequestException(`退款状态 ${refund.status} 不支持拒绝`);
        const rejected = await this.prisma.paymentRefund.updateMany({
          where: { id: refundId, status: 'pending' },
          data: { status: 'failed', failReason: reason || '退款申请未通过' },
        });
        if (!rejected.count) throw new BadRequestException('退款状态已变化，请刷新后重试');

        const payment = refund.payment;
        if (!payment || !['order', 'errand_order'].includes(payment.bizType)) return { success: true };
        const processing = await this.prisma.paymentRefund.count({
          where: {
            paymentId: refund.paymentId,
            status: { in: ['pending', 'processing'] },
          },
        });
        if (processing) return { success: true };
        const refundedAmount = Number(payment.refundedAmount || 0);
        const data = {
          refundStatus: refundedAmount > 0 ? 'partial' : 'none',
          refundAmount: refundedAmount || null,
        };
        if (payment.bizType === 'order') {
          await this.prisma.order.update({
            where: { id: payment.bizId },
            data,
          });
          await this.prisma.orderLog.create({
            data: {
              orderId: payment.bizId,
              action: 'REFUND_REJECTED',
              operatorType: 'admin',
              operatorId: operatorId || null,
              remark: reason || '退款申请未通过，订单已恢复可处理状态',
            },
          });
        } else {
          await this.prisma.errandOrder.update({
            where: { id: payment.bizId },
            data,
          });
        }
        await this.notifyShopRefundRejected(payment, reason);
        return { success: true };
      },
      60,
    );
  }

  private async notifyShopRefundRejected(payment: any, reason = '') {
    const isErrand = payment.bizType === 'errand_order';
    const suffix = String(reason || '').trim() ? `：${String(reason).trim()}` : '';
    const notices: Promise<unknown>[] = [];
    if (payment.userId) {
      notices.push(
        this.notifyService.createAndDispatch({
          userId: payment.userId,
          type: 'order',
          scene: isErrand ? 'errand_order_refund_rejected' : 'shop_order_refund_rejected',
          title: '退款申请未通过',
          content: `退款申请未通过${suffix}。订单已恢复可处理状态。`,
          data: { orderId: payment.bizId, paymentNo: payment.paymentNo },
          linkType: 'page',
          linkValue: isErrand ? `/pagesA/order/errand-detail/errand-detail?id=${payment.bizId}` : `/pagesA/order/order-detail/order-detail?id=${payment.bizId}`,
          channelMask: { inApp: true, websocket: true },
        }),
      );
    }
    if (isErrand) {
      const order = await this.getErrandRefundNoticeOrder(payment.bizId);
      if (order?.riderId && order.riderId !== payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.riderId,
            regionId: order.regionId || undefined,
            type: 'delivery',
            scene: 'errand_order_refund_rider_rejected',
            title: '跑腿订单恢复履约',
            content: '退款申请未通过，订单已恢复原状态，请刷新后按原流程继续处理。',
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
            },
            linkType: 'page',
            linkValue: '/pagesA/Grab/Grab',
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
    } else {
      const order = await this.prisma.order
        .findUnique({
          where: { id: payment.bizId },
          select: {
            id: true,
            orderNo: true,
            merchantId: true,
            riderId: true,
            merchant: { select: { userId: true, regionId: true } },
          },
        })
        .catch(() => null);
      if (order?.merchant?.userId && order.merchant.userId !== payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.merchant.userId,
            regionId: order.merchant.regionId || undefined,
            type: 'order',
            scene: 'shop_order_refund_merchant_rejected',
            title: '外卖退款申请未通过',
            content: `订单 ${order.orderNo || order.id} 已恢复履约，请继续处理。`,
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
            },
            linkType: 'page',
            linkValue: `/pagesA/MerchantManagement/Order?merchant_id=${order.merchantId}`,
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
      if (order?.riderId && order.riderId !== payment.userId) {
        notices.push(
          this.notifyService.createAndDispatch({
            userId: order.riderId,
            regionId: order.merchant?.regionId || undefined,
            type: 'delivery',
            scene: 'shop_order_refund_rider_rejected',
            title: '配送订单恢复履约',
            content: '退款申请未通过，订单已恢复配送状态，请刷新后按原流程继续处理。',
            data: {
              orderId: order.id,
              orderNo: order.orderNo,
              paymentNo: payment.paymentNo,
            },
            linkType: 'page',
            linkValue: '/pagesA/Grab/Grab',
            channelMask: { inApp: true, websocket: true },
          }),
        );
      }
    }
    await Promise.allSettled(notices);
  }

  private async getErrandRefundNoticeOrder(orderId: string) {
    try {
      return await this.prisma.errandOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNo: true,
          riderId: true,
          regionId: true,
          refundStatus: true,
        },
      });
    } catch {
      return null;
    }
  }

  /**
   * AUD-P1-061: 后台人工完成退款 — 复用统一退款成功事务
   * 不再允许绕过状态机直接改 PaymentRefund.status='success'
   */
  async completeRefundById(refundId: string, operatorId?: string, transferNo?: string) {
    return this.runWithLock(
      `payment:refund_complete:${refundId}`,
      '退款完成正在处理中',
      async () => {
        const refundRecord = await this.prisma.paymentRefund.findUnique({
          where: { id: refundId },
        });

        if (!refundRecord) throw new NotFoundException('退款记录不存在');
        if (refundRecord.status === 'success') {
          return {
            success: true,
            message: '退款已完成，无需重复操作',
            refundNo: refundRecord.refundNo,
          };
        }
        if (refundRecord.status !== 'processing') {
          throw new BadRequestException(`退款状态 ${refundRecord.status} 不支持人工完成`);
        }

        let completedPayment: any = null;
        await this.prisma.$transaction(async (tx) => {
          // 条件更新 — 防止并发重复
          const updateData: any = {
            status: 'success',
            refundedAt: new Date(),
          };
          // PaymentRefund 无 remark 字段，凭证号记入 reason
          if (transferNo) {
            updateData.reason = `人工完成，凭证: ${transferNo}`;
          }
          const updated = await tx.paymentRefund.updateMany({
            where: { id: refundId, status: 'processing' },
            data: updateData,
          });
          if (updated.count === 0) return;

          const payment = await tx.paymentOrder.findUnique({
            where: { id: refundRecord.paymentId },
          });
          if (!payment) return;
          completedPayment = payment;

          const refundAmount = Number(refundRecord.amount);
          const newRefundedAmount = Number(payment.refundedAmount) + refundAmount;
          const isFullRefund = newRefundedAmount >= Number(payment.amount);

          await tx.paymentOrder.update({
            where: { id: payment.id },
            data: {
              refundedAmount: newRefundedAmount,
              status: isFullRefund ? 'refunded' : 'refunding',
            },
          });

          // 平台退款流水
          await tx.platformLedger.create({
            data: {
              orderNo: refundRecord.refundNo,
              orderType: payment.bizType,
              amount: refundAmount,
              type: 'refund',
              channel: 'admin_manual',
              status: 'completed',
              description: `人工完成退款${transferNo ? `，凭证: ${transferNo}` : ''}`,
            },
          });

          // AUD-P1-060: 业务终态回写
          await this.markBizRefunded(tx, payment.bizType, payment.bizId, refundAmount, isFullRefund, newRefundedAmount, refundRecord.id);

          // 会员权益恢复
          if (isFullRefund && payment.bizType !== 'order') {
            const membershipTarget = this.getMembershipRefundTarget(payment.bizType);
            if (membershipTarget) {
              await this.membershipService.restoreBenefitUsagesForTarget(membershipTarget.targetType, payment.bizId, tx);
              await tx.subsidyLedger
                .updateMany({
                  where: {
                    sourceType: 'membership',
                    orderType: membershipTarget.subsidyOrderType,
                    orderId: payment.bizId,
                  },
                  data: { status: 'cancelled' },
                })
                .catch(() => undefined);
            }
          }
        });

        if (operatorId) {
          await this.prisma.adminOperationLog
            .create({
              data: {
                accountId: operatorId,
                action: 'COMPLETE_REFUND',
                module: 'refund',
                targetId: refundId,
                detail: { transferNo },
              },
            })
            .catch(() => undefined);
        }

        if (completedPayment) await this.notifyShopRefundSuccess(completedPayment, Number(refundRecord.amount), refundRecord.reason || undefined);

        return {
          success: true,
          refundNo: refundRecord.refundNo,
          message: '退款已人工完成',
        };
      },
      60,
    );
  }

  /**
   * AUD-P1-063: 对已存在的 pending PaymentRefund 执行微信退款。
   * 复用已有 refundNo 作为 out_refund_no，不创建新记录。
   */
  async executeRefund(refundId: string, operatorId?: string) {
    return this.runWithLock(
      `payment:refund_exec:${refundId}`,
      '退款正在处理中',
      async () => {
        const refundRecord = await this.prisma.paymentRefund.findUnique({
          where: { id: refundId },
          include: { payment: true },
        });
        if (!refundRecord) throw new NotFoundException('退款记录不存在');
        if (refundRecord.status !== 'pending') {
          throw new BadRequestException(`退款状态 ${refundRecord.status} 不支持执行`);
        }

        const payment = refundRecord.payment;
        if (!payment || !['paid', 'refunding'].includes(payment.status)) {
          throw new BadRequestException('支付单状态不可退款');
        }

        const amount = Number(refundRecord.amount);

        try {
          const wxPayConfig = await this.getWxPayConfig();
          const params: Record<string, any> = {
            transaction_id: payment.wxTransId,
            out_refund_no: refundRecord.refundNo,
            amount: {
              refund: Math.round(amount * 100),
              total: Math.round(Number(payment.amount) * 100),
              currency: 'CNY',
            },
            reason: refundRecord.reason || '管理员审核退款',
          };
          if (wxPayConfig.refundNotifyUrl) {
            params.notify_url = wxPayConfig.refundNotifyUrl;
          }

          const wxRefund = await this.wxPayRequest('POST', '/v3/refund/domestic/refunds', params, wxPayConfig);
          const isWxSuccess = wxRefund.status === 'SUCCESS';

          let completedPayment: any = null;
          await this.prisma.$transaction(async (tx) => {
            const updated = await tx.paymentRefund.updateMany({
              where: { id: refundId, status: 'pending' },
              data: {
                wxRefundId: wxRefund.refund_id,
                status: isWxSuccess ? 'success' : 'processing',
                refundedAt: isWxSuccess ? new Date() : null,
              },
            });
            if (updated.count === 0) return;

            if (isWxSuccess) {
              completedPayment = payment;
              const newRefundedAmount = Number(payment.refundedAmount) + amount;
              await tx.paymentOrder.update({
                where: { id: payment.id },
                data: {
                  refundedAmount: newRefundedAmount,
                  status: newRefundedAmount >= Number(payment.amount) ? 'refunded' : 'refunding',
                },
              });
              await this.markBizRefunded(tx, payment.bizType, payment.bizId, amount, newRefundedAmount >= Number(payment.amount), newRefundedAmount, refundRecord.id);
              await tx.platformLedger.create({
                data: {
                  orderNo: refundRecord.refundNo,
                  orderType: payment.bizType,
                  amount,
                  type: 'refund',
                  channel: 'wx_pay',
                  status: 'completed',
                  description: `管理员审核退款: ${refundRecord.reason || ''}`,
                },
              });
            } else {
              await this.updateBizRefunding(tx, payment.bizType, payment.bizId, amount);
            }
          });

          if (completedPayment) await this.notifyShopRefundSuccess(completedPayment, amount, refundRecord.reason || undefined);

          return {
            success: true,
            refundNo: refundRecord.refundNo,
            status: isWxSuccess ? 'success' : 'processing',
          };
        } catch (error: any) {
          this.logger.error(`执行退款失败: ${error.message}`);
          await this.handleRefundFailure(refundRecord.refundNo, 'ABNORMAL').catch(() => undefined);
          throw new BadRequestException(`退款失败: ${error.response?.data?.message || error.message}`);
        }
      },
      60,
    );
  }

  private generateNonceStr(length = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let str = '';
    for (let i = 0; i < length; i++) {
      str += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return str;
  }

  private formatRfc3339(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, '+08:00');
  }
}
