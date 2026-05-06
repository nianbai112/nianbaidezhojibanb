/** 优惠券 */
export interface Coupon {
  id: string
  name: string
  type: 'FULL_REDUCTION' | 'DISCOUNT' | 'EXCHANGE'
  value: number
  minAmount: number
  totalCount: number
  receivedCount: number
  usedCount: number
  limitPerUser: number
  startAt: string
  endAt: string
  status: string
  description?: string
  code?: string
  regionId?: string
  region?: { id: string; name: string }
  merchantId?: string
  merchant?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

/** 优惠券使用记录 */
export interface CouponUsage {
  id: string
  couponId: string
  coupon: { id: string; name: string; type: string }
  userId: string
  user: { id: string; nickname: string; avatar?: string }
  status: string
  usedAt?: string
  orderNo?: string
  createdAt: string
}

/** 签到配置 */
export interface SignConfig {
  id: number
  consecutiveDays: number
  rewardType: 'points' | 'coupon' | 'balance'
  rewardValue: number
  couponId: number
  status: 0 | 1
}

/** 徽章/头衔 */
export interface Badge {
  id: number
  name: string
  icon: string
  description: string
  type: 'system' | 'achievement' | 'event'
  condition: string      // 获得条件 JSON
  points: number         // 获得后赠送积分
  status: 0 | 1
}

/** 活动 */
export interface Activity {
  id: number
  title: string
  cover: string
  description: string
  type: 'sign' | 'lottery' | 'redpacket' | 'task' | 'invite'
  startTime: string
  endTime: string
  rules: Record<string, any>
  participantCount: number
  status: 'draft' | 'running' | 'ended'
  createdAt: string
}

/** 团购 */
export interface GroupBuy {
  id: number
  productId: number
  productName: string
  productImage: string
  minPeople: number
  groupPrice: number
  originPrice: number
  duration: number       // 团购持续时间，小时
  startTime: string
  endTime: string
  totalGroups: number
  successGroups: number
  status: 0 | 1
}

/** 分享活动设置 */
export interface ShareSettings {
  id: string
  regionId: string
  isEnabled: boolean
  activityTitle?: string
  activityImage?: string
  activityRules?: string
  inviterReward: number
  inviteeReward: number
  userLimit: 'ALL_USERS' | 'NEW_USERS'
  dailyInviteLimit: number
  totalInviteLimit?: number
  startTime?: string
  endTime?: string
  createdAt: string
  updatedAt: string
}

/** 分享邀请记录 */
export interface ShareInvite {
  id: string
  inviterId: string
  inviteeId: string
  isNewUser: boolean
  rewardAmount: number
  inviteeRewardAmount: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  failedReason?: string
  regionId?: string
  createdAt: string
  updatedAt: string
  inviter?: { id: string; nickname: string; avatar?: string }
  invitee?: { id: string; nickname: string; avatar?: string }
}

/** 分享奖励记录 */
export interface ShareReward {
  id: string
  inviteId: string
  userId: string
  type: 'INVITER' | 'INVITEE'
  amount: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  failedReason?: string
  relatedTransactionId?: string
  createdAt: string
  updatedAt: string
  user?: { id: string; nickname: string; avatar?: string }
  invite?: { id: string; inviterId: string; inviteeId: string }
}

/** 分享统计 */
export interface ShareStatsOverview {
  totalInvites: number
  todayInvites: number
  successInvites: number
  failedInvites: number
  totalRewardAmount: number
}

/** 系统通知 */
export interface SystemNotification {
  id: number
  title: string
  content: string
  type: 'system' | 'activity' | 'promotion' | 'announcement'
  targetType: 'all' | 'region' | 'user_tag' | 'specific'
  targetIds: number[]
  sendStatus: 'draft' | 'sending' | 'sent' | 'failed'
  sendTime?: string
  readCount: number
  totalCount: number
  createdAt: string
}
