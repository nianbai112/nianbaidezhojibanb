import { request } from './request'

export interface PageResult<T = any> {
  list: T[]
  total: number
  page?: number
  pageSize?: number
}

export const errandTypeOptions = [
  { label: '代取快递', value: 'pickup' },
  { label: '代寄快递', value: 'deliver' },
  { label: '外卖代拿', value: 'meal' },
  { label: '万能任务', value: 'universal' },
]

export const errandStatusOptions = [
  { label: '待支付', value: 'pending_pay' },
  { label: '待接单', value: 'pending_accept' },
  { label: '已接单', value: 'accepted' },
  { label: '进行中', value: 'in_progress' },
  { label: '已到达', value: 'arrived' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
  { label: '退款中', value: 'refunding' },
  { label: '已退款', value: 'refunded' },
]

export const pickupPointTypeOptions = [
  { label: '快递取件点', value: 'pickup' },
  { label: '快递寄件点', value: 'deliver' },
  { label: '外卖取餐点', value: 'meal' },
]

export function labelOf(options: Array<{ label: string; value: string }>, value?: string) {
  return options.find(item => item.value === value)?.label || value || '-'
}

export function pageOf<T = any>(payload: any): PageResult<T> {
  if (Array.isArray(payload)) return { list: payload, total: payload.length }
  const source = payload?.data || payload || {}
  const list = source.list || source.rows || source.items || source.records || []
  const total = Number(source.total ?? source.count ?? list.length ?? 0)
  return {
    list,
    total,
    page: Number(source.page || 1),
    pageSize: Number(source.pageSize || source.limit || list.length || 20),
  }
}

export async function fetchErrandStats(params: any = {}) {
  return request.get('/admin/errand/stats', { params })
}

export async function fetchErrandOrders(params: any = {}) {
  return pageOf(await request.get('/admin/errand/orders', { params }))
}

export async function fetchErrandOrderDetail(id: string) {
  return request.get(`/admin/errand/orders/${id}`)
}

export async function fetchErrandOrderTimeline(id: string) {
  return request.get(`/admin/errand/orders/${id}/timeline`)
}

export async function assignErrandOrder(id: string, riderId: string) {
  return request.post(`/admin/errand/orders/${id}/assign`, { riderId })
}

export async function cancelErrandOrder(id: string, reason: string) {
  return request.put(`/admin/errand/orders/${id}/cancel`, { reason })
}

export async function fetchErrandFeeConfig(regionId?: string) {
  return request.get('/admin/errand/fee-config', { params: { regionId } })
}

export async function saveErrandFeeConfig(regionId: string, data: any) {
  return request.put('/admin/errand/fee-config', data, { params: { regionId } })
}

export async function fetchErrandPageConfig(regionId?: string) {
  return request.get('/admin/errand/page-config', { params: { regionId } })
}

export async function saveErrandPageConfig(regionId: string, data: any) {
  return request.put('/admin/errand/page-config', data, { params: { regionId } })
}

export async function fetchErrandRewardPunish(regionId?: string) {
  return request.get('/admin/errand/reward-punish', { params: { regionId } })
}

export async function saveErrandRewardPunish(regionId: string, data: any) {
  return request.put('/admin/errand/reward-punish', data, { params: { regionId } })
}

export async function fetchErrandItemSizes(params: any = {}) {
  return pageOf(await request.get('/admin/errand/item-sizes', { params }))
}

export async function createErrandItemSize(data: any) {
  return request.post('/admin/errand/item-sizes', data)
}

export async function updateErrandItemSize(id: string, data: any) {
  return request.put(`/admin/errand/item-sizes/${id}`, data)
}

export async function deleteErrandItemSize(id: string) {
  return request.delete(`/admin/errand/item-sizes/${id}`)
}

export async function fetchErrandPickupPoints(params: any = {}) {
  return pageOf(await request.get('/admin/errand/pickup-points', { params }))
}

export async function createErrandPickupPoint(data: any) {
  return request.post('/admin/errand/pickup-points', data)
}

export async function updateErrandPickupPoint(id: string, data: any) {
  return request.put(`/admin/errand/pickup-points/${id}`, data)
}

export async function deleteErrandPickupPoint(id: string) {
  return request.delete(`/admin/errand/pickup-points/${id}`)
}
