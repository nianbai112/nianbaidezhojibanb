import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const contentExtApi = {
  // =================== 匿名身份 ===================
  getAnonymousIdentities(params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/content-ext/anonymous-identities', { params })
  },
  createAnonymousIdentity(data: { name: string; avatar?: string }) {
    return request.post<ApiResponse>('/admin/content-ext/anonymous-identities', data)
  },
  updateAnonymousIdentity(id: string, data: { name?: string; avatar?: string }) {
    return request.put<ApiResponse>(`/admin/content-ext/anonymous-identities/${id}`, data)
  },
  deleteAnonymousIdentity(id: string) {
    return request.delete<ApiResponse>(`/admin/content-ext/anonymous-identities/${id}`)
  },

  // =================== 笔记海报配置 ===================
  getPosterConfig() {
    return request.get<ApiResponse>('/admin/content-ext/poster-config')
  },
  updatePosterConfig(data: any) {
    return request.put<ApiResponse>('/admin/content-ext/poster-config', data)
  },

  // =================== 奖励设置 ===================
  getRewardConfig() {
    return request.get<ApiResponse>('/admin/content-ext/reward-config')
  },
  updateRewardConfig(data: any) {
    return request.put<ApiResponse>('/admin/content-ext/reward-config', data)
  },
  getBadges(params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/content-ext/badges', { params })
  },
  createBadge(data: any) {
    return request.post<ApiResponse>('/admin/content-ext/badges', data)
  },
  deleteBadge(id: string) {
    return request.delete<ApiResponse>(`/admin/content-ext/badges/${id}`)
  },

  // =================== 通知记录 ===================
  getNotifications(params: PageParams & { userId?: string; type?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/content-ext/notifications', { params })
  },
  deleteNotification(id: string) {
    return request.delete<ApiResponse>(`/admin/content-ext/notifications/${id}`)
  },
}
