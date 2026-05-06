/** 内容审核统计数据 */
export interface AuditStats {
  todayPending: number
  todayApproved: number
  todayRejected: number
  overdueCount: number
  postPending: number
  commentPending: number
  merchantPending: number
  withdrawPending: number
  cityAgentPending: number
  reportPending: number
}
