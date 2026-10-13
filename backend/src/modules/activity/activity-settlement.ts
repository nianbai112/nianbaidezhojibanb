import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
export const PUBLIC_ACTIVITY_STATUSES = ['upcoming', 'signup', 'ongoing', 'ended'];
export async function lockActivity(tx: any, id: string) {
  await tx.$queryRaw`SELECT id FROM activities WHERE id = ${id} FOR UPDATE`;
}
export async function lockActivityOrder(tx: any, id: string) {
  const initial = await tx.activityOrder.findUnique({ where: { id } });
  if (!initial) throw new NotFoundException('活动订单不存在');
  await lockActivity(tx, initial.activityId);
  await tx.$queryRaw`SELECT id FROM activity_orders WHERE id = ${id} FOR UPDATE`;
  return tx.activityOrder.findUnique({ where: { id }, include: { activity: true, package: true } });
}
// Activity lock serializes reservations, free tickets, payment, cancellation and check-in.
export async function settleActivityPayment(tx: any, orderId: string, paidAmount?: number) {
  const order = await lockActivityOrder(tx, orderId);
  if (['paid', 'joined', 'completed'].includes(order.orderStatus) && order.payStatus === 'paid') return { order, skipPostPayNotify: true };
  if (order.orderStatus === 'refunded') return { order, skipPostPayNotify: true };
  if (order.orderStatus !== 'pending' || !PUBLIC_ACTIVITY_STATUSES.includes(order.activity.status) || ['ended'].includes(order.activity.status) || new Date(order.activity.endAt).getTime() <= Date.now() || (paidAmount !== undefined && Math.round(paidAmount * 100) !== Math.round(Number(order.amount) * 100))) {
    await tx.activityOrder.update({ where: { id: order.id }, data: { payStatus: 'paid', orderStatus: 'pending_refund', refundStatus: 'processing', refundReason: '订单已失效或付款金额不匹配，自动退款' } });
    return { order, skipPostPayNotify: true, refundCancelledActivity: true };
  }
  const cap = Number(order.activity.maxPeople || 0);
  if ((cap > 0 && order.activity.joinCount + order.quantity > cap) || (order.packageId && (!order.package || order.package.availableTickets < order.quantity))) {
    await tx.activityOrder.update({ where: { id: order.id }, data: { payStatus: 'paid', orderStatus: 'pending_refund', refundStatus: 'processing', refundReason: '活动余票不足，自动退款' } });
    return { order, skipPostPayNotify: true, refundCancelledActivity: true };
  }
  if (order.packageId) {
    const stock = await tx.activityPackage.updateMany({where:{id:order.packageId,availableTickets:{gte:order.quantity}},data:{availableTickets:{decrement:order.quantity}}});
    if (stock.count!==1) {
      await tx.activityOrder.update({where:{id:order.id},data:{payStatus:'paid',orderStatus:'pending_refund',refundStatus:'processing',refundReason:'余票变更，自动退款'}});
      return {order,skipPostPayNotify:true,refundCancelledActivity:true};
    }
  }
  const updated = await tx.activityOrder.update({ where: { id: order.id }, data: { payStatus: 'paid', orderStatus: 'paid', payTime: new Date() } });
  await tx.activityJoin.upsert({ where: { activityId_userId: { activityId: order.activityId, userId: order.userId } }, create: { activityId: order.activityId, userId: order.userId, status: 'joined' }, update: { status: 'joined' } });
  await tx.activity.update({ where: { id: order.activityId }, data: { joinCount: { increment: order.quantity } } });
  await tx.activityTicket.createMany({ data: Array.from({ length: order.quantity }, () => ({ orderId: order.id, activityId: order.activityId, packageId: order.packageId, userId: order.userId, ticketNumber: `AT${randomUUID().replace(/-/g, '')}`, ticketStatus: 'valid' })) });
  return { order: updated };
}
export async function settleActivityRefund(tx: any, orderId: string, full: boolean, amount: number) {
  if (!full) { await tx.activityOrder.update({where:{id:orderId},data:{refundStatus:'partial_refunded',refundAmount:amount}}); return; }
  const order = await lockActivityOrder(tx, orderId);
  if (order.orderStatus === 'refunded') return;
  // Only issued tickets release capacity. Cancelled unpaid orders never reserved physical stock.
  const issued = await tx.activityTicket.updateMany({ where: { orderId, ticketStatus: { in: ['valid', 'refund_pending'] } }, data: { ticketStatus: 'refunded' } });
  if (issued.count) {
    if (order.packageId) await tx.activityPackage.update({ where: { id: order.packageId }, data: { availableTickets: { increment: issued.count } } });
    await tx.activity.update({ where: { id: order.activityId }, data: { joinCount: { decrement: issued.count } } });
  }
  await tx.activityOrder.update({ where: { id: orderId }, data: { payStatus: 'refunded', orderStatus: 'refunded', refundStatus: 'refunded', refundAmount: amount } });
  const others = await tx.activityTicket.count({ where: { activityId: order.activityId, userId: order.userId, ticketStatus: { in: ['valid', 'used', 'checked_in'] } } });
  if (!others) await tx.activityJoin.updateMany({ where: { activityId: order.activityId, userId: order.userId }, data: { status: 'cancelled' } });
}
