import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const netdiskApi = {
  // ================= 分类管理 =================
  getCategoryList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/categories', { params })
  },
  createCategory(data: any) {
    return request.post<ApiResponse>('/admin/netdisk/categories', data)
  },
  updateCategory(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/netdisk/categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/netdisk/categories/${id}`)
  },

  // ================= 平台管理 =================
  getPlatformList(params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/platforms', { params })
  },
  createPlatform(data: any) {
    return request.post<ApiResponse>('/admin/netdisk/platforms', data)
  },
  updatePlatform(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/netdisk/platforms/${id}`, data)
  },
  deletePlatform(id: string) {
    return request.delete<ApiResponse>(`/admin/netdisk/platforms/${id}`)
  },

  // ================= 资源管理 =================
  getResourceList(params: PageParams & { categoryId?: string; platformId?: string; keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/resources', { params })
  },
  getResourceDetail(id: string) {
    return request.get<ApiResponse<any>>(`/admin/netdisk/resources/${id}`)
  },
  createResource(data: any) {
    return request.post<ApiResponse>('/admin/netdisk/resources', data)
  },
  updateResource(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/netdisk/resources/${id}`, data)
  },
  updateResourceStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/netdisk/resources/${id}/status`, { status })
  },
  deleteResource(id: string) {
    return request.delete<ApiResponse>(`/admin/netdisk/resources/${id}`)
  },

  // ================= 评论管理 =================
  getCommentList(params: PageParams & { resourceId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/comments', { params })
  },
  updateCommentStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/netdisk/comments/${id}/status`, { status })
  },
  deleteComment(id: string) {
    return request.delete<ApiResponse>(`/admin/netdisk/comments/${id}`)
  },

  // ================= 下载记录 =================
  getDownloadList(params: PageParams & { resourceId?: string; userId?: string; paid?: boolean }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/downloads', { params })
  },

  // ================= 收益配置 =================
  getProfitConfig(regionId: string) {
    return request.get<ApiResponse>('/admin/netdisk/profit-config', { params: { regionId } })
  },
  updateProfitConfig(regionId: string, data: any) {
    return request.put<ApiResponse>('/admin/netdisk/profit-config', data, { params: { regionId } })
  },

  // ================= 举报管理 =================
  getReportList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/netdisk/reports', { params })
  },
  handleReport(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/netdisk/reports/${id}`, { status })
  },
}
