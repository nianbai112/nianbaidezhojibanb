import { BadRequestException } from '@nestjs/common';

// Call inside a READ COMMITTED transaction with the receipt/redeem record writes.
// Lock the template before reading stock and user limits. The counter comparison
// also rejects stale reads from callers that accidentally use REPEATABLE READ.
export async function reserveCouponIssue(
  tx: any, couponId: string, userId: string, quantity = 1,
  options: { ignoreUserLimit?: boolean; skipIfLimit?: boolean } = {},
) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new BadRequestException('发券数量必须为正整数');
  const locked = await tx.coupon.updateMany({ where: { id: couponId }, data: { receivedCount: { increment: 0 } } });
  if (locked.count !== 1) throw new BadRequestException('优惠券不存在或已失效');
  const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
  const now = new Date();
  if (!coupon || coupon.status !== 'active') throw new BadRequestException('优惠券不存在或已失效');
  if (coupon.startAt && now < coupon.startAt) throw new BadRequestException('优惠券领取未开始');
  if (coupon.endAt && now > coupon.endAt) throw new BadRequestException('优惠券已过期');
  if (coupon.receivedCount + quantity > coupon.totalCount) throw new BadRequestException('优惠券库存不足或已领完');
  if (!options.ignoreUserLimit) {
    const owned = await tx.couponReceive.count({ where: { couponId, userId } });
    if (owned + quantity > coupon.limitPerUser) {
      if (options.skipIfLimit) return null;
      throw new BadRequestException('已达到领取上限');
    }
  }
  const reserved = await tx.coupon.updateMany({
    where: {
      id: couponId, status: 'active', receivedCount: coupon.receivedCount,
      totalCount: { gte: coupon.receivedCount + quantity },
      startAt: { lte: now }, endAt: { gte: now },
      limitPerUser: coupon.limitPerUser,
    },
    data: { receivedCount: { increment: quantity } },
  });
  if (reserved.count !== 1) throw new BadRequestException('优惠券领取状态已变化，请刷新后重试');
  return coupon;
}

export function assertCouponConfiguration(coupon: any) {
  if (!['DISCOUNT', 'FULL_REDUCTION', 'EXCHANGE'].includes(String(coupon.type).toUpperCase())) throw new BadRequestException('优惠券类型不合法');
  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value <= 0 || value > 99999999.99) {
    throw new BadRequestException('优惠券面值必须大于 0，且不超过 99999999.99');
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new BadRequestException('优惠券面值最多保留两位小数');
  if (String(coupon.type).toUpperCase() === 'DISCOUNT' && value >= 10) {
    throw new BadRequestException('折扣必须大于 0 且小于 10，例如 8 表示八折');
  }
  const minAmount = Number(coupon.minAmount ?? 0);
  if (!Number.isFinite(minAmount) || minAmount < 0 || minAmount > 99999999.99) throw new BadRequestException('最低消费金额不合法');
  if (Math.abs(minAmount * 100 - Math.round(minAmount * 100)) > 0.000001) throw new BadRequestException('最低消费最多保留两位小数');
  for (const key of ['totalCount', 'limitPerUser']) {
    const n = Number(coupon[key]);
    if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) throw new BadRequestException('发放总量和每人限领必须为正整数');
  }
  if (Number(coupon.totalCount) < Number(coupon.receivedCount || 0)) throw new BadRequestException('发放总量不能小于已领取数量');
  const start = new Date(coupon.startAt).getTime();
  const end = new Date(coupon.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new BadRequestException('优惠券有效期不合法');
}

export function couponDiscountAmount(coupon: any, amount: number) {
  const value = Number(coupon?.value || 0);
  if (!Number.isFinite(value) || !Number.isFinite(amount) || amount <= 0 || value <= 0) return 0;
  const discount = String(coupon?.type).toUpperCase() === 'DISCOUNT'
    ? (value < 10 ? amount - amount * (value / 10) : 0)
    : Math.min(value, amount);
  return Math.round(discount * 100) / 100;
}
