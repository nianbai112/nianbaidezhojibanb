import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult, BatchParams } from '@/types/api'
import type { Post, Comment, Topic, Report } from '@/types/content'

export const contentApi = {
  // 帖子列表 → 后端 admin/posts
  getPostList(params: PageParams & { keyword?: string; auditStatus?: string; type?: string; topicId?: number; regionId?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<Post>>>('/admin/posts', { params })
  },
  getPostDetail(id: number) {
    return request.get<ApiResponse<Post>>(`/admin/posts/${id}`)
  },
  deletePost(id: number) {
    return request.delete<ApiResponse>(`/admin/posts/${id}`)
  },
  toggleTop(_id: number) {
    return request.put<ApiResponse>(`/admin/posts/${_id}/top`)
  },
  toggleEssence(_id: number) {
    return request.put<ApiResponse>(`/admin/posts/${_id}/essence`)
  },
  batchOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/posts/batch', params)
  },

  // 审核帖子 → 后端 admin/posts/:id/audit
  approvePost(id: number, remark?: string) {
    return request.put<ApiResponse>(`/admin/posts/${id}/audit`, { status: 'approved', reason: remark })
  },
  rejectPost(id: number, remark: string) {
    return request.put<ApiResponse>(`/admin/posts/${id}/audit`, { status: 'rejected', reason: remark })
  },

  // 评论
  getCommentList(params: PageParams & { keyword?: string; postId?: string; auditStatus?: string; regionId?: string; status?: string; startDate?: string; endDate?: string }) {
    return request.get<ApiResponse<PageResult<Comment>>>('/admin/comments', { params })
  },
  deleteComment(id: number) {
    return request.delete<ApiResponse>(`/admin/comments/${id}`)
  },
  approveComment(id: number) {
    return request.put<ApiResponse>(`/admin/comments/${id}/audit`, { status: 'approved' })
  },
  rejectComment(id: number, remark: string) {
    return request.put<ApiResponse>(`/admin/comments/${id}/audit`, { status: 'rejected', reason: remark })
  },

  // 话题/圈子 → 后端 circles (C端) / admin/circles (管理端)
  getTopicList(params: PageParams & { keyword?: string; category?: string }) {
    return request.get<ApiResponse<PageResult<Topic>>>('/admin/circles', { params })
  },
  getTopicDetail(id: number) {
    return request.get<ApiResponse<Topic>>(`/admin/circles/${id}`)
  },
  saveTopic(data: Partial<Topic>) {
    return request.post<ApiResponse>('/admin/circles', data)
  },
  updateTopic(id: number, data: Partial<Topic>) {
    return request.put<ApiResponse>(`/admin/circles/${id}`, data)
  },
  toggleTopicStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/circles/${id}/status`, { status })
  },

  // 举报 → 后端 admin/reports
  getReportList(params: PageParams & { status?: string; targetType?: string }) {
    return request.get<ApiResponse<PageResult<Report>>>('/admin/reports', { params })
  },
  handleReport(id: number, status: string, result?: string) {
    return request.put<ApiResponse>(`/admin/reports/${id}/handle`, { status, result })
  },

  // 热榜
  getHotList(params: PageParams & { date?: string }) {
    return request.get<ApiResponse<PageResult<Post>>>('/admin/posts/hot', { params })
  },
  setHotPosts(_postIds: number[]) {
    return request.put<ApiResponse>('/admin/posts/hot', { postIds: _postIds })
  },

  // 操作日志 → 后端 admin/audit-logs
  getOperationLogs(targetType: string, targetId: number) {
    return request.get<ApiResponse>('/admin/audit-logs', { params: { targetType, targetId } })
  },

  // 笔记配置 → 后端 admin/note-settings
  getNoteSettings(params?: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult<any>>>('/admin/note-settings', { params })
  },
  getNoteSettingByRegion(regionId: string) {
    return request.get<ApiResponse>(`/admin/note-settings/${regionId}`)
  },
  updateNoteSetting(regionId: string, data: any) {
    return request.put<ApiResponse>(`/admin/note-settings/${regionId}`, data)
  },
}
