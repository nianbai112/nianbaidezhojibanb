import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult, BatchParams } from '@/types/api'

export const systemApi = {
  // 管理员
  getAdminList(params: PageParams & { keyword?: string; roleId?: number; status?: number }) {
    return request.get<ApiResponse<PageResult>>('/admin/admins', { params })
  },
  saveAdmin(data: any) {
    return request.post<ApiResponse>('/admin/admins', data)
  },
  updateAdmin(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/admins/${id}`, data)
  },
  resetPassword(id: number, password: string) {
    return request.put<ApiResponse>(`/admin/admins/${id}/reset-password`, { password })
  },
  toggleAdminStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/admins/${id}/status`, { status })
  },
  batchOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/admins/batch', params)
  },

  // 角色
  getRoleList() {
    return request.get<ApiResponse>('/admin/roles')
  },
  getRoleDetail(id: number) {
    return request.get<ApiResponse>(`/admin/roles/${id}`)
  },
  saveRole(data: any) {
    return request.post<ApiResponse>('/admin/roles', data)
  },
  updateRole(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/roles/${id}`, data)
  },
  deleteRole(id: number) {
    return request.delete<ApiResponse>(`/admin/roles/${id}`)
  },

  // 菜单
  getMenuTree() {
    return request.get<ApiResponse>('/admin/menus/tree')
  },
  saveMenu(data: any) {
    return request.post<ApiResponse>('/admin/menus', data)
  },
  updateMenu(id: number, data: any) {
    return request.put<ApiResponse>(`/admin/menus/${id}`, data)
  },
  deleteMenu(id: number) {
    return request.delete<ApiResponse>(`/admin/menus/${id}`)
  },

  // 操作日志 → 后端 admin/audit-logs
  getOperationLogs(params: PageParams & { userId?: number | string; module?: string; action?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/audit-logs', { params })
  },

  // 文件存储配置
  getStorageConfig() {
    return request.get<ApiResponse>('/admin/config/storage')
  },
  saveStorageConfig(data: any) {
    return request.put<ApiResponse>('/admin/config/storage', data)
  },
  testStorageConfig(data: any) {
    return request.post<ApiResponse>('/admin/config/storage/test', data)
  },

  // 微信支付配置
  getWechatPayConfig() {
    return request.get<ApiResponse>('/admin/config/wechat-pay')
  },
  saveWechatPayConfig(data: any) {
    return request.put<ApiResponse>('/admin/config/wechat-pay', data)
  },

  // 系统配置
  getSystemConfigs(group?: string) {
    return request.get<ApiResponse>('/admin/configs', { params: { group } })
  },
  saveSystemConfigs(configs: any[]) {
    return request.put<ApiResponse>('/admin/configs', { configs })
  },

  // 系统配置分组（新版）
  getConfigGroup(group: string) {
    return request.get<ApiResponse<Record<string, any>>>(`/admin/config-group/${group}`)
  },
  saveConfigGroup(group: string, configs: Record<string, any>) {
    return request.put<ApiResponse>(`/admin/config-group/${group}`, configs)
  },

  // 邮箱配置
  getEmailConfig() {
    return request.get<ApiResponse>('/admin/email-config')
  },
  saveEmailConfig(data: any) {
    return request.put<ApiResponse>('/admin/email-config', data)
  },
  testEmail(data: { toEmail: string; subject?: string; content?: string }) {
    return request.post<ApiResponse>('/admin/email-config/test', data)
  },

  // 网站信息
  getWebsiteInfo() {
    return request.get<ApiResponse>('/admin/website-info')
  },
  saveWebsiteInfo(data: any) {
    return request.put<ApiResponse>('/admin/website-info', data)
  },

  // 微信模板消息
  getWechatTemplates(params: any) {
    return request.get<ApiResponse<PageResult>>('/admin/wechat-templates', { params })
  },
  createWechatTemplate(data: any) {
    return request.post<ApiResponse>('/admin/wechat-templates', data)
  },
  updateWechatTemplate(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/wechat-templates/${id}`, data)
  },
  deleteWechatTemplate(id: string) {
    return request.delete<ApiResponse>(`/admin/wechat-templates/${id}`)
  },
  batchToggleTemplate(data: { ids: string[]; enabled: boolean }) {
    return request.put<ApiResponse>('/admin/wechat-templates/batch-toggle', data)
  },

  // 小程序页面路径
  getMiniappPages(params?: any) {
    return request.get<ApiResponse<PageResult>>('/admin/miniapp-pages', { params })
  },
  createMiniappPage(data: any) {
    return request.post<ApiResponse>('/admin/miniapp-pages', data)
  },
  updateMiniappPage(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/miniapp-pages/${id}`, data)
  },
  deleteMiniappPage(id: string) {
    return request.delete<ApiResponse>(`/admin/miniapp-pages/${id}`)
  },

  // 文件管理
  getUploadFiles(params: any) {
    return request.get<ApiResponse<PageResult>>('/admin/upload-files', { params })
  },
  deleteUploadFile(id: string) {
    return request.delete<ApiResponse>(`/admin/upload-files/${id}`)
  },
  batchDeleteUploadFiles(data: { ids: string[] }) {
    return request.post<ApiResponse>('/admin/upload-files/batch-delete', data)
  },

  // 微信文章图片提取
  extractWechatArticleImages(url: string) {
    return request.post<ApiResponse>('/admin/wechat-article-images', { url })
  },
}
