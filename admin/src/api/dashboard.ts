import request from '@/utils/request'
import type { ApiResponse } from '@/types/api'
import type { DashboardStats, TrendDataPoint, RegionOverview } from '@/types/system'

export const dashboardApi = {
  /** 仪表盘核心统计数据 */
  getStats() {
    return request.get<ApiResponse<DashboardStats>>('/admin/dashboard')
  },
  /** 近7天趋势数据 */
  getTrends() {
    return request.get<ApiResponse<TrendDataPoint[]>>('/admin/dashboard/trends')
  },
  /** 区域/学校数据概览 */
  getRegions() {
    return request.get<ApiResponse<{ list: RegionOverview[] }>>('/admin/dashboard/regions')
  },
}
