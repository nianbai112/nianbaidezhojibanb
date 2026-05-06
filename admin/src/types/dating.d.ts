export interface DatingConfig {
  id: string
  regionId: string
  isOpen: boolean
  price: number
  dailyMatchLimit: number
  requireAudit: boolean
  matchRules?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface DatingProfile {
  id: string
  userId: string
  photos?: string[]
  bio?: string
  tags?: string[]
  isOpen: boolean
  auditStatus: string
  auditRemark?: string
  createdAt: string
  updatedAt: string
  user?: {
    id: string
    nickname: string
    avatar: string
    profile?: {
      gender: string
      birthday: string
      school: string
      major: string
      grade: string
      bio: string
    }
  }
}

export interface MatchRecord {
  id: string
  userId: string
  targetId: string
  status: string
  matchType: string
  createdAt: string
  updatedAt: string
  user?: { id: string; nickname: string; avatar: string }
  target?: { id: string; nickname: string; avatar: string }
}

export interface DatingPackage {
  id: string
  regionId?: string
  region?: { id: string; name: string }
  name: string
  price: number
  matchCount: number
  validDays?: number
  sortOrder: number
  description?: string
  rights?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface DatingOrder {
  id: string
  orderNo: string
  userId: string
  User?: { id: string; nickname: string; avatar: string }
  packageId: string
  package?: { id: string; name: string }
  amount: number
  status: string
  payChannel?: string
  payTime?: string
  refundReason?: string
  refundTime?: string
  createdAt: string
  updatedAt: string
}

export interface DatingReport {
  id: string
  reporterId: string
  reporter?: { id: string; nickname: string; avatar: string }
  targetId: string
  target?: { id: string; nickname: string; avatar: string }
  reason: string
  detail?: string
  images?: string[]
  status: string
  result?: string
  handlerId?: string
  handledAt?: string
  createdAt: string
  updatedAt: string
}
