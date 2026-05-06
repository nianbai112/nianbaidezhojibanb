export interface TopupPackage {
  id: string
  regionId: string
  name: string
  amount: number
  giveAmount: number
  sortOrder: number
  isShow: boolean
  createdAt: string
}

export interface TopupOrder {
  id: string
  orderNo: string
  userId: string
  userName?: string
  packageId: string
  amount: number
  giveAmount: number
  payChannel?: string
  status: string
  payTime?: string
  createdAt: string
}
