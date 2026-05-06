import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const communityApi = {
  // ================= 社群列表 =================
  getList(params: PageParams & { regionId?: string; keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/circles', { params })
  },
  create(data: any) {
    return request.post<ApiResponse>('/admin/circles', data)
  },
  update(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/circles/${id}`, data)
  },
  updateStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/circles/${id}/status`, { status })
  },
  dissolve(id: string) {
    return request.put<ApiResponse>(`/admin/circles/${id}/dissolve`)
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/circles/${id}`)
  },

  // ================= 成员管理 =================
  getMembers(circleId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>(`/admin/circles/${circleId}/members`, { params })
  },
  removeMember(memberId: string) {
    return request.delete<ApiResponse>(`/admin/circles/members/${memberId}`)
  },

  // ================= 购买记录 =================
  getPayments(params: PageParams & { circleId?: string; status?: string; userId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/circles/payments', { params })
  },

  // ================= 区域配置 =================
  getRegionConfig(regionId: string) {
    return request.get<ApiResponse>('/admin/circles/config', { params: { regionId } })
  },
  updateRegionConfig(regionId: string, data: any) {
    return request.put<ApiResponse>('/admin/circles/config', data, { params: { regionId } })
  },
}
