import { Prisma } from '@prisma/client';

const money = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(Math.max(0, number) * 100) / 100 : 0;
};

export function errandPlatformFee(order: any, config: any): number {
  if (!config?.enabled) return 0;
  const gross = money(money(order.price) + money(order.tip));
  // Coupons are funded by the issuer. They never change the commission base,
  // including a fully subsidized order whose customer payment is zero.
  // Decimal rounding keeps half-cent fees deterministic (1.45 × 10% = 0.15).
  const fee = new Prisma.Decimal(gross).mul(Number(config.rate || 0))
    .plus(Number(config.fixedFee || 0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  return Math.min(gross, money(fee));
}

export function errandRiderIncome(order: any): number {
  return money(money(order.price) + money(order.tip) - money(order.platformFee));
}

export function merchantSettlementBase(order: any): number {
  if (order.refundStatus === 'refunded') return 0;
  const gross = order.payAmount == null
    ? money(order.totalAmount)
    : money(money(order.payAmount) + money(order.subsidyAmount));
  const selfDelivery = order.businessType === 'dorm_shop' || order.deliveryMode === 'self_delivery';
  const freight = selfDelivery ? 0 : money(order.originalFreightAmount) || money(order.freightAmount);
  const base = money(gross - freight);
  return money(base - (order.refundStatus === 'partial' ? money(order.refundAmount) : 0));
}
