/** 商家 */
export interface Merchant {
  id: string
  regionId?: string
  regionName?: string
  name: string
  logo: string
  cover?: string
  phone?: string
  contactPerson?: string
  address?: string
  longitude?: number
  latitude?: number
  businessHours?: string
  description?: string
  categoryId?: string
  categoryName?: string
  auditStatus: string
  auditRemark?: string
  status: 0 | 1
  score: number
  orderCount: number
  createdAt: string
}

/** 商品类目 */
export interface Category {
  id: number
  parentId: number
  name: string
  icon: string
  sort: number
  status: 0 | 1
  children?: Category[]
}

/** 商品状态 */
export type ProductStatus = 'draft' | 'on' | 'off' | 'deleted'

/** SKU */
export interface Sku {
  id: number
  productId: number
  name: string
  image: string
  price: number
  originPrice: number
  stock: number
  alertStock: number
  sales: number
  specValues: Record<string, string>
}

/** 规格 */
export interface Spec {
  id: number
  name: string
  values: string[]
}

/** 商品 */
export interface Product {
  id: number
  merchantId: number
  merchantName: string
  categoryId: number
  categoryName: string
  name: string
  description: string
  coverImage: string
  images: string[]
  videoUrl?: string
  specs: Spec[]
  skus: Sku[]
  minPrice: number
  maxPrice: number
  totalStock: number
  totalSales: number
  freightTemplateId: number
  status: ProductStatus
  auditStatus: string
  isRecommend: boolean
  sort: number
  createdAt: string
}

/** 运费模板 */
export interface FreightTemplate {
  id: number
  merchantId: number
  name: string
  type: 'free' | 'fixed' | 'condition'
  rules: FreightRule[]
}

export interface FreightRule {
  region: string
  firstWeight: number
  firstPrice: number
  continueWeight: number
  continuePrice: number
  freeCondition?: number
}

/** 订单状态 */
export type OrderStatus =
  | 'pending_pay'
  | 'pending_deliver'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunding'
  | 'refunded'

/** 订单 */
export interface Order {
  id: number
  orderNo: string
  userId: number
  userNickname: string
  merchantId: number
  merchantName: string
  productName: string
  productImage: string
  skuName: string
  quantity: number
  unitPrice: number
  totalAmount: number
  discountAmount: number
  freightAmount: number
  payAmount: number
  status: OrderStatus
  payMethod: string
  payTime: string
  deliverTime: string
  completeTime: string
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  buyerRemark: string
  createdAt: string
}

/** 退款记录 */
export interface RefundRecord {
  id: number
  orderId: number
  orderNo: string
  userId: number
  userNickname: string
  amount: number
  reason: string
  description: string
  images: string[]
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  handleRemark: string
  handlerId: number
  handledAt: string
  createdAt: string
}

/** 评价 */
export interface Review {
  id: string
  orderId: string
  orderNo?: string
  productId: string
  productName?: string
  userId: string
  userNickname: string
  userAvatar?: string
  rating: number
  content: string
  images?: string[]
  isAnonymous?: boolean
  reply?: string
  replyAt?: string
  merchantReply?: string
  status?: 0 | 1
  createdAt: string
}

/** 促销活动 */
export interface Promotion {
  id: number
  merchantId: number
  type: 'discount' | 'full_reduce' | 'flash_sale' | 'group_buy'
  name: string
  description: string
  startTime: string
  endTime: string
  rules: Record<string, any>
  productIds: number[]
  status: 0 | 1
  createdAt: string
}

/** 打印机配置 */
export interface PrinterConfig {
  id: string
  merchantId: string
  merchantName?: string
  name: string
  brand: string
  sn: string
  key?: string
  autoPrint: boolean
  isDefault: boolean
  status: string
  createdAt: string
}

/** 商品加价规则 */
export interface PriceAdjustment {
  id: string
  name: string
  type: 'PERCENTAGE' | 'FIXED'
  value: number
  scope: 'REGION' | 'CATEGORY' | 'MERCHANT'
  regionId?: string
  regionName?: string
  categoryId?: string
  categoryName?: string
  merchantId?: string
  merchantName?: string
  priority: number
  status: string
  remark?: string
  createdAt: string
}

/** 区域商家设置 */
export interface RegionMerchantSettings {
  id: string
  regionId: string
  regionName?: string
  autoAuditEnabled: boolean
  maxMerchants?: number
  commissionRate?: number
  minWithdrawAmount?: number
  withdrawFeeRate?: number
  defaultDeliveryRange?: number
  allowNegativeStock: boolean
  maxProductCount?: number
  requireProductAudit: boolean
  settlementCycle?: string
  settlementDay?: number
  isOpen: boolean
  createdAt: string
}

/** 分销商 */
export interface Distributor {
  id: string
  userId: string
  merchantId?: string
  levelId?: string
  parentId?: string
  realName: string
  phone: string
  status: 'pending' | 'approved' | 'rejected'
  totalEarnings: number
  pendingEarnings: number
  withdrawnEarnings: number
  totalOrders: number
  remark?: string
  createdAt: string
  updatedAt: string
  User?: { id: string; avatar?: string; nickname?: string }
  level?: { id: string; name: string; level: number }
  parent?: { id: string; realName: string }
  _count?: { children: number; commissions: number; withdrawals: number }
}

/** 分销等级 */
export interface DistributorLevel {
  id: string
  name: string
  level: number
  commissionRate: number
  conditionOrderCount: number
  conditionTotalAmount?: number
  icon?: string
  sortOrder: number
  createdAt: string
  _count?: { distributors: number }
}

/** 分销配置 */
export interface DistributorConfig {
  id: string
  key: string
  value: string
  description?: string
  createdAt: string
}

/** 分销佣金 */
export interface DistributorCommission {
  id: string
  distributorId: string
  distributor?: { id: string; realName: string; phone: string }
  orderId: string
  orderAmount: number
  commissionRate: number
  commissionAmount: number
  level: number
  sourceUserId?: string
  status: 'pending' | 'settled' | 'withdrawn'
  settledAt?: string
  createdAt: string
}

/** 分销提现 */
export interface DistributorWithdrawal {
  id: string
  distributorId: string
  distributor?: { id: string; realName: string; phone: string }
  withdrawNo: string
  amount: number
  feeAmount: number
  actualAmount: number
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  remark?: string
  processedAt?: string
  createdAt: string
}
