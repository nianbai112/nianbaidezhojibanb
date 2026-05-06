export interface UserTitle {
  id: string
  regionId?: string
  name: string
  icon?: string
  description?: string
  type: string
  condition?: string
  sortOrder: number
  createdAt: string
  _count?: { records: number }
}

export interface UserTitleRedeemCode {
  id: string
  titleId: string
  code: string
  isUsed: boolean
  usedBy?: string
  usedAt?: string
  expireAt?: string
  createdAt: string
}
