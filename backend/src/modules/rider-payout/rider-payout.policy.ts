import { randomBytes } from 'crypto';

export const payoutId = () => `RWP${randomBytes(14).toString('hex')}`;
export const authorizationNo = () => `RWA${randomBytes(14).toString('hex')}`;
export const isAutomaticWithdrawal = (id: string) => /^RWP[0-9a-f]{28}$/.test(id);
export const ACTIVE_PAYOUT_STATES = ['QUEUED', 'SENDING', 'UNKNOWN', 'REVIEW'];
export const MIN_TRANSFER_FEN = 10;

export function payoutSettings(value: any = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const positive = (input: unknown, fallback: number, cap: number) => {
    const n = Number(input ?? fallback);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100), cap) : 0;
  };
  return {
    enabled: value.riderAutoPayoutEnabled === true,
    sceneId: String(value.riderTransferSceneId || '1005'),
    // Keep this integration below the mandatory encrypted-name threshold.
    maxFen: positive(value.riderTransferMaxAmount, 200, 199999),
    dailyUserFen: positive(value.riderTransferDailyUserAmount, 2000, 100000000),
    dailyTotalFen: positive(value.riderTransferDailyAmount, 50000, 100000000),
    notifyUrl: String(value.riderAuthorizationNotifyUrl || '').trim(),
  };
}

export type PayoutKind = 'delivery_fee' | 'purchase_principal';
export const payoutKindText = (kind: string) => kind === 'purchase_principal' ? '代买垫付货款' : '跑腿报酬';

export function payoutStatusText(status: string) {
  return ({ QUEUED: '待自动转账', SENDING: '转账处理中', UNKNOWN: '到账核实中',
    REVIEW: '待平台核对', SUCCESS: '已到账微信零钱', FAILED: '转账失败，已退回余额',
    CANCELLED: '自动转账取消，已退回余额', WALLET: '已入账钱包余额' } as Record<string, string>)[status] || '待核对';
}

export async function riderFinancialBlock(db: any, riderId: string): Promise<string> {
  const [hold, risk, liability, refund, appeals] = await Promise.all([
    db.errandSettlementHold.findFirst({ where: { riderId, status: 'holding' }, select: { id: true } }),
    db.deliveryRiskEvent.findFirst({ where: { riderId, orderType: 'errand', handled: false,
      eventLevel: { in: ['error', 'critical'] } }, select: { id: true } }),
    db.riderLiability.findFirst({ where: { riderId, status: 'open' }, select: { id: true } }),
    db.errandOrder.findFirst({ where: { riderId, refundStatus: 'refunding' }, select: { id: true } }),
    db.orderAppeal.findMany({ where: { orderType: { in: ['errand', 'errand_order'] },
      status: { notIn: ['resolved', 'rejected', 'closed', 'cancelled', 'completed'] } }, select: { orderId: true } }),
  ]);
  if (hold || risk || liability || refund) return '存在冻结收益、退款或未处理风险，保留在钱包待核对';
  if (appeals.length && await db.errandOrder.findFirst({ where: {
    riderId, id: { in: appeals.map((item: any) => item.orderId) },
  }, select: { id: true } })) return '存在未结申诉，保留在钱包待核对';
  return '';
}
