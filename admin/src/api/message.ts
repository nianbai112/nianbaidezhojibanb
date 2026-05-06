import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'

export const messageApi = {
  // 会话列表 → 后端 admin/conversations
  getConversationList(params: PageParams & { type?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/conversations', { params })
  },
  getConversationDetail(id: number) {
    return request.get<ApiResponse>(`/admin/conversations/${id}`)
  },
  blockConversation(id: number) {
    return request.put<ApiResponse>(`/admin/conversations/${id}/block`)
  },
  unblockConversation(id: number) {
    return request.put<ApiResponse>(`/admin/conversations/${id}/unblock`)
  },

  // 消息记录
  getMessages(conversationId: number, params: PageParams & { keyword?: string; type?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/messages/history', {
      params: { ...params, conversationId },
    })
  },
  revokeMessage(conversationId: string, messageId: string) {
    return request.post<ApiResponse>('/admin/messages/recall', { conversationId, messageId })
  },

  // 违规消息
  getViolationList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/messages/violations', { params })
  },
  handleViolation(id: number, status: string, reason: string) {
    return request.put<ApiResponse>(`/admin/messages/violations/${id}`, { status, result: reason })
  },

  // 未读统计
  getUnreadStats() {
    return request.get<ApiResponse>('/admin/messages/unread-stats')
  },
}
