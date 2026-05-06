import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { ShareSettings, ShareInvite, ShareReward, ShareStatsOverview } from '@/types/marketing'

export const marketingApi = {
  // 优惠券 → 后端 admin/coupons
  getCouponList(params: PageParams & { keyword?: string; type?: string; status?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/coupons', { params })
  },
  getCouponDetail(id: string) {
    return request.get<ApiResponse>(`/admin/coupons/${id}`)
  },
  saveCoupon(data: any) {
    return request.post<ApiResponse>('/admin/coupons', data)
  },
  updateCoupon(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/coupons/${id}`, data)
  },
  deleteCoupon(id: string) {
    return request.delete<ApiResponse>(`/admin/coupons/${id}`)
  },
  toggleCouponStatus(id: string) {
    return request.put<ApiResponse>(`/admin/coupons/${id}/toggle`)
  },
  copyCoupon(id: string) {
    return request.post<ApiResponse>(`/admin/coupons/${id}/copy`)
  },
  // 使用记录
  getCouponUsageList(params: PageParams & { couponId?: string; userId?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/coupons/records/list', { params })
  },

  // 签到
  getSignConfigs() {
    return request.get<ApiResponse>('/admin/sign-configs')
  },
  saveSignConfig(data: any) {
    return request.post<ApiResponse>('/admin/sign-configs', data)
  },
  updateSignConfig(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/sign-configs/${id}`, data)
  },
  deleteSignConfig(id: number) {
    return request.delete<ApiResponse>(`/admin/sign-configs/${id}`)
  },

  // 徽章
  getBadgeList(params: PageParams & { type?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/badges', { params })
  },
  saveBadge(data: any) {
    return request.post<ApiResponse>('/admin/badges', data)
  },
  updateBadge(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/badges/${id}`, data)
  },
  deleteBadge(id: number) {
    return request.delete<ApiResponse>(`/admin/badges/${id}`)
  },

  // 活动
  getActivityList(params: PageParams & { keyword?: string; type?: string; status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/activities', { params })
  },
  getActivityDetail(id: number) {
    return request.get<ApiResponse>(`/admin/activities/${id}`)
  },
  saveActivity(data: any) {
    return request.post<ApiResponse>('/admin/activities', data)
  },
  updateActivity(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/activities/${id}`, data)
  },

  // 团购
  getGroupBuyList(params: PageParams & { status?: number }) {
    return request.get<ApiResponse<PageResult>>('/admin/group-buys', { params })
  },
  saveGroupBuy(data: any) {
    return request.post<ApiResponse>('/admin/group-buys', data)
  },
  updateGroupBuy(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/group-buys/${id}`, data)
  },
  toggleGroupBuy(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/group-buys/${id}/status`, { status })
  },

  // 分享活动设置
  getShareSettingsList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<ShareSettings>>>('/admin/share/settings', { params })
  },
  getShareSettings(regionId: string) {
    return request.get<ApiResponse<ShareSettings>>(`/admin/share/settings/${regionId}`)
  },
  saveShareSettings(regionId: string, data: Partial<ShareSettings>) {
    return request.put<ApiResponse>(`/admin/share/settings/${regionId}`, data)
  },
  deleteShareSettings(regionId: string) {
    return request.delete<ApiResponse>(`/admin/share/settings/${regionId}`)
  },

  // 邀请记录
  getShareInviteList(params: PageParams & { inviterId?: string; inviteeId?: string; regionId?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<ShareInvite>>>('/admin/share/invites', { params })
  },
  getShareInvite(id: string) {
    return request.get<ApiResponse<ShareInvite>>(`/admin/share/invites/${id}`)
  },

  // 奖励记录
  getShareRewardList(params: PageParams & { userId?: string; type?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<ShareReward>>>('/admin/share/rewards', { params })
  },
  retryShareReward(id: string) {
    return request.post<ApiResponse>(`/admin/share/rewards/${id}/retry`)
  },

  // 统计
  getShareStatsOverview() {
    return request.get<ApiResponse<ShareStatsOverview>>('/admin/share/stats/overview')
  },

  // 系统通知
  getNotificationList(params: PageParams & { type?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/notifications', { params })
  },
  saveNotification(data: any) {
    return request.post<ApiResponse>('/admin/notifications', data)
  },
  updateNotification(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/notifications/${id}`, data)
  },
  sendNotification(id: number) {
    return request.put<ApiResponse>(`/admin/notifications/${id}/send`)
  },
  deleteNotification(id: number) {
    return request.delete<ApiResponse>(`/admin/notifications/${id}`)
  },
}
