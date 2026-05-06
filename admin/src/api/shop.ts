import request from '@/utils/request'
import type { ApiResponse, PageParams, PageResult, BatchParams } from '@/types/api'
import type {
  Merchant, Category, Product, Sku,
  Order, RefundRecord, Review, Promotion, FreightTemplate,
  PrinterConfig, PriceAdjustment, RegionMerchantSettings,
  Distributor, DistributorLevel, DistributorConfig, DistributorCommission, DistributorWithdrawal,
} from '@/types/shop'

export const shopApi = {
  // 商家 → 后端 merchants/list + admin 审核
  getMerchantList(params: PageParams & { keyword?: string; auditStatus?: string; regionId?: string; categoryId?: string }) {
    return request.get<ApiResponse<PageResult<Merchant>>>('/admin/merchants', { params })
  },
  getMerchantDetail(id: number) {
    return request.get<ApiResponse<Merchant>>(`/admin/merchants/${id}`)
  },
  approveMerchant(id: number, remark?: string) {
    return request.put<ApiResponse>(`/admin/merchants/${id}/audit`, { status: 'approved', remark })
  },
  rejectMerchant(id: number, remark: string) {
    return request.put<ApiResponse>(`/admin/merchants/${id}/audit`, { status: 'rejected', remark })
  },
  toggleMerchantStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/merchants/${id}/status`, { status })
  },

  batchOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/merchants/batch', params)
  },

  // 类目 → 后端 categories
  getCategoryTree() {
    return request.get<ApiResponse<Category[]>>('/admin/categories')
  },

  saveCategory(data: Partial<Category>) {
    return request.post<ApiResponse>('/admin/categories', data)
  },

  updateCategory(id: number, data: Partial<Category>) {
    return request.put<ApiResponse>(`/admin/categories/${id}`, data)
  },

  deleteCategory(id: number) {
    return request.delete<ApiResponse>(`/admin/categories/${id}`)
  },

  // 商品 → 后端 admin/products
  getProductList(params: PageParams & { keyword?: string; merchantId?: number; categoryId?: number; status?: string }) {
    return request.get<ApiResponse<PageResult<Product>>>('/admin/products', { params })
  },
  getProductDetail(id: number) {
    return request.get<ApiResponse<Product>>(`/admin/products/${id}`)
  },

  saveProduct(data: Partial<Product>) {
    return request.post<ApiResponse>('/admin/products', data)
  },

  updateProduct(id: number, data: Partial<Product>) {
    return request.put<ApiResponse>(`/admin/products/${id}`, data)
  },

  toggleProductStatus(id: number, status: string) {
    return request.put<ApiResponse>(`/admin/products/${id}/status`, { status })
  },

  approveProduct(id: number) {
    return request.put<ApiResponse>(`/admin/products/${id}/audit`, { status: 'approved' })
  },

  rejectProduct(id: number, remark: string) {
    return request.put<ApiResponse>(`/admin/products/${id}/audit`, { status: 'rejected', reason: remark })
  },

  batchProductOp(params: BatchParams) {
    return request.post<ApiResponse>('/admin/products/batch', params)
  },

  // SKU

  updateSku(id: number, data: Partial<Sku>) {
    return request.put<ApiResponse>(`/admin/skus/${id}`, data)
  },

  // 订单 → 后端 admin/orders
  getOrderList(params: PageParams & { orderNo?: string; status?: string; merchantId?: number; regionId?: string; keyword?: string; payStatus?: string; startAt?: string; endAt?: string; dateRange?: [string, string] }) {
    return request.get<ApiResponse<PageResult<Order>>>('/admin/orders', { params })
  },
  getOrderDetail(id: string | number) {
    return request.get<ApiResponse<Order>>(`/admin/orders/${id}`)
  },

  cancelOrder(id: number, reason: string) {
    return request.put<ApiResponse>(`/admin/orders/${id}/cancel`, { reason })
  },

  updateOrderStatus(id: number, status: string) {
    return request.put<ApiResponse>(`/admin/orders/${id}/status`, { status })
  },

  // 退款
  getRefundList(params: PageParams & { status?: string }) {
    return request.get<ApiResponse<PageResult<RefundRecord>>>('/admin/refunds', { params })
  },
  approveRefund(id: number, remark?: string) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/audit`, { status: 'approved', remark })
  },
  rejectRefund(id: number, remark: string) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/audit`, { status: 'rejected', remark })
  },

  completeRefund(id: number) {
    return request.put<ApiResponse>(`/admin/refunds/${id}/complete`)
  },


  // 评价
  getReviewList(params: PageParams & { keyword?: string; rating?: number; merchantId?: number }) {
    return request.get<ApiResponse<PageResult<Review>>>('/admin/reviews', { params })
  },
  deleteReview(id: number) {
    return request.delete<ApiResponse>(`/admin/reviews/${id}`)
  },
  replyReview(id: number, reply: string) {
    return request.put<ApiResponse>(`/admin/reviews/${id}/reply`, { reply })
  },


  // 促销
  getPromotionList(params: PageParams & { merchantId?: number; type?: string; status?: number }) {
    return request.get<ApiResponse<PageResult<Promotion>>>('/admin/promotions', { params })
  },
  savePromotion(data: Partial<Promotion>) {
    return request.post<ApiResponse>('/admin/promotions', data)
  },
  updatePromotion(id: number, data: Partial<Promotion>) {
    return request.put<ApiResponse>(`/admin/promotions/${id}`, data)
  },
  togglePromotionStatus(id: number, status: 0 | 1) {
    return request.put<ApiResponse>(`/admin/promotions/${id}/status`, { status })
  },


  // 运费模板
  getFreightTemplates(_merchantId?: number) {
    return request.get<ApiResponse<FreightTemplate[]>>('/admin/freight-templates', { params: { merchantId: _merchantId } })
  },
  saveFreightTemplate(data: Partial<FreightTemplate>) {
    return request.post<ApiResponse>('/admin/freight-templates', data)
  },
  updateFreightTemplate(id: number, data: Partial<FreightTemplate>) {
    return request.put<ApiResponse>(`/admin/freight-templates/${id}`, data)
  },
  deleteFreightTemplate(id: number) {
    return request.delete<ApiResponse>(`/admin/freight-templates/${id}`)
  },

  // 库存预警

  getStockAlerts(params: PageParams & { merchantId?: number }) {
    return request.get<ApiResponse<PageResult<Product>>>('/admin/products/stock-alerts', { params })
  },

  // ==================== 打印机配置 ====================

  getPrinterList(params: PageParams & { merchantId?: string; brand?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<PrinterConfig>>>('/admin/merchant/printers', { params })
  },
  getPrinter(id: string) {
    return request.get<ApiResponse<PrinterConfig>>(`/admin/merchant/printers/${id}`)
  },
  createPrinter(data: Partial<PrinterConfig>) {
    return request.post<ApiResponse>('/admin/merchant/printers', data)
  },
  updatePrinter(id: string, data: Partial<PrinterConfig>) {
    return request.put<ApiResponse>(`/admin/merchant/printers/${id}`, data)
  },
  deletePrinter(id: string) {
    return request.delete<ApiResponse>(`/admin/merchant/printers/${id}`)
  },
  testPrint(id: string, data?: { orderId?: string; content?: string }) {
    return request.post<ApiResponse>(`/admin/merchant/printers/${id}/test-print`, data || {})
  },

  // ==================== 商品加价规则 ====================

  getPriceAdjustments(params: PageParams & { type?: string; scope?: string; status?: string; regionId?: string; categoryId?: string; merchantId?: string }) {
    return request.get<ApiResponse<PageResult<PriceAdjustment>>>('/admin/merchant/price-adjustments', { params })
  },
  getPriceAdjustment(id: string) {
    return request.get<ApiResponse<PriceAdjustment>>(`/admin/merchant/price-adjustments/${id}`)
  },
  createPriceAdjustment(data: Partial<PriceAdjustment>) {
    return request.post<ApiResponse>('/admin/merchant/price-adjustments', data)
  },
  updatePriceAdjustment(id: string, data: Partial<PriceAdjustment>) {
    return request.put<ApiResponse>(`/admin/merchant/price-adjustments/${id}`, data)
  },
  deletePriceAdjustment(id: string) {
    return request.delete<ApiResponse>(`/admin/merchant/price-adjustments/${id}`)
  },

  // ==================== 商品采集 ====================

  getProductCollection(params: PageParams & { keyword?: string; categoryId?: string; merchantId?: string; regionId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<Product>>>('/admin/merchant/product-collection', { params })
  },
  batchCollectProducts(data: { targetMerchantId: string; productIds: string[] }) {
    return request.post<ApiResponse>('/admin/merchant/product-collection/batch', data)
  },
  exportProducts(params: any) {
    return request.get<ApiResponse>('/admin/merchant/product-collection/export', { params })
  },

  // ==================== 区域商家设置 ====================

  getRegionSettingsList(params: PageParams & { regionId?: string; isOpen?: string }) {
    return request.get<ApiResponse<PageResult<RegionMerchantSettings>>>('/admin/merchant/region-settings', { params })
  },
  getRegionSettings(regionId: string) {
    return request.get<ApiResponse<RegionMerchantSettings>>(`/admin/merchant/region-settings/${regionId}`)
  },
  saveRegionSettings(regionId: string, data: Partial<RegionMerchantSettings>) {
    return request.put<ApiResponse>(`/admin/merchant/region-settings/${regionId}`, data)
  },

  // ==================== 分销管理 ====================

  getDistributorList(params: PageParams & { realName?: string; phone?: string; status?: string; levelId?: string }) {
    return request.get<ApiResponse<PageResult<Distributor>>>('/admin/distributor/list', { params })
  },
  getDistributorDetail(id: string) {
    return request.get<ApiResponse<Distributor>>(`/admin/distributor/${id}`)
  },
  auditDistributor(id: string, data: { status: string; remark?: string }) {
    return request.put<ApiResponse>(`/admin/distributor/${id}/audit`, data)
  },
  updateDistributor(id: string, data: { levelId?: string; remark?: string }) {
    return request.put<ApiResponse>(`/admin/distributor/${id}`, data)
  },

  // 分销等级
  getLevelList(params?: PageParams) {
    return request.get<ApiResponse<PageResult<DistributorLevel>>>('/admin/distributor/levels/list', { params })
  },
  createLevel(data: Partial<DistributorLevel>) {
    return request.post<ApiResponse>('/admin/distributor/levels', data)
  },
  updateLevel(id: string, data: Partial<DistributorLevel>) {
    return request.put<ApiResponse>(`/admin/distributor/levels/${id}`, data)
  },
  deleteLevel(id: string) {
    return request.delete<ApiResponse>(`/admin/distributor/levels/${id}`)
  },

  // 分销配置
  getDistributorConfigList(params?: PageParams) {
    return request.get<ApiResponse<PageResult<DistributorConfig>>>('/admin/distributor/config/list', { params })
  },
  updateDistributorConfig(key: string, data: { value: string; description?: string }) {
    return request.put<ApiResponse>(`/admin/distributor/config/${key}`, data)
  },

  // 佣金记录
  getCommissionList(params: PageParams & { distributorId?: string; level?: number; status?: string }) {
    return request.get<ApiResponse<PageResult<DistributorCommission>>>('/admin/distributor/commissions/list', { params })
  },

  // 提现记录
  getWithdrawalList(params: PageParams & { distributorId?: string; status?: string }) {
    return request.get<ApiResponse<PageResult<DistributorWithdrawal>>>('/admin/distributor/withdrawals/list', { params })
  },
  processWithdrawal(id: string, data: { status: string; remark?: string }) {
    return request.put<ApiResponse>(`/admin/distributor/withdrawals/${id}`, data)
  },
}
