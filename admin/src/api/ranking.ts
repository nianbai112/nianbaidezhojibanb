import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { Ranking } from '@/types/ranking'

export const rankingApi = {
  getList(params: PageParams & { type?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult<Ranking>>>('/admin/rankings', { params })
  },
  create(data: Partial<Ranking>) {
    return request.post<ApiResponse>('/admin/rankings', data)
  },
  update(id: string, data: Partial<Ranking>) {
    return request.put<ApiResponse>(`/admin/rankings/${id}`, data)
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/rankings/${id}`)
  },
}
