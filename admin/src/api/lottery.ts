import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult } from '@/types/api'
import type { Lottery, LotteryWinner } from '@/types/lottery'

export const lotteryApi = {
  getLotteryList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult<Lottery>>>('/admin/lotteries', { params })
  },
  getLotteryDetail(id: string) {
    return request.get<ApiResponse<Lottery>>(`/admin/lotteries/${id}`)
  },
  deleteLottery(id: string) {
    return request.delete<ApiResponse>(`/admin/lotteries/${id}`)
  },
  getWinnerList(lotteryId: string, params: PageParams) {
    return request.get<ApiResponse<PageResult<LotteryWinner>>>(`/admin/lotteries/${lotteryId}/winners`, { params })
  },
}
