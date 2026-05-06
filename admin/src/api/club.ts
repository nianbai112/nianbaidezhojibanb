import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { Club, ClubMember } from '@/types/club'

export const clubApi = {
  getClubList(params: PageParams & { keyword?: string; status?: string; regionId?: string }) {
    return request.get<ApiResponse<PageResult<Club>>>('/admin/clubs', { params })
  },
  getClubDetail(id: string) {
    return request.get<ApiResponse<Club>>(`/admin/clubs/${id}`)
  },
  createClub(data: Partial<Club>) {
    return request.post<ApiResponse>('/admin/clubs', data)
  },
  updateClub(id: string, data: Partial<Club>) {
    return request.put<ApiResponse>(`/admin/clubs/${id}`, data)
  },
  updateClubStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/clubs/${id}/status`, { status })
  },
  deleteClub(id: string) {
    return request.delete<ApiResponse>(`/admin/clubs/${id}`)
  },
  getMemberList(clubId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<ClubMember>>>(`/admin/clubs/${clubId}/members`, { params })
  },
  deleteMember(id: string) {
    return request.delete<ApiResponse>(`/admin/club-members/${id}`)
  },
}
