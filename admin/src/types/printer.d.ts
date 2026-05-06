export interface Printer {
  id: string
  merchantId: string
  name: string
  brand: string
  sn: string
  key?: string
  autoPrint: boolean
  isDefault: boolean
  status: string
  createdAt: string
}
