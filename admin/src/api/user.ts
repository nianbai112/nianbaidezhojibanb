import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult, BatchParams } from '@/types/api'
import type { UserInfo, UserTag } from '@/types/user'

export const userApi = {
  // 用户列表 → 后端 admin/users
  getList(params: PageParams & { keyword?: string; status?: string; studentCertStatus?: string; regionId?: number }) {
    return request.get<ApiResponse<PageResult<UserInfo>>>('/admin/users', { params })
  },
  // 用户详情
  getDetail(id: number) {
    return request.get<ApiResponse<UserInfo>>(`/admin/users/${id}`)
  },
  update(id: number, data: Partial<UserInfo>) {
    return request.put<ApiResponse>(`/admin/users/${id}`, data)
  },
  toggleStatus(id: number, status: string) {
    return request.put<ApiResponse>(`/admin/users/${id}/status`, { status })
  },
  // 封禁/解封 → 后端 admin/users/:id/ban
  ban(id: number, reason: string) {
    return request.put<ApiResponse>(`/admin/users/${id}/ban`, { banned: true, reason })
  },
  unban(id: number) {
    return request.put<ApiResponse>(`/admin/users/${id}/ban`, { banned: false })
  },
  batchOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/users/batch', params)
  },

  // 余额
  getBalanceLogs(userId: number, params: PageParams) {
    return request.get<ApiResponse<PageResult>>(`/admin/users/${userId}/balance-logs`, { params })
  },
  adjustBalance(_userId: number, _amount: number, _remark: string) {
    return request.post<ApiResponse>('/admin/users/balance-adjust', { userId: _userId, amount: _amount, remark: _remark })
  },

  // 学生认证
  getCertList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult<UserInfo>>>('/admin/users', { params: { ...params, studentCertStatus: params.status } })
  },
  approveCert(userId: number) {
    return request.put<ApiResponse>(`/admin/users/${userId}/cert`, { status: 'approved' })
  },
  rejectCert(userId: number, reason: string) {
    return request.put<ApiResponse>(`/admin/users/${userId}/cert`, { status: 'rejected', reason })
  },

  // 标签 → 后端 admin/user-tags
  getTags() {
    return request.get<ApiResponse<UserTag[]>>('/admin/user-tags')
  },
  saveTag(_data: Partial<UserTag>) {
    return request.post<ApiResponse>('/admin/user-tags', _data)
  },
  updateTag(_id: number, _data: Partial<UserTag>) {
    return request.put<ApiResponse>(`/admin/user-tags/${_id}`, _data)
  },
  deleteTag(_id: number) {
    return request.delete<ApiResponse>(`/admin/user-tags/${_id}`)
  },
  setUserTags(_userId: number, _tagIds: number[]) {
    return request.post<ApiResponse>(`/admin/users/${_userId}/tags`, { tagIds: _tagIds })
  },

  // 关注
  getFollows(_userId: number, params: PageParams) {
    return request.get<ApiResponse<PageResult>>(`/admin/users/${_userId}/follows`, { params })
  },
  getFans(_userId: number, params: PageParams) {
    return request.get<ApiResponse<PageResult>>(`/admin/users/${_userId}/fans`, { params })
  },

  // 浏览记录
  getBrowseHistory(_userId: number, params: PageParams) {
    return request.get<ApiResponse<PageResult>>(`/admin/users/${_userId}/browse`, { params })
  },

  // ==================== 用户等级 ====================
  getLevelList(params: PageParams & { regionId?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/user-levels', { params })
  },
  getAllLevels(regionId?: string) {
    return request.get<ApiResponse<any[]>>('/admin/user-levels/all', { params: { regionId } })
  },
  createLevel(data: any) {
    return request.post<ApiResponse>('/admin/user-levels', data)
  },
  updateLevel(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/user-levels/${id}`, data)
  },
  deleteLevel(id: string) {
    return request.delete<ApiResponse>(`/admin/user-levels/${id}`)
  },
  getUserLevels(params: PageParams & { keyword?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/user-levels-info', { params })
  },

  // ==================== 用户经验 ====================
  getExpList(params: PageParams & { userId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/user-experiences', { params })
  },
  addExp(data: { userId: string; changeAmount: number; reason?: string }) {
    return request.post<ApiResponse>('/admin/user-experiences', data)
  },

  // ==================== 用户标签定义 ====================
  getTagDefList(params: PageParams & { regionId?: string; keyword?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/user-tag-defs', { params })
  },
  getAllTagDefs(regionId?: string) {
    return request.get<ApiResponse<any[]>>('/admin/user-tag-defs/all', { params: { regionId } })
  },
  createTagDef(data: any) {
    return request.post<ApiResponse>('/admin/user-tag-defs', data)
  },
  updateTagDef(id: string, data: any) {
    return request.put<ApiResponse>(`/admin/user-tag-defs/${id}`, data)
  },
  deleteTagDef(id: string) {
    return request.delete<ApiResponse>(`/admin/user-tag-defs/${id}`)
  },

  // ==================== 地址管理 ====================
  getAddressList(params: PageParams & { userId?: string; keyword?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/addresses', { params })
  },
  getAddressDetail(id: string) {
    return request.get<ApiResponse>('/admin/addresses/' + id)
  },
  deleteAddress(id: string) {
    return request.delete<ApiResponse>('/admin/addresses/' + id)
  },

  // ==================== 用户引导 ====================
  getGuidanceList(params: PageParams & { regionId?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/user-guidance', { params })
  },
  getGuidanceByRegion(regionId: string) {
    return request.get<ApiResponse>('/admin/user-guidance/region/' + regionId)
  },
  createGuidance(data: any) {
    return request.post<ApiResponse>('/admin/user-guidance', data)
  },
  updateGuidance(id: string, data: any) {
    return request.put<ApiResponse>('/admin/user-guidance/' + id, data)
  },
  deleteGuidance(id: string) {
    return request.delete<ApiResponse>('/admin/user-guidance/' + id)
  },

  // ==================== 余额批量操作 ====================
  batchBalanceClear(data: { userIds: string[]; reason?: string }) {
    return request.post<ApiResponse>('/admin/users/batch-balance-clear', data)
  },
  batchBalanceAdd(data: { userIds: string[]; amount: number; reason?: string }) {
    return request.post<ApiResponse>('/admin/users/batch-balance-add', data)
  },
  batchBalanceDeduct(data: { userIds: string[]; amount: number; reason?: string }) {
    return request.post<ApiResponse>('/admin/users/batch-balance-deduct', data)
  },
  getBalanceOpsLogs(params: PageParams & { action?: string }) {
    return request.get<ApiResponse<PageResult>>('/admin/balance-logs', { params })
  },
}
