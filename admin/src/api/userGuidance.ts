import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { UserGuidancePage } from '@/types/userGuidance'

export const userGuidanceApi = {
  getList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<UserGuidancePage>>>('/admin/user-guidance/pages', { params })
  },
  create(data: Partial<UserGuidancePage>) {
    return request.post<ApiResponse>('/admin/user-guidance/pages', data)
  },
  update(id: string, data: Partial<UserGuidancePage>) {
    return request.put<ApiResponse>(`/admin/user-guidance/pages/${id}`, data)
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/user-guidance/pages/${id}`)
  },
}
