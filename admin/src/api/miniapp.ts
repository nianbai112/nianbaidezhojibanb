import request from '@/utils/request'
import type { ApiResponse } from '@/types/api'

export const miniappApi = {
  // =================== 版本信息 ===================
  getVersionInfo() {
    return request.get<ApiResponse>('/admin/miniapp/version')
  },
  recordUpload(data: { version?: string; desc?: string }) {
    return request.post<ApiResponse>('/admin/miniapp/version/upload', data)
  },

  // =================== 小程序码 ===================
  generateQrcode(data: { path: string; width?: number; envVersion?: string }) {
    return request.post<ApiResponse>('/admin/miniapp/qrcode', data)
  },

  // =================== 页面路径 ===================
  getPagePaths() {
    return request.get<ApiResponse<any[]>>('/admin/miniapp/pages')
  },
  updatePagePaths(paths: any[]) {
    return request.put<ApiResponse>('/admin/miniapp/pages', { paths })
  },

  // =================== 订阅消息模板 ===================
  getSubscribeTemplates() {
    return request.get<ApiResponse<any[]>>('/admin/miniapp/subscribe-templates')
  },
  addSubscribeTemplate(data: { tid: string; kidList?: number[] }) {
    return request.post<ApiResponse>('/admin/miniapp/subscribe-templates', data)
  },
  deleteSubscribeTemplate(priTmplId: string) {
    return request.delete<ApiResponse>(`/admin/miniapp/subscribe-templates/${priTmplId}`)
  },
}
