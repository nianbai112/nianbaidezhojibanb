import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const financeApi = {
  // 支付订单
  getPaymentList(params: PageParams & { orderNo?: string; bizType?: string; payStatus?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/payments', { params })
  },

  // 充值记录 → 后端 admin/transactions
  getRechargeList(params: PageParams & { userId?: number | string; status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/transactions', { params: { ...params, type: 'RECHARGE' } })
  },

  // 余额流水 → 后端 admin/transactions
  getBalanceLogs(params: PageParams & { userId?: number | string; type?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/transactions', { params })
  },

  // 提现审核 → 后端 admin/withdraws
  getWithdrawList(params: PageParams & { status?: string; userType?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/withdraws', { params })
  },
  getWithdrawDetail(id: number) {
    return request.get<ApiResponse>(`/admin/withdraws/${id}`)
  },
  approveWithdraw(id: number, remark?: string) {
    return request.put<ApiResponse>(`/admin/withdraws/${id}/audit`, { status: 'approved', remark })
  },
  rejectWithdraw(id: number, reason: string) {
    return request.put<ApiResponse>(`/admin/withdraws/${id}/audit`, { status: 'rejected', remark: reason })
  },
  markWithdrawSuccess(id: number, transferNo: string) {
    return request.put<ApiResponse>(`/admin/withdraws/${id}/complete`, { transferNo })
  },

  // 退款记录
  getRefundFinanceList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/refunds/finance', { params })
  },
  approveRefund(id: number) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/approve`)
  },
  rejectRefund(id: number, reason: string) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/reject`, { reason })
  },
  markRefunded(id: number, transactionId: string) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/complete`, { transferNo: transactionId })
  },

  // 对账导出
  getReconciliationList(params: PageParams) {
    return request.get<ApiResponse<PageResult>>('/admin/reconciliations', { params })
  },
  generateReconciliation(date: string, type: 'daily' | 'monthly') {
    return request.post<ApiResponse>('/admin/reconciliations/generate', { date, type })
  },
  exportReconciliation(id: number) {
    return request.get<ApiResponse<{ fileUrl: string }>>(`/admin/reconciliations/${id}/export`)
  },

  // 支付宝转账
  getAlipayTransfers(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/alipay/transfers', { params })
  },
  getAlipayTransferDetail(id: string) {
    return request.get<ApiResponse>(`/admin/alipay/transfers/${id}`)
  },
  createAlipayTransfer(data: { payeeAccount: string; payeeName?: string; amount: number; remark?: string }) {
    return request.post<ApiResponse>('/admin/alipay/transfer', data)
  },

  // 区域余额变动
  getRegionBalanceLogs(params: PageParams & { regionId?: string; type?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/region-balance-logs', { params })
  },
  adjustRegionBalance(data: { regionId: string; amount: number; type: string; description?: string }) {
    return request.post<ApiResponse>('/admin/region-balance/adjust', data)
  },
}
