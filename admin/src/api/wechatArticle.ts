import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { WechatArticle } from '@/types/wechatArticle'

export const wechatArticleApi = {
  getList(params: PageParams & { keyword?: string }) {
    return request.get<ApiResponse<PageResult<WechatArticle>>>('/admin/wechat-articles', { params })
  },
  delete(id: string) {
    return request.delete<ApiResponse>(`/admin/wechat-articles/${id}`)
  },
}
