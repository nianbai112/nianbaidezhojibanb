import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { TopupPackage, TopupOrder } from '@/types/topup'

export const topupApi = {
  getPackageList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<TopupPackage>>>('/admin/topup/packages', { params })
  },
  createPackage(data: Partial<TopupPackage>) {
    return request.post<ApiResponse>('/admin/topup/packages', data)
  },
  updatePackage(id: string, data: Partial<TopupPackage>) {
    return request.put<ApiResponse>(`/admin/topup/packages/${id}`, data)
  },
  deletePackage(id: string) {
    return request.delete<ApiResponse>(`/admin/topup/packages/${id}`)
  },
  getOrderList(params: PageParams & { orderNo?: string; status?: string; userId?: string }) {
    return request.get<ApiResponse<PageResult<TopupOrder>>>('/admin/topup/orders', { params })
  },
}
