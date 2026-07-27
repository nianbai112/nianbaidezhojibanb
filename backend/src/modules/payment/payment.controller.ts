import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  Req,
  RawBodyRequest,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('支付')
@Controller()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 创建支付订单（用户端） ====================

  @ApiOperation({ summary: '创建微信支付订单' })
  @UseGuards(JwtGuard)
  @Post('wxpay/createOrder')
  async createOrder(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    // 1. 从 JWT 获取 userId，查询真实用户信息
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, openid: true },
    });

    if (!user || !user.openid) {
      throw new BadRequestException('用户不存在或未绑定微信');
    }

    const { bizType, bizId } = dto;
    if (!bizType || !bizId) {
      throw new BadRequestException('缺少业务类型或业务ID');
    }
    // 2. 查询业务订单，验证所有权并获取真实金额和订单号
    const bizOrder = await this.lookupBizOrder(bizType, bizId, userId);

    if (!bizOrder) {
      throw new BadRequestException('业务订单不存在');
    }

    if (bizOrder.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }

    if (bizType === 'order') {
      if (bizOrder.status !== 'PENDING_PAY') {
        throw new BadRequestException('订单状态不允许支付');
      }
      if (bizOrder.createdAt && bizOrder.createdAt.getTime() <= Date.now() - 15 * 60 * 1000) {
        throw new BadRequestException('订单支付已超时，请重新下单');
      }
    }

    // 3. 验证金额：客户端传入的 amount 必须与业务订单金额一致
    const dtoAmount = Number(dto.amount);
    if (isNaN(dtoAmount) || dtoAmount <= 0) {
      throw new BadRequestException('支付金额无效');
    }

    // 浮点数比较容差（分级别）
    if (Math.abs(dtoAmount - bizOrder.realAmount) > 0.001) {
      throw new BadRequestException(
        `支付金额不匹配: 传入 ${dtoAmount}, 实际 ${bizOrder.realAmount}`,
      );
    }

    // 4. 拼接 description
    const description = dto.description || bizOrder.description || '订单支付';

    // 5. 调用支付服务（openid 使用 DB 查询到的真实值，不信任客户端）
    return this.paymentService.wxUnifiedOrder({
      bizType,
      bizId,
      orderNo: bizOrder.orderNo,
      amount: bizOrder.realAmount,
      description,
      openid: user.openid,
      userId,
    });
  }

  // ==================== 查询支付状态（用户端） ====================

  @ApiOperation({ summary: '查询支付状态' })
  @UseGuards(JwtGuard)
  @Get('wxpay/query')
  async queryPayment(
    @Query('paymentNo') paymentNo: string,
    @CurrentUser() user: any,
  ) {
    if (!paymentNo) {
      throw new BadRequestException('缺少支付单号');
    }

    const payment = await this.prisma.paymentOrder.findUnique({
      where: { paymentNo },
    });

    if (!payment) {
      throw new BadRequestException('支付单不存在');
    }

    // 管理员可以查询任意支付单
    if (user.isAdmin) {
      return this.paymentService.queryPayment(paymentNo);
    }

    // 普通用户只能查询自己的支付单
    if (payment.userId !== user.sub) {
      throw new ForbiddenException('无权查看该支付单');
    }

    return this.paymentService.queryPayment(paymentNo);
  }

  // ==================== 发起退款（管理员） ====================

  @ApiOperation({ summary: '申请退款（管理员）' })
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('order:refund')
  @Post('wxpay/refund')
  async refund(
    @Body() dto: any,
    @CurrentUser() adminUser: any,
  ) {
    const { bizType, bizId, amount, reason } = dto;
    const refundAmount = Number(amount);
    let claimedPendingShopOrder = false;

    if (!bizType || !bizId) {
      throw new BadRequestException('缺少业务类型或业务ID');
    }
    if (!String(reason || '').trim()) {
      throw new BadRequestException('请填写退款原因');
    }
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException('退款金额无效');
    }
    if (bizType === 'order') {
      const order = await this.prisma.order.findUnique({
        where: { id: bizId },
        select: { id: true, status: true, payAmount: true, merchantAcceptTime: true, refundStatus: true },
      });
      if (!order) throw new BadRequestException('订单不存在');
      if (order.status === 'SHIPPED' || (order.status === 'PAID' && order.merchantAcceptTime)) {
        throw new BadRequestException('商家备餐或骑手配送中的订单不能直接退款，请先完成履约处置');
      }
      if (order.status === 'PAID' && !order.merchantAcceptTime) {
        const claimed = await this.prisma.order.updateMany({
          where: { id: order.id, status: 'PAID', merchantAcceptTime: null, refundStatus: 'none' },
          data: { refundStatus: 'refunding', refundAmount },
        });
        if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');
        claimedPendingShopOrder = true;
      }
    }

    // 管理员审计日志
    this.logger.log(
      `[REFUND] admin=${adminUser.sub} bizType=${bizType} bizId=${bizId} amount=${amount} reason=${reason}`,
    );

    // 记录管理员操作审计
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'payment',
          targetId: bizId,
          userId: adminUser.sub,
          detail: { bizType, bizId, amount, reason, operatorId: adminUser.sub },
        },
      });
    } catch (e: any) {
      this.logger.warn(`审计日志写入失败: ${e.message}`);
    }

    try {
      return await this.paymentService.refund({
        bizType,
        bizId,
        amount: refundAmount,
        reason: String(reason).trim(),
        operatorId: adminUser.sub,
      });
    } catch (error) {
      if (claimedPendingShopOrder) {
        await this.prisma.order.updateMany({
          where: { id: bizId, refundStatus: 'refunding' },
          data: { refundStatus: 'none', refundAmount: null },
        });
      }
      throw error;
    }
  }

  @ApiOperation({ summary: '商家退款' })
  @UseGuards(JwtGuard)
  @Post('wxpay/merchant-refund')
  async merchantRefund(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    const orderId = String(dto.orderId || dto.order_id || '').trim();
    if (!orderId) throw new BadRequestException('缺少订单ID');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, status: true, payAmount: true, merchantAcceptTime: true, riderId: true, refundStatus: true, merchant: { select: { userId: true } } },
    });
    if (!order) throw new BadRequestException('订单不存在');
    if (order.merchant.userId !== userId) throw new ForbiddenException('无权退款该订单');
    if (order.status !== 'PAID' || order.merchantAcceptTime || order.riderId || order.refundStatus !== 'none') {
      throw new BadRequestException('仅商家尚未接单的已付款订单可退款');
    }

    const amount = Number(dto.refundAmount ?? dto.refund_amount);
    const payAmount = Number(order.payAmount);
    const reason = String(dto.refundReason || dto.refund_reason || '').trim();
    if (!reason) throw new BadRequestException('请填写退款原因');
    if (payAmount <= 0) {
      const result = await this.paymentService.cancelFreeShopOrder(order.id, `商家拒单：${reason}`, userId, 'merchant');
      await this.prisma.auditLog.create({
        data: { action: 'UPDATE', module: 'payment', targetId: order.id, userId,
          detail: { bizType: 'order', bizId: order.id, amount: 0, reason: `商家拒单：${reason}`, operatorType: 'merchant', action: 'merchant_reject_free' } },
      }).catch((error: any) => this.logger.warn(`商家零元订单取消审计写入失败: ${error.message}`));
      return result;
    }
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(payAmount * 100)) {
      throw new BadRequestException('商家拒单必须全额退款');
    }
    const refundReason = `商家拒单：${reason}`;

    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, status: 'PAID', merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId } },
      data: { refundStatus: 'refunding', refundAmount: payAmount },
    });
    if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');

    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE', module: 'payment', targetId: order.id, userId,
        detail: { bizType: 'order', bizId: order.id, amount, reason: refundReason, operatorType: 'merchant', action: 'merchant_reject' },
      },
    }).catch((error: any) => this.logger.warn(`商家退款审计写入失败: ${error.message}`));

    await this.prisma.orderLog.create({
      data: {
        orderId: order.id,
        action: 'MERCHANT_REJECT',
        fromStatus: 'PAID',
        toStatus: 'PAID',
        operatorId: userId,
        operatorType: 'merchant',
        remark: refundReason,
      },
    }).catch((error: any) => this.logger.warn(`商家拒单日志写入失败: ${error.message}`));

    try {
      return await this.paymentService.refund({
        bizType: 'order', bizId: order.id, amount, reason: refundReason, operatorId: userId,
      });
    } catch (error) {
      await this.prisma.order.updateMany({
        where: { id: order.id, refundStatus: 'refunding' },
        data: { refundStatus: 'none', refundAmount: null },
      });
      throw error;
    }
  }

  @ApiOperation({ summary: '用户取消未接单的外卖订单并退款' })
  @UseGuards(JwtGuard)
  @Post('wxpay/user-order-refund')
  async userOrderRefund(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    const orderId = String(dto.orderId || dto.order_id || '').trim();
    const reason = String(dto.reason || dto.refundReason || dto.refund_reason || '').trim();
    if (!orderId) throw new BadRequestException('缺少订单ID');
    if (!reason) throw new BadRequestException('请填写退款原因');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, payAmount: true, merchantAcceptTime: true, refundStatus: true },
    });
    if (!order) throw new BadRequestException('订单不存在');
    if (order.userId !== userId) throw new ForbiddenException('无权退款该订单');
    if (order.status !== 'PAID' || order.merchantAcceptTime || order.refundStatus !== 'none') {
      throw new BadRequestException('商家接单前的已付款订单才可自助退款');
    }

    const payAmount = Number(order.payAmount);
    if (payAmount <= 0) {
      const result = await this.paymentService.cancelFreeShopOrder(order.id, reason, userId, 'user');
      await this.prisma.auditLog.create({
        data: { action: 'UPDATE', module: 'payment', targetId: order.id, userId,
          detail: { bizType: 'order', bizId: order.id, amount: 0, reason, operatorType: 'user', action: 'user_cancel_free' } },
      }).catch((error: any) => this.logger.warn(`用户零元订单取消审计写入失败: ${error.message}`));
      return result;
    }
    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, userId, status: 'PAID', merchantAcceptTime: null, refundStatus: 'none' },
      data: { refundStatus: 'refunding', refundAmount: payAmount },
    });
    if (claimed.count !== 1) throw new BadRequestException('订单状态已变化，请刷新后重试');

    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE', module: 'payment', targetId: order.id, userId,
        detail: { bizType: 'order', bizId: order.id, amount: payAmount, reason, operatorType: 'user' },
      },
    }).catch((error: any) => this.logger.warn(`用户退款审计写入失败: ${error.message}`));

    try {
      return await this.paymentService.refund({
        bizType: 'order', bizId: order.id, amount: payAmount, reason, operatorId: userId,
      });
    } catch (error) {
      await this.prisma.order.updateMany({
        where: { id: order.id, refundStatus: 'refunding' },
        data: { refundStatus: 'none', refundAmount: null },
      });
      throw error;
    }
  }

  @ApiOperation({ summary: '用户售后退款申请（商家接单后，进入平台审核）' })
  @UseGuards(JwtGuard)
  @Post('wxpay/order-refund/apply')
  async applyOrderRefund(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    const orderId = String(dto.orderId || dto.order_id || '').trim();
    const reason = String(dto.reason || dto.refundReason || dto.refund_reason || '').trim();
    if (!orderId) throw new BadRequestException('缺少订单ID');
    if (!reason) throw new BadRequestException('请填写退款原因');
    return this.paymentService.applyShopOrderRefund(
      orderId,
      userId,
      reason,
      dto.amount ?? dto.refundAmount ?? dto.refund_amount,
    );
  }

  @ApiOperation({ summary: '用户撤销售后退款申请' })
  @UseGuards(JwtGuard)
  @Post('wxpay/order-refund/cancel-apply')
  async cancelOrderRefundApply(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    const orderId = String(dto.orderId || dto.order_id || '').trim();
    if (!orderId) throw new BadRequestException('缺少订单ID');
    return this.paymentService.cancelShopOrderRefundApplication(orderId, userId);
  }

  // ==================== 微信支付回调（公开·无鉴权） ====================

  @ApiOperation({ summary: '微信支付回调' })
  @Post('wxpay/notify')
  async notify(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const body = req.rawBody || req.body;
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return this.paymentService.wxNotify(rawBody, headers);
  }

  // ==================== 微信退款回调（公开·无鉴权） ====================

  @ApiOperation({ summary: '微信退款回调' })
  @Post('wxpay/refund-notify')
  async refundNotify(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const body = req.rawBody || req.body;
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return this.paymentService.handleRefundNotify(rawBody, headers);
  }

  // ==================== 私有方法 ====================

  /**
   * 根据 bizType 查询业务订单并返回统一格式
   */
  private async lookupBizOrder(
    bizType: string,
    bizId: string,
    userId: string,
  ): Promise<{
    userId: string;
    orderNo: string;
    realAmount: number;
    description: string;
    status?: string;
    createdAt?: Date;
  } | null> {
    switch (bizType) {
      case 'order': {
        const o = await this.prisma.order.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, payAmount: true, status: true, createdAt: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.payAmount),
          description: `外卖订单 ${o.orderNo}`,
          status: o.status,
          createdAt: o.createdAt,
        };
      }

      case 'mall_order': {
        const o = await this.prisma.mallOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, payAmount: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.payAmount),
          description: `商城订单 ${o.orderNo}`,
        };
      }

      case 'delivery_order': {
        const o = await this.prisma.deliveryOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, price: true, tip: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.price) + Number(o.tip || 0),
          description: `跑腿配送 ${o.orderNo}`,
        };
      }

      case 'errand_order': {
        const o = await this.prisma.errandOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, payAmount: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.payAmount),
          description: `万能跑腿 ${o.orderNo}`,
        };
      }

      case 'recharge': {
        const o = await this.prisma.recharge.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, amount: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.amount),
          description: '余额充值',
        };
      }

      case 'topup': {
        const o = await this.prisma.topupOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, amount: true, packageName: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.amount),
          description: `笔记置顶 ${o.packageName || o.orderNo}`,
        };
      }

      case 'second_hand': {
        const o = await this.prisma.secondHandOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, buyerId: true, orderNo: true, price: true },
        });
        if (!o) return null;
        return {
          userId: o.userId || o.buyerId,
          orderNo: o.orderNo,
          realAmount: Number(o.price),
          description: `二手闲置 ${o.orderNo}`,
        };
      }

      case 'membership_order': {
        const o = await (this.prisma as any).membershipOrder.findUnique({
          where: { id: bizId },
          select: { userId: true, orderNo: true, amount: true, planName: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.amount),
          description: `会员开通 ${o.planName || o.orderNo}`,
        };
      }

      default:
        throw new BadRequestException(`不支持的业务类型: ${bizType}`);
    }
  }
}
