import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { RobotAccount, RobotPostTask, RobotCommentTask, PromptTemplate } from '@/types/robot'

export const robotApi = {
  // ── 机器人账号 ──
  getList(params: PageParams & { keyword?: string; status?: number; regionId?: number }) {
    return request.get<ApiResponse<PageResult<RobotAccount>>>('/admin/robots', { params })
  },
  getDetail(id: number) {
    return request.get<ApiResponse<RobotAccount>>(`/admin/robots/${id}`)
  },
  create(data: Partial<RobotAccount>) {
    return request.post<ApiResponse>('/admin/robots', data)
  },
  update(id: number, data: Partial<RobotAccount>) {
    return request.put<ApiResponse>(`/admin/robots/${id}`, data)
  },
  toggleStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/robots/${id}/status`, { status })
  },

  // ── AI 发帖 ──
  /** AI 生成帖子内容 */
  generatePost(data: { robotId: number; topic: string; circleId?: number; topicId?: number }) {
    return request.post<ApiResponse<{ title: string; content: string }>>('/admin/robots/ai/generate-post', data)
  },
  /** 创建发帖任务 */
  createPostTask(data: {
    robotId: number
    title: string
    content: string
    images: string[]
    circleId?: number
    topicIds?: number[]
    regionId: number
    scheduledAt?: string
    autoPublish?: boolean
  }) {
    return request.post<ApiResponse>('/admin/robots/post-tasks', data)
  },

  // ── AI 评论 ──
  /** AI 批量生成评论 */
  generateComments(data: { postId: number; robotIds: number[]; direction: string; count?: number }) {
    return request.post<ApiResponse<{ comments: { robotId: number; content: string }[] }>>('/admin/robots/ai/generate-comments', data)
  },
  /** 创建评论任务 */
  createCommentTask(data: {
    postId: number
    robotIds: number[]
    comments: { robotId: number; content: string }[]
    intervalSeconds?: number
    scheduledAt?: string
  }) {
    return request.post<ApiResponse>('/admin/robots/comment-tasks', data)
  },

  // ── 任务管理 ──
  getPostTasks(params: PageParams & { robotId?: number; status?: string }) {
    return request.get<ApiResponse<PageResult<RobotPostTask>>>('/admin/robots/post-tasks', { params })
  },
  getCommentTasks(params: PageParams & { postId?: number; status?: string }) {
    return request.get<ApiResponse<PageResult<RobotCommentTask>>>('/admin/robots/comment-tasks', { params })
  },
  cancelTask(id: number, type: 'post' | 'comment') {
    return request.put<ApiResponse>(`/admin/robots/tasks/${id}/cancel`, { type })
  },

  // ── AI 提示词模板 ──
  getPromptTemplates(params: PageParams & { type?: string }) {
    return request.get<ApiResponse<PageResult<PromptTemplate>>>('/admin/robots/prompt-templates', { params })
  },
  savePromptTemplate(data: Partial<PromptTemplate>) {
    return request.post<ApiResponse>('/admin/robots/prompt-templates', data)
  },
  updatePromptTemplate(id: number, data: Partial<PromptTemplate>) {
    return request.put<ApiResponse>(`/admin/robots/prompt-templates/${id}`, data)
  },
  deletePromptTemplate(id: number) {
    return request.delete<ApiResponse>(`/admin/robots/prompt-templates/${id}`)
  },
  togglePromptTemplate(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/robots/prompt-templates/${id}/status`, { status })
  },
}
