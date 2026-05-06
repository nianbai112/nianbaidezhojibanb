import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { SecondHand, SecondHandOrder, SecondHandRegionSetting } from '@/types/secondHand'

export const secondHandApi = {
  // 商品管理
  getProductList(params: PageParams & { keyword?: string; status?: string; regionId?: string; category?: string }) {
    return request.get<ApiResponse<PageResult<SecondHand>>>('/admin/second-hand/products', { params })
  },
  getProductDetail(id: string) {
    return request.get<ApiResponse<SecondHand>>(`/admin/second-hand/products/${id}`)
  },
  updateStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/second-hand/products/${id}/status`, { status })
  },
  deleteProduct(id: string) {
    return request.delete<ApiResponse>(`/admin/second-hand/products/${id}`)
  },

  // 订单管理
  getOrderList(params: PageParams & { orderNo?: string; status?: string; buyerId?: string; sellerId?: string }) {
    return request.get<ApiResponse<PageResult<SecondHandOrder>>>('/admin/second-hand/orders', { params })
  },
  getOrderDetail(id: string) {
    return request.get<ApiResponse<SecondHandOrder>>(`/admin/second-hand/orders/${id}`)
  },

  // 区域配置
  getRegionSettingsList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<SecondHandRegionSetting>>>('/admin/second-hand/settings', { params })
  },
  getRegionSetting(regionId: string) {
    return request.get<ApiResponse<SecondHandRegionSetting>>(`/admin/second-hand/settings/${regionId}`)
  },
  saveRegionSetting(regionId: string, data: Partial<SecondHandRegionSetting>) {
    return request.put<ApiResponse>(`/admin/second-hand/settings/${regionId}`, data)
  },
}
