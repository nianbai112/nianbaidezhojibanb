import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { UserTitle, UserTitleRedeemCode } from '@/types/userTitle'

export const userTitleApi = {
  getList(params: PageParams & { regionId?: string; type?: string }) {
    return request.get<ApiResponse<PageResult<UserTitle>>>('/admin/user-titles', { params })
  },
  create(data: Partial<UserTitle>) {
    return request.post<ApiResponse>('/admin/user-titles', data)
  },
  update(id: string, data: Partial<UserTitle>) {
    return request.put<ApiResponse>(`/admin/user-titles/${id}`, data)
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/user-titles/${id}`)
  },
  getRedeemCodeList(titleId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<UserTitleRedeemCode>>>(`/admin/user-titles/${titleId}/redeem-codes`, { params })
  },
  generateRedeemCodes(titleId: string, count: number) {
    return request.post<ApiResponse>(`/admin/user-titles/${titleId}/redeem-codes`, { count })
  },
}
