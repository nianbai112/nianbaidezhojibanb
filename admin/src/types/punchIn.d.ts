export interface PunchInCategory {
  id: string
  name: string
  icon?: string
  sortOrder: number
  status: 'ENABLED' | 'DISABLED'
  locationCount?: number
  createdAt: string
  updatedAt: string
}

export interface PunchInLocation {
  id: string
  regionId: string
  categoryId?: string
  categoryName?: string
  name: string
  description?: string
  address?: string
  latitude?: number
  longitude?: number
  coverImage?: string
  images?: string[]
  videos?: string[]
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  isShared: boolean
  recordCount?: number
  commentCount?: number
  createdAt: string
  updatedAt: string
}

export interface PunchInRecord {
  id: string
  userId: string
  locationId?: string
  regionId: string
  date: string
  images?: string[]
  content?: string
  status: 'NORMAL' | 'DELETED'
  rewardValue: number
  isMakeup: boolean
  createdAt: string
  updatedAt: string
  User?: { id: string; nickname: string; avatar: string }
  location?: { id: string; name: string; address?: string }
}

export interface PunchInComment {
  id: string
  userId: string
  locationId: string
  content: string
  parentId?: string
  status: 'NORMAL' | 'DELETED'
  createdAt: string
  updatedAt: string
  User?: { id: string; nickname: string; avatar: string }
  location?: { id: string; name: string }
  _count?: { replies: number }
  replies?: PunchInComment[]
}

export interface PunchInConfig {
  id?: string
  regionId: string
  isEnabled: boolean
  maxDailyCheckins: number
  maxLocationCheckins: number
  minCheckinInterval: number
  allowDuplicateLocation: boolean
  requireLocationVerify: boolean
  locationVerifyRadius: number
  allowImageUpload: boolean
  maxImageCount: number
  allowVideoUpload: boolean
  maxContentLength: number
  requireContent: boolean
  allowComment: boolean
  allowReply: boolean
  maxCommentLength: number
  enableRanking: boolean
  rankingCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  enableSharedLocations: boolean
  enableUserSuggest: boolean
  workingHoursStart: string
  workingHoursEnd: string
  weekendEnabled: boolean
  holidayEnabled: boolean
  isDefault?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface PunchInStatsOverview {
  totalRecords: number
  todayRecords: number
  totalLocations: number
  totalUsers: number
}

export interface PunchInStatsTrend {
  date: string
  count: number
}

export interface PunchInStatsLocation {
  id: string
  name: string
  address?: string
  recordCount: number
}

