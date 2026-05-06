import request from '@/utils/request'
import type { ApiResponse } from '@/types/api'
import type { AuditStats } from '@/types/audit'

export const auditApi = {
  /** 获取审核中心统计数据 */
  getStats() {
    return request.get<ApiResponse<AuditStats>>('/admin/audit/stats')
  },

  /** 获取各类型待审核数量 */
  getPendingCounts() {
    return request.get<ApiResponse<{
      posts: number
      comments: number
      merchants: number
      withdraws: number
      cityAgents: number
      reports: number
    }>>('/admin/audit/pending-counts')
  },

  /** 批量审核 */
  batchAudit(data: {
    type: 'post' | 'comment' | 'merchant' | 'withdraw' | 'city_agent' | 'report'
    ids: number[]
    action: 'approve' | 'reject'
    remark?: string
  }) {
    return request.post<ApiResponse>('/admin/audit/batch', data)
  },
}
