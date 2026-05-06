export type SecondHandStatus = 'ON_SALE' | 'SOLD' | 'OFFLINE'

export interface SecondHand {
  id: string
  userId: string
  regionId?: string
  regionName?: string
  title: string
  description?: string
  images: string[]
  price: number
  originPrice?: number
  category: string
  condition: string
  status: SecondHandStatus
  viewCount: number
  createdAt: string
  user?: { id: string; nickname: string; avatar: string; phone?: string }
  region?: { id: string; name: string }
}

export type SecondHandOrderStatus = 'pending_pay' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded'

export interface SecondHandOrder {
  id: string
  orderNo: string
  buyerId: string
  sellerId: string
  productId: string
  price: number
  status: SecondHandOrderStatus
  payChannel?: string
  payTime?: string
  createdAt: string
  user?: { id: string; nickname: string; avatar?: string }
}

export interface SecondHandRegionSetting {
  id: string
  regionId: string
  enableSecondHand: boolean
  maxListings?: number | null
  requirePhone: boolean
  requireAudit: boolean
  createdAt: string
  updatedAt: string
  region?: { name: string }
}
