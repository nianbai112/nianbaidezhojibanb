import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export interface GroupBuyStats {
  totalPackages: number
  activePackages: number
  totalOrders: number
  todayOrders: number
  totalRevenue: number
  verifyRate: string
  refundRate: string
  trends: { date: string; count: number }[]
  topPackages: { id: string; name: string; soldCount: number; price: number }[]
}

export interface GroupBuyConfig {
  isOpen: boolean
  requireAudit: boolean
  commissionRate: number
  regionCommissionRate: number
  description: string
}

export interface GroupBuyPackage {
  id: string
  regionId?: string
  categoryId?: string
  merchantId?: string
  name: string
  cover?: string
  images?: string[]
  description?: string
  detail?: string
  buyNotes?: string
  verifyInfo?: string
  price: number
  originPrice?: number
  stock: number
  soldCount: number
  startAt: string
  endAt: string
  status: string
  commissionRate?: number
  regionCommissionRate?: number
  createdAt: string
  updatedAt: string
  Category?: { id: string; name: string }
  Merchant?: { id: string; name: string }
}

export interface GroupBuyOrder {
  id: string
  orderNo: string
  userId: string
  packageId: string
  amount: number
  quantity: number
  status: string
  payChannel?: string
  payTime?: string
  verifyCode?: string
  verifyStatus?: string
  verifyTime?: string
  refundReason?: string
  refundAmount?: number
  refundTime?: string
  commissionAmount?: number
  regionCommissionAmount?: number
  buyerName?: string
  buyerPhone?: string
  remark?: string
  createdAt: string
  updatedAt: string
  User?: { id: string; nickname: string; avatar?: string }
  Package?: { id: string; name: string }
}

export interface GroupBuyReview {
  id: string
  userId: string
  packageId: string
  orderId?: string
  rating: number
  content?: string
  images?: string[]
  status: string
  reply?: string
  replyAt?: string
  isHidden: boolean
  createdAt: string
  updatedAt: string
  User?: { id: string; nickname: string; avatar?: string }
  Package?: { id: string; name: string }
  Order?: { id: string; orderNo: string }
}

export const groupBuyApi = {
  // ================= 概览统计 (Overview) =================
  getAdminStats(regionId?: string) {
    return request.get<ApiResponse<GroupBuyStats>>('/admin/group-buy/stats', { params: { regionId } })
  },

  // ================= 区域设置 (Config) =================
  getAdminConfig(regionId: string) {
    return request.get<ApiResponse<GroupBuyConfig>>('/admin/group-buy/config', { params: { regionId } })
  },
  updateAdminConfig(regionId: string, data: Partial<GroupBuyConfig>) {
    return request.put<ApiResponse>('/admin/group-buy/config', data, { params: { regionId } })
  },

  // ================= 分类管理 (Category) =================
  getCategories(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/group-buy/categories', { params })
  },
  createCategory(data: any) {
    return request.post<ApiResponse>('/admin/group-buy/categories', data)
  },
  updateCategory(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/group-buy/categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/group-buy/categories/${id}`)
  },

  // ================= 套餐管理 (Package) =================
  getPackages(params: PageParams & { regionId?: string; categoryId?: string; merchantId?: string; keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<GroupBuyPackage>>>('/admin/group-buy/packages', { params })
  },
  createPackage(data: any) {
    return request.post<ApiResponse>('/admin/group-buy/packages', data)
  },
  updatePackage(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/group-buy/packages/${id}`, data)
  },
  deletePackage(id: string) {
    return request.delete<ApiResponse>(`/admin/group-buy/packages/${id}`)
  },

  // ================= 订单管理 (Order) =================
  getOrders(params: PageParams & { regionId?: string; orderNo?: string; status?: string; startAt?: string; endAt?: string }) {
    return request.get<ApiResponse<PageResult<GroupBuyOrder>>>('/admin/group-buy/orders', { params })
  },
  getOrderDetail(id: string) {
    return request.get<ApiResponse<GroupBuyOrder>>(`/admin/group-buy/orders/${id}`)
  },
  verifyOrder(id: string, code: string) {
    return request.post<ApiResponse>(`/admin/group-buy/orders/${id}/verify`, { code })
  },
  refundOrder(id: string, data: { reason: string; amount?: number }) {
    return request.post<ApiResponse>(`/admin/group-buy/orders/${id}/refund`, data)
  },

  // ================= 评价管理 (Review) =================
  getReviews(params: PageParams & { regionId?: string; rating?: number; status?: string }) {
    return request.get<ApiResponse<PageResult<GroupBuyReview>>>('/admin/group-buy/reviews', { params })
  },
  auditReview(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/group-buy/reviews/${id}/audit`, { status })
  },
  replyReview(id: string, reply: string) {
    return request.put<ApiResponse>(`/admin/group-buy/reviews/${id}/reply`, { reply })
  },
  deleteReview(id: string) {
    return request.delete<ApiResponse>(`/admin/group-buy/reviews/${id}`)
  }
}
