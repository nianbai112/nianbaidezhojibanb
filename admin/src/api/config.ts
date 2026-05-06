import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { ConfigItem, SensitiveWord, Advertisement } from '@/types/config'
import type { AIConfig, RobotConfig } from '@/types/robot'

export const configApi = {
  // ── 通用配置 ──
  /** 按分组获取配置 */
  getByGroup(group: string) {
    return request.get<ApiResponse<ConfigItem[]>>('/admin/config', { params: { group } })
  },
  /** 保存配置 */
  save(configs: { key: string; value: string }[]) {
    return request.put<ApiResponse>('/admin/config', { configs })
  },
  /** 重置为默认值 */
  reset(group: string) {
    return request.post<ApiResponse>('/admin/config/reset', { group })
  },

  // ── AI 配置 ──
  getAIConfig() {
    return request.get<ApiResponse<AIConfig>>('/admin/config/ai')
  },
  saveAIConfig(data: Partial<AIConfig>) {
    return request.put<ApiResponse>('/admin/config/ai', data)
  },
  /** 测试 AI 连接 */
  testAIConnection() {
    return request.post<ApiResponse<{ success: boolean; message: string }>>('/admin/config/ai/test')
  },

  // ── 机器人配置 ──
  getRobotConfig() {
    return request.get<ApiResponse<RobotConfig>>('/admin/config/robot')
  },
  saveRobotConfig(data: Partial<RobotConfig>) {
    return request.put<ApiResponse>('/admin/config/robot', data)
  },

  // ── 敏感词 ──
  getSensitiveWords(params: PageParams & { keyword?: string; category?: string; level?: string }) {
    return request.get<ApiResponse<PageResult<SensitiveWord>>>('/admin/sensitive-words', { params })
  },
  saveSensitiveWord(data: Partial<SensitiveWord>) {
    return request.post<ApiResponse>('/admin/sensitive-words', data)
  },
  updateSensitiveWord(id: number, data: Partial<SensitiveWord>) {
    return request.put<ApiResponse>(`/admin/sensitive-words/${id}`, data)
  },
  deleteSensitiveWord(id: number) {
    return request.delete<ApiResponse>(`/admin/sensitive-words/${id}`)
  },
  batchImportWords(words: string[]) {
    return request.post<ApiResponse>('/admin/sensitive-words/batch', { words })
  },

  // ── 广告 ──
  getAdvertisements(params: PageParams & { position?: string; status?: number }) {
    return request.get<ApiResponse<PageResult<Advertisement>>>('/admin/advertisements', { params })
  },
  saveAdvertisement(data: Partial<Advertisement>) {
    return request.post<ApiResponse>('/admin/advertisements', data)
  },
  updateAdvertisement(id: number, data: Partial<Advertisement>) {
    return request.put<ApiResponse>(`/admin/advertisements/${id}`, data)
  },
  deleteAdvertisement(id: number) {
    return request.delete<ApiResponse>(`/admin/advertisements/${id}`)
  },
  toggleAdvertisement(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/advertisements/${id}/status`, { status })
  },
}
