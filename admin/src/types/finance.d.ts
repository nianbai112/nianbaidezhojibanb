/** 支付订单 */
export interface PaymentOrder {
  id: number
  orderNo: string
  bizType: 'order' | 'recharge' | 'vip' | 'delivery'
  bizId: number
  userId: number
  userNickname: string
  amount: number
  payMethod: 'wechat' | 'balance' | 'admin'
  payStatus: 'pending' | 'paid' | 'refunding' | 'refunded' | 'closed'
  transactionId: string
  payTime: string
  createdAt: string
}

/** 充值记录 */
export interface RechargeRecord {
  id: number
  userId: number
  userNickname: string
  amount: number
  giveAmount: number     // 赠送金额
  payMethod: string
  status: 'pending' | 'success' | 'failed'
  createdAt: string
}

/** 余额流水 */
export interface BalanceLog {
  id: number
  userId: number
  userNickname: string
  type: 'income' | 'expense' | 'freeze' | 'unfreeze'
  amount: number
  balance: number        // 操作后余额
  bizType: string
  bizId: number
  remark: string
  createdAt: string
}

/** 提现记录 */
export interface WithdrawRecord {
  id: number
  userId: number
  userNickname: string
  userType: 'user' | 'rider' | 'merchant'
  amount: number
  fee: number
  actualAmount: number
  accountType: 'wechat' | 'bank'
  accountInfo: string
  status: 'pending' | 'processing' | 'success' | 'failed' | 'rejected'
  rejectReason: string
  handlerId: number
  handledAt: string
  transferNo: string
  createdAt: string
}

/** 退款记录（财务视角） */
export interface RefundFinanceRecord {
  id: number
  refundNo: string
  originalOrderNo: string
  userId: number
  userNickname: string
  amount: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'refunded'
  handlerId: number
  handledAt: string
  refundTransactionId: string
  createdAt: string
}

/** 对账导出 */
export interface ReconciliationExport {
  id: number
  date: string
  type: 'daily' | 'monthly'
  totalOrders: number
  totalAmount: number
  totalRefund: number
  totalFee: number
  netAmount: number
  status: 'pending' | 'done'
  fileUrl: string
  createdAt: string
}
