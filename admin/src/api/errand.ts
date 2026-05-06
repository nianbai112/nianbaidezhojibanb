import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const errandApi = {
  // 页面配置 / 计费配置
  getConfig(regionId: string) {
    return request.get<ApiResponse>('/admin/errand/config', { params: { regionId } })
  },
  saveConfig(regionId: string, data: any) {
    return request.put<ApiResponse>('/admin/errand/config', data, { params: { regionId } })
  },

  // 物品大小
  getItemSizeList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/errand/item-sizes', { params })
  },
  createItemSize(data: any) {
    return request.post<ApiResponse>('/admin/errand/item-sizes', data)
  },
  updateItemSize(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/errand/item-sizes/${id}`, data)
  },
  deleteItemSize(id: string) {
    return request.delete<ApiResponse>(`/admin/errand/item-sizes/${id}`)
  },

  // 取件点管理
  getPickupPointList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/errand/pickup-points', { params })
  },
  createPickupPoint(data: any) {
    return request.post<ApiResponse>('/admin/errand/pickup-points', data)
  },
  updatePickupPoint(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/errand/pickup-points/${id}`, data)
  },
  deletePickupPoint(id: string) {
    return request.delete<ApiResponse>(`/admin/errand/pickup-points/${id}`)
  },

  // 统计分析
  getDeliveryStats(regionId?: string) {
    return request.get<ApiResponse>('/admin/errand/stats', { params: { regionId } })
  }
}
