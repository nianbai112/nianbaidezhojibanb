import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { DriftBottle } from '@/types/driftBottle'

export const driftBottleApi = {
  getBottleList(params: PageParams & { keyword?: string }) {
    return request.get<ApiResponse<PageResult<DriftBottle>>>('/admin/drift-bottles', { params })
  },
  deleteBottle(id: string) {
    return request.delete<ApiResponse>(`/admin/drift-bottles/${id}`)
  },
}
