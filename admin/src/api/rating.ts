import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { RatingCategory, RatingItem, UserRating, RatingReply, RatingRegionSetting, RatingDashboard } from '@/types/rating'

export const ratingApi = {
  // ==================== Dashboard ====================
  getDashboard(regionId?: string) {
    return request.get<ApiResponse<RatingDashboard>>('/admin/ratings/dashboard', { params: { regionId } })
  },

  // ==================== Region Settings ====================
  getSettings(params?: PageParams) {
    return request.get<ApiResponse<PageResult<RatingRegionSetting>>>('/admin/ratings/settings', { params })
  },
  getSetting(regionId: string) {
    return request.get<ApiResponse<RatingRegionSetting>>(`/admin/ratings/settings/${regionId}`)
  },
  updateSetting(regionId: string, data: Partial<RatingRegionSetting>) {
    return request.put<ApiResponse>(`/admin/ratings/settings/${regionId}`, data)
  },

  // ==================== Categories ====================
  getCategoryList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<RatingCategory>>>('/admin/ratings/categories', { params })
  },
  createCategory(data: Partial<RatingCategory>) {
    return request.post<ApiResponse>('/admin/ratings/categories', data)
  },
  updateCategory(id: string, data: Partial<RatingCategory>) {
    return request.put<ApiResponse>(`/admin/ratings/categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/ratings/categories/${id}`)
  },

  // ==================== Items ====================
  getItemList(params: PageParams & { categoryId?: string; regionId?: string; keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<RatingItem>>>('/admin/ratings/items', { params })
  },
  createItem(data: Partial<RatingItem>) {
    return request.post<ApiResponse>('/admin/ratings/items', data)
  },
  updateItem(id: string, data: Partial<RatingItem>) {
    return request.put<ApiResponse>(`/admin/ratings/items/${id}`, data)
  },
  deleteItem(id: string) {
    return request.delete<ApiResponse>(`/admin/ratings/items/${id}`)
  },

  // ==================== Records ====================
  getRecordList(params: PageParams & { itemId?: string; userId?: string; regionId?: string; scoreMin?: number; scoreMax?: number; keyword?: string }) {
    return request.get<ApiResponse<PageResult<UserRating>>>('/admin/ratings/records', { params })
  },
  deleteRecord(id: string) {
    return request.delete<ApiResponse>(`/admin/ratings/records/${id}`)
  },

  // ==================== Replies ====================
  getReplyList(params: PageParams & { ratingId?: string; userId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<RatingReply>>>('/admin/ratings/replies', { params })
  },
  auditReply(id: string, data: { status: string; reason?: string }) {
    return request.put<ApiResponse>(`/admin/ratings/replies/${id}/audit`, data)
  },
  deleteReply(id: string) {
    return request.delete<ApiResponse>(`/admin/ratings/replies/${id}`)
  },
}
