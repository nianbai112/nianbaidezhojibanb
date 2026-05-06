export interface NetDiskCategory {
  id: string
  regionId?: string
  name: string
  icon?: string
  sortOrder: number
  createdAt: string
  _count?: { resources: number }
}

export interface NetDiskPlatform {
  id: string
  name: string
  icon?: string
  baseUrl?: string
  sortOrder: number
  createdAt: string
  _count?: { resources: number }
}

export interface NetDiskResource {
  id: string
  userId: string
  categoryId?: string
  platformId?: string
  title: string
  cover?: string
  description?: string
  url: string
  extractCode?: string
  price?: number
  size: number
  type: string
  isShared: boolean
  status: string
  downloadCount: number
  favoriteCount: number
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string }
  platform?: { id: string; name: string }
  User?: { id: string; nickname: string; avatar: string; phone?: string }
}

export interface NetDiskComment {
  id: string
  resourceId: string
  userId: string
  content: string
  status: string
  createdAt: string
  user?: { id: string; nickname: string; avatar: string }
  resource?: { id: string; title: string }
}

export interface NetDiskDownload {
  id: string
  resourceId: string
  userId: string
  ip?: string
  paid: boolean
  createdAt: string
  user?: { id: string; nickname: string; avatar: string }
  resource?: { id: string; title: string; price?: number }
}

export interface NetDiskProfitConfig {
  id: string
  regionId: string
  platformCommission: number
  regionCommission: number
  authorShare: number
}
