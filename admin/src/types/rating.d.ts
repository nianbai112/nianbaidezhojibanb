export interface RatingCategory {
  id: string
  regionId?: string
  name: string
  icon?: string
  description?: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: { items: number }
  items?: RatingItem[]
}

export interface RatingItem {
  id: string
  categoryId: string
  categoryName?: string
  category?: { id: string; name: string }
  regionId?: string
  name: string
  cover?: string
  description?: string
  avgScore: number
  ratingCount: number
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface UserRating {
  id: string
  itemId: string
  itemName?: string
  item?: { id: string; name: string }
  userId: string
  regionId?: string
  score: number
  content?: string
  images?: string[]
  likes: number
  status: string
  createdAt: string
  updatedAt: string
  User?: { id: string; nickname: string; avatar: string }
}

export interface RatingReply {
  id: string
  ratingId: string
  rating?: { id: string; score: number; item?: { id: string; name: string } }
  userId: string
  user?: { id: string; nickname: string; avatar: string }
  content: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface RatingRegionSetting {
  regionId: string
  regionName: string
  enableRating: boolean
  enableDynamic: boolean
  requireLoginToRate: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface RatingDashboard {
  totalRatings: number
  avgScore: number
  totalItems: number
  totalCategories: number
  scoreDistribution: number[]
  recentRatings: UserRating[]
}
