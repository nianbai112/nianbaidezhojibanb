import { BadRequestException } from '@nestjs/common';
import { requestContext } from './request-context';
import { isMiniappOpenid } from './wechat-identity';

// 仅选择支付渠道，不授予用户身份、订单权限或定价权限。
export function paymentClient(): 'miniapp' | 'app-android' | 'app-ios' {
  const value = requestContext.getStore()?.request.headers['x-client-platform'];
  if (value === 'app-android' || value === 'app-ios') return value;
  return 'miniapp';
}
export function canStartWechatPayment(openid: unknown): boolean {
  return paymentClient() !== 'miniapp' || isMiniappOpenid(openid);
}
export function assertPaymentGoodsAllowed(bizType: string): void {
  if (paymentClient() === 'app-ios' && !['order', 'mall_order', 'errand_order', 'second_hand', 'errand_purchase', 'errand_purchase_change', 'activity_order', 'group_buy'].includes(bizType)) {
    throw new BadRequestException('该权益暂不支持在 iOS App 内购买');
  }
}
