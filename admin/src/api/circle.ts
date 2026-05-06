import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const circleApi = {
  // ================= 社群列表 =================
  getCircles(params: PageParams & { regionId?: string; keyword?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/circles', { params })
  },
  updateCircle(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/circles/${id}`, data)
  },
  dissolveCircle(id: string) {
    return request.delete<ApiResponse>(`/admin/circles/${id}/dissolve`)
  },

  // ================= 成员管理 =================
  getCircleMembers(circleId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>(`/admin/circles/${circleId}/members`, { params })
  },
  removeMember(memberId: string) {
    return request.delete<ApiResponse>(`/admin/circles/members/${memberId}`)
  },

  // ================= 区域配置 =================
  getCircleConfig(regionId: string) {
    return request.get<ApiResponse>('/admin/circles/config', { params: { regionId } })
  },
  updateCircleConfig(regionId: string, data: any) {
    return request.put<ApiResponse>('/admin/circles/config', data, { params: { regionId } })
  },
}
