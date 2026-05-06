export interface ContactCategory {
  id: string
  regionId?: string
  name: string
  icon?: string
  sortOrder: number
  createdAt: string
}

export interface Contact {
  id: string
  categoryId: string
  categoryName?: string
  name: string
  phone?: string
  address?: string
  remark?: string
  isPublic: boolean
  createdAt: string
}
