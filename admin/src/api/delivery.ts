import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { DeliveryOrder, ErrandFeeConfig, ErrandPageConfig, ErrandRewardPunish } from '@/types/delivery'

export const deliveryApi = {
  // ==================== 骑手 ====================
  getRiderList(params: PageParams & { keyword?: string; auditStatus?: string; status?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/riders', { params })
  },
  getRiderDetail(id: string) {
    return request.get<ApiResponse>(`/admin/riders/${id}`)
  },
  auditRider(id: string, data: { status: string; remark?: string }) {
    return request.put<ApiResponse>(`/admin/riders/${id}/audit`, data)
  },
  updateRiderStatus(id: string, data: { status: string }) {
    return request.put<ApiResponse>(`/admin/riders/${id}/status`, data)
  },
  getRiderRecords(riderId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult>>(`/admin/riders/${riderId}/records`, { params })
  },

  // ==================== 跑腿订单 ====================
  getOrderList(params: PageParams & { orderNo?: string; status?: string; userId?: string; riderId?: string; regionId?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<DeliveryOrder>>>('/admin/errand/orders', { params })
  },
  getOrderDetail(id: string) {
    return request.get<ApiResponse<DeliveryOrder>>(`/admin/errand/orders/${id}`)
  },
  cancelOrder(id: string, data: { reason?: string }) {
    return request.put<ApiResponse>(`/admin/errand/orders/${id}/cancel`, data)
  },
  assignOrder(orderId: string, data: { riderId: string }) {
    return request.post<ApiResponse>(`/admin/errand/orders/${orderId}/assign`, data)
  },
  getOrderTimeline(orderId: string) {
    return request.get<ApiResponse>(`/admin/errand/orders/${orderId}/timeline`)
  },

  // ==================== 计费配置 ====================
  getFeeConfig(regionId: string) {
    return request.get<ApiResponse<ErrandFeeConfig>>('/admin/errand/fee-config', { params: { regionId } })
  },
  saveFeeConfig(regionId: string, data: Partial<ErrandFeeConfig>) {
    return request.put<ApiResponse>('/admin/errand/fee-config', data, { params: { regionId } })
  },

  // ==================== 页面配置 ====================
  getPageConfig(regionId: string) {
    return request.get<ApiResponse<ErrandPageConfig>>('/admin/errand/page-config', { params: { regionId } })
  },
  savePageConfig(regionId: string, data: Partial<ErrandPageConfig>) {
    return request.put<ApiResponse>('/admin/errand/page-config', data, { params: { regionId } })
  },

  // ==================== 奖惩配置 ====================
  getRewardPunish(regionId: string) {
    return request.get<ApiResponse<ErrandRewardPunish>>('/admin/errand/reward-punish', { params: { regionId } })
  },
  saveRewardPunish(regionId: string, data: Partial<ErrandRewardPunish>) {
    return request.put<ApiResponse>('/admin/errand/reward-punish', data, { params: { regionId } })
  },

  // ==================== 物品大小 / 取件点 / 统计（已有完整后端，通过 errand.ts 调用） ====================
}
