/** 骑手 */
export interface Rider {
  id: number
  userId: number
  realName: string
  phone: string
  avatar: string
  idCard: string
  idCardFront: string
  idCardBack: string
  healthCert: string
  auditStatus: AuditStatus
  auditRemark: string
  status: 'online' | 'offline' | 'busy'
  score: number
  balance: number        // 可提现余额，单位分
  totalOrders: number
  totalIncome: number
  regionId: number
  createdAt: string
}

/** 配送服务配置 */
export interface DeliveryConfig {
  id: number
  regionId: number
  basePrice: number      // 基础配送费
  distancePrice: number  // 每公里加价
  weightPrice: number    // 每公斤加价
  nightPrice: number     // 夜间加价
  nightStart: string     // 夜间开始时间
  nightEnd: string
  minOrderAmount: number // 最低起送金额
  estimateTimeout: number // 预计送达超时，分钟
  riderTakeTimeout: number // 骑手接单超时
}

/** 配送订单 */
export interface DeliveryOrder {
  id: number
  orderNo: string
  userId: number
  userNickname: string
  userPhone: string
  pickupAddress: string
  pickupPhone: string
  pickupName: string
  deliveryAddress: string
  deliveryPhone: string
  deliveryName: string
  packageType: string
  packageWeight: number
  packageDescription: string
  distance: number       // 配送距离，米
  fee: number
  tip: number
  paidAmount: number
  riderId: number
  riderName: string
  riderPhone: string
  status: DeliveryStatus
  pickupTime?: string
  deliverTime?: string
  completeTime?: string
  cancelReason?: string
  transferFrom?: number  // 转单来源骑手
  createdAt: string
}

export type DeliveryStatus =
  | 'waiting_accept'
  | 'accepted'
  | 'picked_up'
  | 'delivering'
  | 'completed'
  | 'cancelled'
  | 'transferred'
  | 'refunded'

/** 接单记录 */
export interface TakeOrderRecord {
  id: number
  riderId: number
  riderName: string
  orderId: number
  orderNo: string
  action: 'accept' | 'pickup' | 'deliver' | 'transfer' | 'complete'
  createdAt: string
}

/** 计费规则（骑手端） */
export interface RiderFeeRule {
  id: number
  perOrderFee: number     // 每单基础费用
  perKmRate: number       // 每公里费率
  platformRate: number    // 平台抽成比例 (0-1)
  minOrderPerDay: number  // 每日最低接单数
  bonusRule: string       // 奖励规则 JSON
}

/** 跑腿计费配置（区域维度） */
export interface ErrandFeeConfig {
  id: string
  regionId: string
  basePrice: number       // 基础配送费
  distancePrice: number   // 每公里加价
  weightPrice: number     // 每公斤加价
  timePrice?: number      // 每分钟加价
  nightPrice: number      // 夜间加价
  maxDistance: number     // 最大配送距离（米）
  maxWeight: number       // 最大配送重量（kg）
  isOpen: boolean         // 是否开启
  createdAt: string
  updatedAt: string
}

/** 跑腿页面配置（区域维度） */
export interface ErrandPageConfig {
  id: string
  regionId: string
  notice: string          // 首页公告
  orderTips: string       // 下单提示
  defaultRiderAvatar: string // 默认骑手头像
  servicePhone: string    // 客服电话
  createdAt: string
  updatedAt: string
}

/** 跑腿奖惩配置（区域维度） */
export interface ErrandRewardPunish {
  id: string
  regionId: string
  timeoutPenalty: number  // 超时罚款
  timeoutMinutes: number  // 超时时间（分钟）
  badReviewPenalty: number // 差评罚款
  goodReviewReward: number // 好评奖励
  nightReward: number     // 夜间奖励
  createdAt: string
  updatedAt: string
}
