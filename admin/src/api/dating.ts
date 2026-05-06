import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { DatingConfig, DatingProfile, DatingPackage, DatingOrder, MatchRecord, DatingReport } from '@/types/dating'

export const datingApi = {
  // Config
  getConfigList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<DatingConfig>>>('/admin/dating/configs', { params })
  },
  updateConfig(id: string, data: Partial<DatingConfig>) {
    return request.put<ApiResponse>(`/admin/dating/configs/${id}`, data)
  },

  // Profile
  getProfileList(params: PageParams & { keyword?: string; auditStatus?: string; gender?: string }) {
    return request.get<ApiResponse<PageResult<DatingProfile>>>('/admin/dating/profiles', { params })
  },
  auditProfile(id: string, data: { auditStatus: string; auditRemark?: string }) {
    return request.put<ApiResponse>(`/admin/dating/profiles/${id}/audit`, data)
  },

  // Match
  getMatchList(params: PageParams & { userId?: string; status?: string; matchType?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<MatchRecord>>>('/admin/dating/matches', { params })
  },

  // Package
  getPackageList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<DatingPackage>>>('/admin/dating/packages', { params })
  },
  createPackage(data: Partial<DatingPackage>) {
    return request.post<ApiResponse>('/admin/dating/packages', data)
  },
  updatePackage(id: string, data: Partial<DatingPackage>) {
    return request.put<ApiResponse>(`/admin/dating/packages/${id}`, data)
  },
  deletePackage(id: string) {
    return request.delete<ApiResponse>(`/admin/dating/packages/${id}`)
  },

  // Order
  getOrderList(params: PageParams & { status?: string; userId?: string; orderNo?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<DatingOrder>>>('/admin/dating/orders', { params })
  },
  refundOrder(id: string, reason: string) {
    return request.post<ApiResponse>(`/admin/dating/orders/${id}/refund`, { reason })
  },

  // Report
  getReportList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult<DatingReport>>>('/admin/dating/reports', { params })
  },
  handleReport(id: string, data: { status: string; result?: string }) {
    return request.post<ApiResponse>(`/admin/dating/reports/${id}/handle`, data)
  },

  // Cache
  getCacheInfo() {
    return request.get<ApiResponse<{ keys: { key: string; ttl: number }[]; total: number }>>('/admin/dating/cache')
  },
  clearCache(key?: string) {
    return request.post<ApiResponse>('/admin/dating/cache/clear', { key })
  },
}
