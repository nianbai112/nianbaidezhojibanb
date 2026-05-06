/** 用户标签 */
export interface UserTag {
  id: number
  name: string
  color: string
  usedCount: number
  createdAt: string
}

/** 用户基础信息 */
export interface UserInfo {
  id: number
  nickname: string
  avatar: string
  phone: string
  gender: number
  birthday: string
  school: string
  realName?: string
  studentId?: string
  major?: string
  grade?: string
  bio: string
  balance: number
  points: number
  followCount: number
  fansCount: number
  postCount: number
  status: 'active' | 'banned' | 'disabled' | 'muted'
  studentCertStatus: 'none' | 'pending' | 'approved' | 'rejected'
  studentCardImage: string
  tags: UserTag[]
  riskLevel: string
  riskTags: string[]
  muted: boolean
  muteEndAt: string
  muteReason: string
  lastLoginAt: string
  createdAt: string
  updatedAt: string
}

/** 后台用户扩展信息（钱包、交易、内容统计） */
export interface UserWalletInfo {
  balance: number
  frozenBalance: number
  totalRecharge: number
  totalSpent: number
  totalWithdraw: number
  totalIncome: number
}

export interface UserOrderStat {
  totalOrders: number
  completedOrders: number
  refundOrders: number
  totalSpent: number
}

export interface UserContentStat {
  totalPosts: number
  deletedPosts: number
  totalComments: number
  totalLikes: number
  reportCount: number
  reportedCount: number
}

export interface UserRiskInfo {
  level: 'low' | 'medium' | 'high' | 'black'
  tags: string[]
  lastCheckAt: string
  remark: string
}

/** 用户禁言信息 */
export interface UserMuteInfo {
  muted: boolean
  muteEndAt: string
  muteReason: string
}

/** 用户等级 */
export interface UserLevel {
  id: string
  regionId?: string
  levelNumber: number
  levelName: string
  levelPrefix?: string
  requiredExp: number
  isActive: boolean
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  fontSize?: number
  fontWeight?: string
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  prefixFontSize?: number
  prefixTextColor?: string
  levelDescription?: string
  levelBenefits?: string
  sortOrder: number
  createdAt: string
}

/** 用户标签定义 */
export interface UserTagDef {
  id: string
  regionId?: string
  tagName: string
  tagLevel: number
  tagColor?: string
  tagDesc?: string
  isSystem: boolean
  isActive: boolean
  displayOrder: number
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  fontSize?: number
  fontWeight?: string
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  usedCount?: number
  createdAt: string
}

/** 用户经验记录 */
export interface UserExperience {
  id: string
  userId: string
  user?: { id: string; nickname: string; avatar: string }
  changeAmount: number
  reason?: string
  beforeLevel?: string
  afterLevel?: string
  beforeExp: number
  afterExp: number
  createdAt: string
}

/** 用户等级信息 */
export interface UserLevelInfo {
  userId: string
  nickname: string
  avatar: string
  phone: string
  currentExp: number
  currentLevelName: string
  nextLevelName?: string
  nextExp: number
  maxLevel: boolean
}

/** 余额操作日志 */
export interface BalanceLog {
  id: string
  operatorId: string
  action: string
  userIds: string[]
  amount?: number
  reason?: string
  userCount: number
  totalAmount?: number
  ip?: string
  createdAt: string
}

/** 用户地址 */
export interface UserAddress {
  id: string
  userId: string
  user?: { id: string; nickname: string; avatar: string }
  name: string
  phone: string
  detail: string
  isDefault: boolean
  latitude?: number
  longitude?: number
  regionId?: string
  createdAt: string
}

/** 用户引导页 */
export interface UserGuidancePage {
  id: string
  regionId: string
  title: string
  content: string
  type: string
  sortOrder: number
  isShow: boolean
  createdAt: string
  updatedAt: string
}
