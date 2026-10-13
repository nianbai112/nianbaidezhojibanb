import { BadRequestException } from '@nestjs/common';
import { couponDiscountAmount } from '../../common/coupon-policy';
import { assertCouponCampaignRules, resolveActiveCouponCampaign } from './errand-transaction-guards';

/**
 * One rule set for every errand service, 代买 included: 通用 or 跑腿 coupons
 * that no merchant owns. `amount` is the discountable service fee, never tips
 * or 代买 goods money.
 */
export function errandCouponUnavailableReason(coupon: any, amount: number, regionId?: string) {
  if (!coupon || coupon.status !== 'active') return '优惠券已下架';
  const now = new Date();
  if (coupon.startAt && now < coupon.startAt) return '未到可用时间';
  if (coupon.endAt && now > coupon.endAt) return '优惠券已过期';
  const scope = String(coupon.businessScope || 'all').toLowerCase();
  if (!['all', 'errand'].includes(scope)) return '该优惠券不适用于跑腿';
  if (coupon.merchantId) return '商家专属券不能用于跑腿';
  if (coupon.regionId && String(coupon.regionId) !== String(regionId || '')) return '不适用于当前区域';
  if (amount <= 0) return '请先完善订单信息';
  if (Number(coupon.minAmount || 0) > amount) return `满 ¥${Number(coupon.minAmount || 0).toFixed(2)} 可用`;
  if (couponDiscountAmount(coupon, amount) <= 0) return '当前金额不可用';
  return '';
}

export interface ErrandCouponBenefit {
  discountAmount: number;
  receive: any;
  coupon: any;
  campaign: any;
}

/** Validates a user's unused coupon against an errand service fee; the caller consumes it. */
export async function resolveErrandCoupon(
  db: any,
  userId: string,
  userCouponId: unknown,
  amount: number,
  regionId?: string,
): Promise<ErrandCouponBenefit> {
  if (!userCouponId) return { discountAmount: 0, receive: null, coupon: null, campaign: null };
  const receive = await db.couponReceive.findFirst({
    where: { id: String(userCouponId), userId },
    include: { coupon: true },
  });
  if (!receive) throw new BadRequestException('优惠券不存在');
  if (receive.status !== 'unused') throw new BadRequestException('优惠券已使用或已失效');
  const reason = errandCouponUnavailableReason(receive.coupon, amount, regionId);
  if (reason) throw new BadRequestException(reason);
  const discountAmount = Math.min(amount, couponDiscountAmount(receive.coupon, amount));
  const campaign = await resolveActiveCouponCampaign(db, receive.coupon.id);
  await assertCouponCampaignRules(db, campaign, userId, receive.coupon.id, discountAmount, 'errand');
  return { discountAmount, receive, coupon: receive.coupon, campaign };
}
