import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly wxPayBaseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============ 微信支付 V3 下单 ============

  async wxUnifiedOrder(dto: {
    bizType: string;
    bizId: string;
    orderNo: string;
    amount: number;
    description: string;
    openid: string;
    userId?: string;
  }) {
    const mchid = this.config.get('WX_PAY_MCHID');
    const appid = this.config.get('WX_MINI_APPID');
    const notifyUrl = this.config.get('WX_PAY_NOTIFY_URL');

    if (!mchid || !appid) {
      throw new BadRequestException('微信支付未配置');
    }

    // 幂等检查：如果已有支付单且已支付，直接返回
    const existing = await this.prisma.paymentOrder.findFirst({
      where: { bizType: dto.bizType, bizId: dto.bizId, status: 'paid' },
    });
    if (existing) {
      throw new BadRequestException('该订单已支付');
    }

    // 查找或创建支付单
    let paymentOrder = await this.prisma.paymentOrder.findFirst({
      where: { bizType: dto.bizType, bizId: dto.bizId, status: { not: 'paid' } },
    });

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
      time_expire: this.formatRfc3339(new Date(Date.now() + 15 * 60 * 1000)),
    };

    try {
      // 使用 wechatpay-axios-plugin 或直接 HTTP 调用
      const url = `/v3/pay/transactions/jsapi`;
      const response = await this.wxPayRequest('POST', url, params);

      const prepayId = response.prepay_id;

      // 更新支付单
      await this.prisma.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { wxPrepayId: prepayId, status: 'paying' },
      });

      // 生成小程序调起支付参数
      const paySign = this.generatePaySign(appid, prepayId);

      return {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: this.generateNonceStr(32),
        package: `prepay_id=${prepayId}`,
        signType: 'RSA',
        paySign,
        paymentNo,
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
    this.verifyWxPaySign(bodyStr, signature, timestamp, nonce);

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
      resourcePlain = this.decryptResource(notifyData.resource);
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
        this.logger.warn(`支付回调非成功状态: ${out_trade_no} ${trade_state}`);
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

    if (payment.status === 'paid') {
      this.logger.warn(`支付单已处理: ${paymentNo}`);
      return;
    }

    // 使用事务更新支付单和业务订单
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
      await this.updateBizOrder(tx, payment);
    });

    this.logger.log(`支付成功: ${paymentNo}, bizType=${payment.bizType}, bizId=${payment.bizId}`);
  }

  private async updateBizOrder(tx: any, payment: any) {
    switch (payment.bizType) {
      case 'order':
        await tx.order.update({
          where: { id: payment.bizId },
          data: { status: 'PAID', payChannel: 'WX_PAY', payTime: new Date() },
        });
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
        await tx.mallOrder.update({
          where: { id: payment.bizId },
          data: { status: 'paid', payChannel: 'wx_pay', payTime: new Date() },
        });
        break;

      case 'delivery_order':
        await tx.deliveryOrder.update({
          where: { id: payment.bizId },
          data: { status: 'PAID', payChannel: 'WX_PAY', payTime: new Date() },
        });
        break;

      case 'errand_order':
        await tx.errandOrder.update({
          where: { id: payment.bizId },
          data: { status: 'paid', payChannel: 'wx_pay', payTime: new Date() },
        });
        break;

      case 'recharge':
        const recharge = await tx.recharge.findUnique({ where: { id: payment.bizId } });
        if (recharge) {
          await tx.recharge.update({
            where: { id: payment.bizId },
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
              channel: 'WX_PAY',
              orderNo: recharge.orderNo,
              description: '余额充值',
              status: 'SUCCESS',
            },
          });
        }
        break;

      case 'topup':
        const topup = await tx.topupOrder.findUnique({ where: { id: payment.bizId } });
        if (topup) {
          await tx.topupOrder.update({
            where: { id: payment.bizId },
            data: { status: 'success', payTime: new Date() },
          });
          const totalAmount = Number(topup.amount) + Number(topup.giveAmount || 0);
          await tx.wallet.upsert({
            where: { userId: topup.userId },
            create: { userId: topup.userId, balance: totalAmount, totalIn: totalAmount },
            update: {
              balance: { increment: totalAmount },
              totalIn: { increment: totalAmount },
            },
          });
        }
        break;

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
  }

  // ============ 查询支付状态 ============

  async queryPayment(paymentNo: string) {
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { paymentNo },
    });
    if (!payment) throw new BadRequestException('支付单不存在');

    // 尝试从微信查询
    try {
      const url = `/v3/pay/transactions/out-trade-no/${paymentNo}?mchid=${this.config.get('WX_PAY_MCHID')}`;
      const wxData = await this.wxPayRequest('GET', url);
      if (wxData.trade_state === 'SUCCESS' && payment.status !== 'paid') {
        await this.handlePaymentSuccess(paymentNo, wxData.transaction_id);
      }
    } catch (e: any) {
      this.logger.warn(`查询微信支付状态失败: ${e.message}`);
    }

    // 同时查询关联的业务订单
    let bizOrder: any = null;
    switch (payment.bizType) {
      case 'order':
        bizOrder = await this.prisma.order.findUnique({ where: { id: payment.bizId } });
        break;
      case 'mall_order':
        bizOrder = await this.prisma.mallOrder.findUnique({ where: { id: payment.bizId } });
        break;
      case 'delivery_order':
        bizOrder = await this.prisma.deliveryOrder.findUnique({ where: { id: payment.bizId } });
        break;
      case 'errand_order':
        bizOrder = await this.prisma.errandOrder.findUnique({ where: { id: payment.bizId } });
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

  // ============ 退款 ============

  async refund(dto: {
    bizType: string;
    bizId: string;
    amount: number;
    reason: string;
    operatorId?: string;
  }) {
    // 查找支付单
    const payment = await this.prisma.paymentOrder.findFirst({
      where: { bizType: dto.bizType, bizId: dto.bizId, status: { in: ['paid', 'refunding'] } },
    });
    if (!payment) throw new BadRequestException('未找到可退款的支付单');

    // 计算可退金额
    const refundableAmount = Number(payment.amount) - Number(payment.refundedAmount);
    if (dto.amount > refundableAmount) {
      throw new BadRequestException(`退款金额超过可退金额(${refundableAmount})`);
    }

    const refundNo = `REF${Date.now()}${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;

    // 创建退款记录
    const refundRecord = await this.prisma.paymentRefund.create({
      data: {
        refundNo,
        paymentId: payment.id,
        amount: dto.amount,
        reason: dto.reason,
        status: 'pending',
      },
    });

    // 尝试调用微信退款 API
    try {
      const url = `/v3/refund/domestic/refunds`;
      const params = {
        transaction_id: payment.wxTransId,
        out_refund_no: refundNo,
        amount: {
          refund: Math.round(dto.amount * 100),
          total: Math.round(Number(payment.amount) * 100),
          currency: 'CNY',
        },
        reason: dto.reason || '用户退款',
      };

      const wxRefund = await this.wxPayRequest('POST', url, params);

      await this.prisma.$transaction(async (tx) => {
        // 更新退款记录
        await tx.paymentRefund.update({
          where: { id: refundRecord.id },
          data: {
            wxRefundId: wxRefund.refund_id,
            status: wxRefund.status === 'SUCCESS' ? 'success' : 'processing',
            refundedAt: wxRefund.status === 'SUCCESS' ? new Date() : null,
          },
        });

        // 更新支付单
        const newRefundedAmount = Number(payment.refundedAmount) + dto.amount;
        await tx.paymentOrder.update({
          where: { id: payment.id },
          data: {
            refundedAmount: newRefundedAmount,
            status: newRefundedAmount >= Number(payment.amount) ? 'refunded' : 'refunding',
          },
        });

        // 更新业务订单退款状态
        await this.updateBizRefundStatus(tx, dto.bizType, dto.bizId, dto.amount);

        // 记录平台退款流水
        await tx.platformLedger.create({
          data: {
            orderNo: refundNo,
            orderType: payment.bizType,
            amount: dto.amount,
            type: 'refund',
            channel: 'wx_pay',
            status: 'completed',
            description: `退款: ${dto.reason || ''}`,
          },
        });
      });

      return { success: true, refundNo, status: 'success' };
    } catch (error: any) {
      this.logger.error(`退款失败: ${error.message}`);

      // 标记退款失败
      await this.prisma.paymentRefund.update({
        where: { id: refundRecord.id },
        data: { status: 'failed', failReason: error.response?.data?.message || error.message },
      });

      throw new BadRequestException(`退款失败: ${error.response?.data?.message || error.message}`);
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
    }
  }

  // ============ 微信支付 V3 签名与请求 ============

  private async wxPayRequest(method: string, path: string, body?: any): Promise<any> {
    const mchid = this.config.get('WX_PAY_MCHID');
    const serialNo = this.config.get('WX_PAY_CERT_SERIAL_NO');
    const privateKeyPath = this.config.get('WX_PAY_PRIVATE_KEY_PATH');
    const apiV3Key = this.config.get('WX_PAY_APIV3_KEY');

    const url = `${this.wxPayBaseUrl}${path}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = this.generateNonceStr(32);
    const bodyStr = body ? JSON.stringify(body) : '';

    // 构建签名串
    const signMessage = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;

    // 从文件读取私钥并签名（V3 规范：RSA-SHA256 加商户私钥）
    if (!privateKeyPath) {
      throw new BadRequestException('微信支付商户私钥未配置 (WX_PAY_PRIVATE_KEY_PATH)');
    }
    const fs = require('fs');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
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

  private verifyWxPaySign(body: string, signature: string, timestamp: string, nonce: string): void {
    // 时间戳容差：微信回调时间戳误差在5分钟内有效
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      throw new BadRequestException(`回调时间戳偏差过大: ${timestamp}`);
    }

    // 构建验签串（V3 规范：TIMESTAMP\nNONCE\nBODY\n）
    const message = `${timestamp}\n${nonce}\n${body}\n`;

    // 使用微信支付平台证书公钥 RSA-SHA256 验签
    const platformCertPath = this.config.get('WX_PAY_PLATFORM_CERT_PATH');
    if (!platformCertPath) {
      throw new BadRequestException('微信支付平台证书未配置 (WX_PAY_PLATFORM_CERT_PATH)');
    }
    const fs = require('fs');
    const cert = fs.readFileSync(platformCertPath, 'utf8');
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    const isValid = verify.verify(cert, signature, 'base64');
    if (!isValid) {
      throw new BadRequestException('微信支付回调签名验证失败');
    }
  }

  private generatePaySign(appid: string, prepayId: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = this.generateNonceStr(32);
    const packageStr = `prepay_id=${prepayId}`;
    // V3 规范：appId\ntimeStamp\nnonceStr\npackage\n
    const message = `${appid}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;

    const privateKeyPath = this.config.get('WX_PAY_PRIVATE_KEY_PATH');
    if (!privateKeyPath) {
      throw new BadRequestException('微信支付商户私钥未配置 (WX_PAY_PRIVATE_KEY_PATH)');
    }
    const fs = require('fs');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    return sign.sign(privateKey, 'base64');
  }

  /**
   * 解密微信支付 V3 回调 resource.ciphertext（AES-256-GCM）
   */
  private decryptResource(resource: {
    algorithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
    original_type: string;
  }): string {
    if (!resource || !resource.ciphertext) {
      throw new BadRequestException('回调 resource 数据缺失');
    }

    const apiV3Key = this.config.get('WX_PAY_APIV3_KEY');
    if (!apiV3Key) {
      throw new BadRequestException('微信支付 APIv3 密钥未配置 (WX_PAY_APIV3_KEY)');
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

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

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
    this.verifyWxPaySign(bodyStr, signature, timestamp, nonce);

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
      resourcePlain = this.decryptResource(notifyData.resource);
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
      } else {
        this.logger.warn(`退款回调非成功状态: ${out_refund_no} ${refund_status}`);
      }
    } finally {
      await this.redis.releaseLock(lockKey);
    }

    return { code: 'SUCCESS', message: 'OK' };
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

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentRefund.update({
        where: { id: refundRecord.id },
        data: {
          wxRefundId,
          status: 'success',
          refundedAt: new Date(),
        },
      });

      // 更新支付单
      const payment = await tx.paymentOrder.findUnique({
        where: { id: refundRecord.paymentId },
      });
      if (payment) {
        const newRefundedAmount =
          Number(payment.refundedAmount) + Number(refundRecord.amount);
        await tx.paymentOrder.update({
          where: { id: payment.id },
          data: {
            refundedAmount: newRefundedAmount,
            status:
              newRefundedAmount >= Number(payment.amount) ? 'refunded' : 'refunding',
          },
        });
      }
    });

    this.logger.log(`退款成功: ${outRefundNo}, wxRefundId=${wxRefundId}`);
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
