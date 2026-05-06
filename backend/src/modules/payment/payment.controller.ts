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

    if (!bizType || !bizId) {
      throw new BadRequestException('缺少业务类型或业务ID');
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

    return this.paymentService.refund({
      bizType,
      bizId,
      amount: Number(amount),
      reason: reason || '管理员退款',
      operatorId: adminUser.sub,
    });
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
  } | null> {
    switch (bizType) {
      case 'order': {
        const o = await this.prisma.order.findUnique({
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
          select: { userId: true, orderNo: true, amount: true, giveAmount: true },
        });
        if (!o) return null;
        return {
          userId: o.userId,
          orderNo: o.orderNo,
          realAmount: Number(o.amount),
          description: `流量充值 ${o.orderNo}`,
        };
      }

      default:
        throw new BadRequestException(`不支持的业务类型: ${bizType}`);
    }
  }
}
