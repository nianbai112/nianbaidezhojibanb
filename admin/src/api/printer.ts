import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { Printer } from '@/types/printer'

export const printerApi = {
  getList(params: PageParams & { merchantId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<Printer>>>('/admin/printers', { params })
  },
  updateStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/printers/${id}/status`, { status })
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/printers/${id}`)
  },
}
