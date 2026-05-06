import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const opsApi = {
  getOverview() {
    return request.get<ApiResponse>('/admin/ops/overview')
  },
  getHealth() {
    return request.get<ApiResponse>('/admin/ops/health')
  },
  getLogs(params: PageParams & { level?: string; module?: string; keyword?: string; startTime?: string; endTime?: string; adminId?: string; userId?: string; path?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/ops/logs', { params })
  },
  getActions(params: PageParams) {
    return request.get<ApiResponse<PageResult>>('/admin/ops/actions', { params })
  },
  restartBackend(data: { reason: string; confirmText: string }) {
    return request.post<ApiResponse>('/admin/ops/restart', data)
  },
  cleanupLogs(data: { beforeDays: number }) {
    return request.post<ApiResponse>('/admin/ops/logs/cleanup', data)
  },
}
