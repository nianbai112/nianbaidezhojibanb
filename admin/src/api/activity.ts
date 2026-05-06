import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const activityApi = {
  // ==================== Activities ====================
  getActivities(params: PageParams & { regionId?: string; status?: string; keyword?: string; typeId?: string; clubId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/activities', { params })
  },
  getActivityDetail(id: string) {
    return request.get<ApiResponse>(`/admin/activities/${id}`)
  },
  createActivity(data: any) {
    return request.post<ApiResponse>('/admin/activities', data)
  },
  updateActivity(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/activities/${id}`, data)
  },
  deleteActivity(id: string) {
    return request.delete<ApiResponse>(`/admin/activities/${id}`)
  },

  // ==================== Activity Types ====================
  getActivityTypes(params: PageParams & { regionId?: string; keyword?: string; isActive?: boolean }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/activities/types/list', { params })
  },
  createActivityType(data: any) {
    return request.post<ApiResponse>('/admin/activities/types', data)
  },
  updateActivityType(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/activities/types/${id}`, data)
  },
  deleteActivityType(id: string) {
    return request.delete<ApiResponse>(`/admin/activities/types/${id}`)
  },

  // ==================== Packages ====================
  getActivityPackages(params: PageParams & { activityId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/activities/packages/list', { params })
  },
  createActivityPackage(data: any) {
    return request.post<ApiResponse>('/admin/activities/packages', data)
  },
  updateActivityPackage(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/activities/packages/${id}`, data)
  },
  deleteActivityPackage(id: string) {
    return request.delete<ApiResponse>(`/admin/activities/packages/${id}`)
  },

  // ==================== Orders ====================
  getActivityOrders(params: PageParams & { activityId?: string; orderNo?: string; payStatus?: string; orderStatus?: string; refundStatus?: string; userId?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/activities/orders', { params })
  },
  getActivityOrderDetail(id: string) {
    return request.get<ApiResponse>(`/admin/activities/orders/${id}`)
  },
  auditOrderRefund(id: string, data: { status: string; reason?: string }) {
    return request.put<ApiResponse>(`/admin/activities/orders/${id}/refund-audit`, data)
  },

  // ==================== Rewards ====================
  getActivityRewards(params: PageParams & { activityId?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/activities/rewards', { params })
  },
  createActivityReward(data: any) {
    return request.post<ApiResponse>('/admin/activities/rewards', data)
  },
  updateActivityReward(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/activities/rewards/${id}`, data)
  },
  deleteActivityReward(id: string) {
    return request.delete<ApiResponse>(`/admin/activities/rewards/${id}`)
  },

  // ==================== Participants ====================
  getParticipants(activityId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<any>>>(`/admin/activities/${activityId}/participants`, { params })
  },
}
