export interface StickerCategory {
  id: string
  name: string
  icon?: string
  sortOrder: number
  createdAt: string
}

export interface Sticker {
  id: string
  categoryId?: string
  categoryName?: string
  userId: string
  userName?: string
  name: string
  url: string
  thumbnail?: string
  isShared: boolean
  status: string
  createdAt: string
}
