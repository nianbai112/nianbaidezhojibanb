import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const photoContestApi = {
  // ==================== 评选项目 ====================
  getContests(params: PageParams & { regionId?: string; status?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/photo-contests', { params })
  },
  getContestDetail(id: string) {
    return request.get<ApiResponse>(`/admin/photo-contests/${id}`)
  },
  createContest(data: any) {
    return request.post<ApiResponse>('/admin/photo-contests', data)
  },
  updateContest(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/photo-contests/${id}`, data)
  },
  deleteContest(id: string) {
    return request.delete<ApiResponse>(`/admin/photo-contests/${id}`)
  },

  // ==================== 作品管理 ====================
  getEntries(params: PageParams & { contestId?: string; status?: string; keyword?: string; userId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/photo-contests/entries', { params })
  },
  getPendingEntries(params: PageParams & { contestId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/photo-contests/entries/pending', { params })
  },
  auditEntry(id: string, data: { status: string; rejectReason?: string }) {
    return request.put<ApiResponse>(`/admin/photo-contests/entries/${id}/audit`, data)
  },
  batchAuditEntries(data: { ids: string[]; status: string; rejectReason?: string }) {
    return request.post<ApiResponse>('/admin/photo-contests/entries/batch-audit', data)
  },
  deleteEntry(id: string) {
    return request.delete<ApiResponse>(`/admin/photo-contests/entries/${id}`)
  },

  // ==================== 投票统计 ====================
  getVoteStats(contestId: string) {
    return request.get<ApiResponse>(`/admin/photo-contests/${contestId}/vote-stats`)
  },

  // ==================== 评分管理 ====================
  getRatings(params: PageParams & { contestId?: string; entryId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/photo-contests/ratings', { params })
  },
  auditRating(id: string, data: { status: string }) {
    return request.put<ApiResponse>(`/admin/photo-contests/ratings/${id}/audit`, data)
  },

  // ==================== 获奖管理 ====================
  getWinners(contestId: string) {
    return request.get<ApiResponse>(`/admin/photo-contests/${contestId}/winners`)
  },
  createWinner(data: any) {
    return request.post<ApiResponse>('/admin/photo-contests/winners', data)
  },
  updateWinner(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/photo-contests/winners/${id}`, data)
  },
  deleteWinner(id: string) {
    return request.delete<ApiResponse>(`/admin/photo-contests/winners/${id}`)
  },

  // ==================== 区域设置 ====================
  getRegionSettings(regionId?: string) {
    return request.get<ApiResponse>('/admin/photo-contests/region-settings', { params: { regionId } })
  },
  updateRegionSettings(regionId: string, data: any) {
    return request.put<ApiResponse>('/admin/photo-contests/region-settings', data, { params: { regionId } })
  },

  // ==================== 仪表盘 ====================
  getDashboardStats(regionId?: string) {
    return request.get<ApiResponse>('/admin/photo-contests/dashboard/stats', { params: { regionId } })
  },
}
