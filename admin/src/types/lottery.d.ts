export interface Lottery {
  id: string
  postId: string
  title: string
  drawAt: string
  allowDuplicate: boolean
  status: string
  cancelledReason?: string
  createdAt: string
  prizes?: LotteryPrize[]
  _count?: { winners: number }
}

export interface LotteryPrize {
  id: string
  lotteryId: string
  name: string
  count: number
}

export interface LotteryWinner {
  id: string
  lotteryId: string
  userId: string
  userName?: string
  prizeId: string
  createdAt: string
}
