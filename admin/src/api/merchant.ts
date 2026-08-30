import { request, getPage, postAction, putAction, deleteAction } from './request'

// ==================== 商家列表 ====================
export async function getMerchants(params: Record<string, any> = {}) {
  return getPage('/admin/merchants', params)
}
export async function getMerchantDetail(id: string) {
  return request.get(`/admin/merchants/${id}`)
}
export async function createMerchant(data: Record<string, any>) {
  return postAction('/admin/merchants', data)
}
export async function updateMerchant(id: string, data: Record<string, any>) {
  return putAction(`/admin/merchants/${id}`, data)
}
export async function deleteMerchant(id: string) {
  return deleteAction(`/admin/merchants/${id}`)
}
export async function auditMerchant(id: string, data: { status: string; remark?: string }) {
  return putAction(`/admin/merchants/${id}/audit`, data)
}
export async function updateMerchantStatus(id: string, status: string, closedNotice?: string | null) {
  return putAction(`/admin/merchants/${id}/status`, {
    status: status === 'approved' ? 1 : 0,
    closedNotice,
  })
}

// ==================== 商品管理 ====================
export async function getProducts(params: Record<string, any> = {}) {
  return getPage('/admin/products', params)
}
export async function getProductDetail(id: string) {
  return request.get(`/admin/products/${id}`)
}
export async function createProduct(data: Record<string, any>) {
  return postAction('/admin/products', data)
}
export async function updateProduct(id: string, data: Record<string, any>) {
  return putAction(`/admin/products/${id}`, data)
}
export async function updateProductStatus(id: string, status: string) {
  return putAction(`/admin/products/${id}/status`, { status: status === 'on_sale' ? 1 : 0 })
}
export async function auditProduct(id: string, data: { status: string; reason?: string }) {
  return putAction(`/admin/products/${id}/audit`, data)
}
export async function getProductStockAlerts(params: Record<string, any> = {}) {
  return getPage('/admin/products/stock-alerts', params)
}

// ==================== 商品分类 ====================
export async function getCategories(params: Record<string, any> = {}) {
  return getPage('/admin/categories', params)
}
export async function createCategory(data: Record<string, any>) {
  return postAction('/admin/categories', data)
}
export async function updateCategory(id: string, data: Record<string, any>) {
  return putAction(`/admin/categories/${id}`, data)
}
export async function deleteCategory(id: string) {
  return deleteAction(`/admin/categories/${id}`)
}

// ==================== 外卖订单 ====================
export async function getMerchantOrders(params: Record<string, any> = {}) {
  return getPage('/admin/order-center/orders', { ...params, type: 'delivery' })
}
export async function getMerchantOrderDetail(id: string) {
  return request.get(`/admin/order-center/orders/${id}`)
}
export async function releaseMerchantOrderRider(id: string) {
  return postAction(`/admin/order-center/orders/${id}/release-rider`, {})
}

// ==================== 宿舍小店配送监管 ====================
export async function getDormShopDeliveryMerchants(params: Record<string, any> = {}) {
  return getPage('/admin/order-center/dorm-shop/merchants', params)
}
export async function getDormShopDeliveryStaff(params: Record<string, any> = {}) {
  return getPage('/admin/order-center/dorm-shop/staff', params)
}
export async function updateDormShopDeliveryStaffStatus(
  staffId: string,
  data: { status: 'active' | 'paused' | 'removed'; reason?: string },
) {
  return request.patch(`/admin/order-center/dorm-shop/staff/${staffId}/status`, data)
}

// ==================== 退款售后 ====================
export async function getRefunds(params: Record<string, any> = {}) {
  return getPage('/admin/refunds', params)
}
export async function auditRefund(id: string, data: { status: string; remark?: string }) {
  return putAction(`/admin/refunds/${id}/audit`, data)
}
export async function approveRefund(id: string) {
  return putAction(`/admin/refunds/${id}/approve`, {})
}
export async function rejectRefund(id: string, remark?: string) {
  return putAction(`/admin/refunds/${id}/reject`, { remark })
}
export async function completeRefund(id: string, transferNo?: string) {
  return putAction(`/admin/refunds/${id}/complete`, { transferNo })
}

// ==================== 商家评价 ====================
export async function getReviews(params: Record<string, any> = {}) {
  return getPage('/admin/reviews', params)
}
export async function replyReview(id: string, reply: string) {
  return putAction(`/admin/reviews/${id}/reply`, { reply })
}
export async function updateReviewStatus(id: string, status: string) {
  return putAction(`/admin/reviews/${id}/status`, { status })
}

// ==================== 商家结算 ====================
export async function getMerchantSettlements(params: Record<string, any> = {}) {
  return getPage('/admin/merchant-settlements', params)
}
export async function confirmMerchantSettlement(id: string, remark?: string) {
  return putAction(`/admin/merchant-settlements/${id}/confirm`, { remark })
}
export async function payMerchantSettlement(id: string, transferNo: string, remark?: string) {
  return putAction(`/admin/merchant-settlements/${id}/pay`, { transferNo, remark })
}
export async function offsetMerchantSettlement(id: string, reference: string) {
  return putAction(`/admin/merchant-settlements/${id}/offset`, { reference })
}

// ==================== 打印机配置 ====================
export async function getPrinters(params: Record<string, any> = {}) {
  return getPage('/admin/merchant/printers', params)
}
export async function getPrinterDetail(id: string) {
  return request.get(`/admin/merchant/printers/${id}`)
}
export async function createPrinter(data: Record<string, any>) {
  return postAction('/admin/merchant/printers', data)
}
export async function updatePrinter(id: string, data: Record<string, any>) {
  return putAction(`/admin/merchant/printers/${id}`, data)
}
export async function deletePrinter(id: string) {
  return deleteAction(`/admin/merchant/printers/${id}`)
}
export async function testPrint(id: string, content?: string) {
  return postAction(`/admin/merchant/printers/${id}/test-print`, { content })
}

// ==================== 加价规则 ====================
export async function getPriceAdjustments(params: Record<string, any> = {}) {
  return getPage('/admin/merchant/price-adjustments', params)
}
export async function getPriceAdjustmentDetail(id: string) {
  return request.get(`/admin/merchant/price-adjustments/${id}`)
}
export async function createPriceAdjustment(data: Record<string, any>) {
  return postAction('/admin/merchant/price-adjustments', data)
}
export async function updatePriceAdjustment(id: string, data: Record<string, any>) {
  return putAction(`/admin/merchant/price-adjustments/${id}`, data)
}
export async function deletePriceAdjustment(id: string) {
  return deleteAction(`/admin/merchant/price-adjustments/${id}`)
}

// ==================== 商品采集 ====================
export async function getProductCollection(params: Record<string, any> = {}) {
  return getPage('/admin/merchant/product-collection', params)
}
export async function batchCollectProducts(data: { productIds: string[]; targetMerchantId: string }) {
  return postAction('/admin/merchant/product-collection/batch', data)
}

// ==================== 区域商家设置 ====================
export async function getRegionMerchantSettings(params: Record<string, any> = {}) {
  return getPage('/admin/merchant/region-settings', params)
}
export async function getRegionMerchantSettingDetail(regionId: string) {
  return request.get(`/admin/merchant/region-settings/${regionId}`)
}
export async function saveRegionMerchantSettings(regionId: string, data: Record<string, any>) {
  return putAction(`/admin/merchant/region-settings/${regionId}`, data)
}
