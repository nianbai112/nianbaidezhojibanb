import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { StickerCategory, Sticker } from '@/types/sticker'

export const stickerApi = {
  getCategoryList(params: PageParams) {
    return request.get<ApiResponse<PageResult<StickerCategory>>>('/admin/sticker-categories', { params })
  },
  createCategory(data: Partial<StickerCategory>) {
    return request.post<ApiResponse>('/admin/sticker-categories', data)
  },
  updateCategory(id: string, data: Partial<StickerCategory>) {
    return request.put<ApiResponse>(`/admin/sticker-categories/${id}`, data)
  },
  deleteCategory(id: string) {
    return request.delete<ApiResponse>(`/admin/sticker-categories/${id}`)
  },
  getStickerList(params: PageParams & { categoryId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<Sticker>>>('/admin/stickers', { params })
  },
  updateStatus(id: string, status: string) {
    return request.put<ApiResponse>(`/admin/stickers/${id}/status`, { status })
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/stickers/${id}`)
  },
}
