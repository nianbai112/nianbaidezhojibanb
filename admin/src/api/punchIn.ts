import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type {
  PunchInCategory,
  PunchInLocation,
  PunchInRecord,
  PunchInComment,
  PunchInConfig,
  PunchInStatsOverview,
  PunchInStatsTrend,
  PunchInStatsLocation,
} from '@/types/punchIn'

// ==================== 分类管理 ====================
export const punchInApi = {
  getCategoryList(params: PageParams & { keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<PunchInCategory>>>('/admin/punch/categories', { params })
  },
  getCategory(id: string) {
    return request.get<ApiResponse<PunchInCategory>>(`/admin/punch/categories/${id}`)
  },
  createCategory(data: Partial<PunchInCategory>) {
    return request.post<ApiResponse>('/admin/punch/categories', data)
  },
  updateCategory(id: string, data: Partial<PunchInCategory>) {
    return request.put<ApiResponse>(`/admin/punch/categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/punch/categories/${id}`)
  },

  // ==================== 地点管理 ====================
  getLocationList(params: PageParams & { keyword?: string; regionId?: string; categoryId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<PunchInLocation>>>('/admin/punch/locations', { params })
  },
  getLocation(id: string) {
    return request.get<ApiResponse<PunchInLocation>>(`/admin/punch/locations/${id}`)
  },
  createLocation(data: Partial<PunchInLocation>) {
    return request.post<ApiResponse>('/admin/punch/locations', data)
  },
  updateLocation(id: string, data: Partial<PunchInLocation>) {
    return request.put<ApiResponse>(`/admin/punch/locations/${id}`, data)
  },
  deleteLocation(id: string) {
    return request.delete<ApiResponse>(`/admin/punch/locations/${id}`)
  },

  // ==================== 打卡记录 ====================
  getRecordList(params: PageParams & { userId?: string; locationId?: string; regionId?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<PunchInRecord>>>('/admin/punch/records', { params })
  },
  getRecord(id: string) {
    return request.get<ApiResponse<PunchInRecord>>(`/admin/punch/records/${id}`)
  },
  deleteRecord(id: string) {
    return request.delete<ApiResponse>(`/admin/punch/records/${id}`)
  },

  // ==================== 评论管理 ====================
  getCommentList(params: PageParams & { userId?: string; locationId?: string; status?: string; keyword?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<PunchInComment>>>('/admin/punch/comments', { params })
  },
  getComment(id: string) {
    return request.get<ApiResponse<PunchInComment>>(`/admin/punch/comments/${id}`)
  },
  deleteComment(id: string) {
    return request.delete<ApiResponse>(`/admin/punch/comments/${id}`)
  },

  // ==================== 区域配置 ====================
  getConfigList(params: PageParams & { isEnabled?: string }) {
    return request.get<ApiResponse<PageResult<PunchInConfig>>>('/admin/punch/configs', { params })
  },
  getConfig(regionId: string) {
    return request.get<ApiResponse<PunchInConfig>>(`/admin/punch/configs/${regionId}`)
  },
  updateConfig(regionId: string, data: Partial<PunchInConfig>) {
    return request.put<ApiResponse>(`/admin/punch/configs/${regionId}`, data)
  },
  deleteConfig(regionId: string) {
    return request.delete<ApiResponse>(`/admin/punch/configs/${regionId}`)
  },

  // ==================== 数据统计 ====================
  getStatsOverview() {
    return request.get<ApiResponse<PunchInStatsOverview>>('/admin/punch/stats/overview')
  },
  getStatsTrends(days?: number) {
    return request.get<ApiResponse<PunchInStatsTrend[]>>('/admin/punch/stats/trends', { params: { days } })
  },
  getStatsLocations(top?: number) {
    return request.get<ApiResponse<PunchInStatsLocation[]>>('/admin/punch/stats/locations', { params: { top } })
  },

}
