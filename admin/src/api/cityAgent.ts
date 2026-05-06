import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const cityAgentApi = {
  // 城市代理申请列表
  getApplications(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/city-agent/applications', { params })
  },

  // 审核城市代理申请
  auditApplication(id: number, data: { status: string; reason?: string }) {
    return request.put<ApiResponse>(`/admin/city-agent/applications/${id}/audit`, data)
  },

  // 城市代理人列表
  getAgents(params: PageParams & { keyword?: string; region?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/city-agent/agents', { params })
  },

  // 城市代理人详情
  getAgentDetail(id: number) {
    return request.get<ApiResponse>(`/admin/city-agent/agents/${id}`)
  },

  // 城市代理结算单列表
  getSettlements(params: PageParams & { status?: string; agentId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/city-agent/settlements', { params })
  },

  // 创建城市代理结算单
  createSettlement(data: any) {
    return request.post<ApiResponse>('/admin/city-agent/settlements', data)
  },
}
