import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult, BatchParams } from '@/types/api'
import type { Area, Banner, Announcement, NavItem, TabBarConfig } from '@/types/area'

export const areaApi = {
  // 区域列表 → 后端 admin/regions
  getList(params: PageParams & { keyword?: string; status?: number }) {
    return request.get<ApiResponse<PageResult<Area>>>('/admin/regions', { params })
  },
  // 区域详情 → 后端 admin/regions/:id
  getDetail(id: number) {
    return request.get<ApiResponse<Area>>(`/admin/regions/${id}`)
  },
  create(data: Partial<Area>) {
    return request.post<ApiResponse>('/admin/regions', data)
  },
  update(id: number, data: Partial<Area>) {
    return request.put<ApiResponse>(`/admin/regions/${id}`, data)
  },
  delete(id: number | string) {
    return request.delete<ApiResponse>(`/admin/regions/${id}`)
  },
  toggleStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/regions/${id}/status`, { status })
  },
  batchOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/regions/batch', params)
  },

  // 首页内容（轮播/公告/导航） → 后端 admin/regions/:id/content-items
  getContentItems(regionId: number) {
    return request.get<ApiResponse>('/admin/regions/content-items', { params: { regionId } })
  },
  saveContentItem(data: any) {
    return request.post<ApiResponse>('/admin/regions/content-items', data)
  },
  updateContentItem(itemId: number, data: any) {
    return request.put<ApiResponse>(`/admin/regions/content-items/${itemId}`, data)
  },
  deleteContentItem(itemId: number) {
    return request.delete<ApiResponse>(`/admin/regions/content-items/${itemId}`)
  },

  // Banner
  getBanners(regionId: number) {
    return request.get<ApiResponse<Banner[]>>('/admin/regions/banners', { params: { regionId } })
  },
  saveBanner(data: any) {
    return request.post<ApiResponse>('/admin/regions/banners', data)
  },
  updateBanner(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/regions/banners/${id}`, data)
  },
  deleteBanner(id: number) {
    return request.delete<ApiResponse>(`/admin/regions/banners/${id}`)
  },

  // 公告
  getAnnouncements(regionId: number) {
    return request.get<ApiResponse<Announcement[]>>('/admin/regions/announcements', { params: { regionId } })
  },
  saveAnnouncement(data: any) {
    return request.post<ApiResponse>('/admin/regions/announcements', data)
  },
  updateAnnouncement(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/regions/announcements/${id}`, data)
  },
  deleteAnnouncement(id: number) {
    return request.delete<ApiResponse>(`/admin/regions/announcements/${id}`)
  },

  // 导航
  getNavItems(regionId: number) {
    return request.get<ApiResponse<NavItem[]>>('/admin/regions/nav', { params: { regionId } })
  },
  saveNavItems(data: { regionId: number; items: NavItem[] }) {
    return request.put<ApiResponse>('/admin/regions/nav', data)
  },

  // TabBar → 后端 admin/regions/:id/tabbar
  getTabBar(regionId: number) {
    return request.get<ApiResponse<TabBarConfig>>('/admin/regions/tabbar', { params: { regionId } })
  },
  saveTabBar(data: { regionId: number; config: TabBarConfig }) {
    return request.put<ApiResponse>('/admin/regions/tabbar', data)
  },

  // 自定义页面
  getCustomPages(regionId: number) {
    return request.get<ApiResponse<any[]>>('/admin/regions/custom-pages', { params: { regionId } })
  },
  saveCustomPage(data: any) {
    return request.post<ApiResponse>('/admin/regions/custom-pages', data)
  },
  updateCustomPage(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/regions/custom-pages/${id}`, data)
  },
  deleteCustomPage(id: number) {
    return request.delete<ApiResponse>(`/admin/regions/custom-pages/${id}`)
  },

  // 富文本内容
  getRichTexts(regionId: number) {
    return request.get<ApiResponse<any[]>>('/admin/regions/rich-texts', { params: { regionId } })
  },
  saveRichText(data: any) {
    return request.post<ApiResponse>('/admin/regions/rich-texts', data)
  },
  updateRichText(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/regions/rich-texts/${id}`, data)
  },
  deleteRichText(id: number) {
    return request.delete<ApiResponse>(`/admin/regions/rich-texts/${id}`)
  },
}
