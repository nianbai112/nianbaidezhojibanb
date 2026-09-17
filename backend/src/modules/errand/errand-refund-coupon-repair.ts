import { BadRequestException } from '@nestjs/common';

/** Read-only proof check, shared by the admin API and maintenance CLI. */
export async function inspectRefundedErrandCoupon(db: any, orderNo: string) {
  const order = await db.errandOrder.findUnique({ where: { orderNo } });
  if (!order) throw new BadRequestException('订单不存在');
  if (order.status !== 'refunded' || order.refundStatus !== 'refunded') {
    throw new BadRequestException('仅支持已全额退款的跑腿订单');
  }
  const cents = (amount: any) => Math.round(Number(amount) * 100);
  const paidCents = cents(order.payAmount);
  if (!Number.isFinite(paidCents) || paidCents <= 0) throw new BadRequestException('该订单不属于已支付退款补券范围');
  const payment = await db.paymentOrder.findFirst({
    where: { bizType: 'errand_order', bizId: order.id, status: 'refunded', amount: order.payAmount },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment || !Number.isFinite(cents(payment.refundedAmount)) || cents(payment.refundedAmount) < paidCents) {
    throw new BadRequestException('缺少已全额退款的支付单');
  }
  const refunds = await db.paymentRefund.aggregate({
    where: { paymentId: payment.id, status: 'success' },
    _sum: { amount: true },
  });
  const refundedCents = cents(refunds._sum.amount || 0);
  if (!Number.isFinite(refundedCents) || refundedCents < paidCents) {
    throw new BadRequestException('成功退款记录不足，不能补券');
  }
  const receive = await db.couponReceive.findFirst({
    where: { userId: order.userId, orderNo: order.orderNo, status: 'used' },
    include: { coupon: { select: { name: true, endAt: true } } },
  });
  return { order, receive, refundedAmount: refundedCents / 100 };
}
