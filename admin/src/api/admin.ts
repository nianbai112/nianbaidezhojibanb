import { request } from './request'

export type ModuleAction =
  | 'create' | 'update' | 'delete'
  | 'enable' | 'disable'
  | 'approve' | 'reject'
  | 'complete' | 'cancel'
  | 'assign' | 'batchTag' | 'resetPassword'
  | 'batchEnable' | 'batchDisable'
  | 'batchApprove' | 'batchReject'
  | 'batchDelete'
  | 'export'

export interface PagePayload {
  rows: any[]
  total: number
  stats?: any[]
  sideMetrics?: any[]
}

export interface ActionPayload {
  row?: any
  rows?: any[]
  data?: Record<string, any>
  reason?: string
}

const moduleEndpoint: Record<string, string> = {
  regions: '/admin/regions',
  users: '/admin/users',
  verification: '/admin/users',
  merchants: '/admin/merchants',
  products: '/admin/products',
  orders: '/admin/orders',
  refunds: '/admin/refunds',
  finance: '/admin/transactions',
  contentAudit: '/admin/reports',
  posts: '/admin/posts',
  marketing: '/admin/coupons',
  delivery: '/admin/errand/orders',
  system: '/admin/configs',
  admins: '/admin/admins',
  files: '/admin/upload-files'
}

function listOf(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data?.rows)) return data.rows
  if (Array.isArray(data?.data)) return data.data
  return []
}

function totalOf(data: any, rows: any[]): number {
  return Number(data?.total ?? data?.count ?? data?.pagination?.total ?? rows.length)
}

function money(...values: any[]): number {
  const found = values.find(v => v !== undefined && v !== null && v !== '')
  return Number(found || 0)
}

function text(...values: any[]): string {
  const found = values.find(v => v !== undefined && v !== null && v !== '')
  return String(found ?? '-')
}

function statusText(v: any): string {
  const s = String(v ?? '')
  const map: Record<string, string> = {
    '1': '正常',
    '0': '禁用',
    active: '正常',
    inactive: '禁用',
    enabled: '正常',
    disabled: '禁用',
    pending: '待审核',
    approved: '正常',
    rejected: '拒绝',
    completed: '已完成',
    paid: '已支付',
    refunded: '已退款',
    cancelled: '已取消',
    processing: '处理中',
    pending_pay: '待付款',
    pending_accept: '待接单',
    accepted: '已接单',
    in_progress: '进行中',
    arrived: '已到达',
    refunding: '退款中',
    offline: '离线',
    online: '在线',
    busy: '忙碌'
  }
  return map[s] || s || '正常'
}

function avatar(name: any, sub?: any, extra?: any) {
  return { name: text(name), sub: text(sub, extra, '') }
}

function withMeta(moduleKey: string, row: any, mapped: Record<string, any>) {
  return { __raw: row, __module: moduleKey, ...mapped }
}

function mapRow(moduleKey: string, row: any) {
  const createdAt = text(row.createdAt, row.createTime, row.updatedAt, row.submitTime)
  switch (moduleKey) {
    case 'regions':
      return withMeta(moduleKey, row, {
        id: row.id,
        name: avatar(row.name, row.code || row.regionCode),
        code: text(row.code, row.regionCode, row.id),
        city: text(row.city, row.province, row.address),
        admin: avatar(row.adminName || row.managerName || row.operatorName, row.adminPhone || row.phone),
        userCount: row.userCount,
        merchantCount: row.merchantCount,
        gmv: money(row.gmv, row.totalGmv),
        status: statusText(row.status),
        createdAt
      })
    case 'users':
    case 'verification':
      return withMeta(moduleKey, row, {
        id: row.id,
        nickname: row.nickname || row.name || row.username || '',
        avatar: row.avatar || '',
        user: avatar(row.nickname || row.name || row.username, row.phone || row.openid),
        phone: text(row.phone, row.mobile),
        openid: row.openid || '',
        userType: row.userType || 'miniapp',
        typeLabel: row.typeLabel || statusText(row.userType) || '小程序用户',
        regionId: row.regionId || '',
        regionName: row.regionName || row.region?.name || '',
        school: text(row.schoolName, row.school, row.university, row.region?.name),
        studentCertStatus: row.studentCertStatus || row.certStatus || 'none',
        cert: statusText(row.studentCertStatus || row.certStatus),
        realName: text(row.realName, row.name),
        studentNo: text(row.studentId, row.studentNo),
        studentId: row.studentId || row.studentNo || '',
        posts: row.postCount,
        orders: row.orderCount,
        postCount: Number(row.postCount || 0),
        commentCount: Number(row.commentCount || 0),
        reportCount: Number(row.reportCount || 0),
        orderCount: Number(row.orderCount || 0),
        refundCount: Number(row.refundCount || 0),
        balance: money(row.balance, row.wallet?.balance, 0),
        freezeAmount: money(row.freezeAmount, row.wallet?.freeze, 0),
        amount: money(row.consumeAmount, row.totalAmount, row.balance),
        status: statusText(row.status),
        lastLoginAt: row.lastLoginAt || null,
        lastLoginIp: row.lastLoginIp || '',
        createdAt
      })
    case 'merchants':
      return withMeta(moduleKey, row, {
        id: row.id,
        merchant: avatar(row.name || row.shopName, row.phone || row.address),
        category: text(row.categoryName, row.category?.name),
        region: text(row.regionName, row.region?.name),
        contact: text(row.contactName, row.contactPhone, row.phone),
        status: statusText(row.status || row.auditStatus),
        score: row.rating || row.score,
        sales: row.sales || row.monthSales,
        settle: statusText(row.settleStatus),
        createdAt
      })
    case 'products':
      return withMeta(moduleKey, row, {
        id: row.id,
        product: avatar(row.name || row.title, row.description),
        merchant: text(row.merchantName, row.merchant?.name),
        category: text(row.categoryName, row.category?.name),
        price: money(row.price, row.salePrice),
        stock: row.stock,
        sales: row.sales,
        status: statusText(row.status || row.auditStatus),
        createdAt: text(row.updatedAt, createdAt)
      })
    case 'orders':
      return withMeta(moduleKey, row, {
        id: row.id,
        orderNo: text(row.orderNo, row.no, row.id),
        user: avatar(row.userName || row.user?.nickname, row.userPhone || row.user?.phone),
        merchant: text(row.merchantName, row.merchant?.name),
        orderType: text(row.type, row.orderType, '商城订单'),
        goodsAmount: money(row.goodsAmount, row.productAmount),
        deliveryFee: money(row.deliveryFee),
        amount: money(row.payAmount, row.amount, row.totalAmount),
        payStatus: statusText(row.payStatus),
        status: statusText(row.status),
        deliveryType: text(row.deliveryType, row.shippingType),
        createdAt
      })
    case 'refunds':
      return withMeta(moduleKey, row, {
        id: row.id,
        orderNo: text(row.refundNo, row.orderNo, row.id),
        user: avatar(row.userName || row.user?.nickname, row.userPhone),
        merchant: text(row.merchantName, row.merchant?.name),
        reason: text(row.reason, row.remark),
        amount: money(row.amount, row.refundAmount),
        status: statusText(row.status),
        createdAt
      })
    case 'finance':
      return withMeta(moduleKey, row, {
        id: row.id,
        flowNo: text(row.flowNo, row.transactionNo, row.id),
        merchant: text(row.merchantName, row.userName, row.targetName),
        tradeType: text(row.type, row.tradeType),
        orderAmount: money(row.amount, row.orderAmount),
        fee: money(row.fee, row.serviceFee),
        merchantIncome: money(row.merchantIncome, row.settleAmount),
        status: statusText(row.status),
        settledAt: text(row.settledAt, row.createdAt)
      })
    case 'contentAudit':
      return withMeta(moduleKey, row, {
        id: row.id,
        content: avatar(row.content || row.reason || row.title, row.targetType),
        user: avatar(row.userName || row.reporter?.nickname, row.userPhone),
        contentType: text(row.targetType, row.type),
        topic: text(row.topicName, row.circleName),
        reason: text(row.reason),
        heat: row.heat || row.count,
        status: statusText(row.status),
        createdAt
      })
    case 'posts':
      return withMeta(moduleKey, row, {
        id: row.id,
        content: avatar(row.title || row.content, row.summary),
        user: avatar(row.userName || row.user?.nickname, row.user?.phone),
        topic: text(row.topicName, row.circleName),
        views: row.viewCount || row.views,
        comments: row.commentCount,
        likes: row.likeCount,
        status: statusText(row.status || row.auditStatus),
        createdAt
      })
    case 'marketing':
      return withMeta(moduleKey, row, {
        id: row.id,
        activity: avatar(row.name || row.title, row.description),
        activityType: text(row.type, row.couponType),
        merchant: text(row.merchantName, row.scope),
        budget: money(row.budget, row.totalAmount),
        used: money(row.usedAmount, row.used),
        conversion: Number(row.conversion || 0),
        status: statusText(row.status),
        createdAt
      })
    case 'delivery':
      const rowUser = row.user || row.User
      const rowRider = row.rider || row.RegionRider
      return withMeta(moduleKey, row, {
        id: row.id,
        orderNo: text(row.orderNo, row.id),
        user: avatar(row.userName || rowUser?.nickname, row.userPhone || rowUser?.phone),
        rider: avatar(row.riderName || rowRider?.realName, row.riderPhone || rowRider?.phone || '未分配'),
        serviceType: text(row.serviceType, row.type),
        distance: text(row.distance ? `${row.distance}km` : ''),
        amount: money(row.amount, row.payAmount),
        status: statusText(row.status),
        createdAt
      })
    case 'system':
      return withMeta(moduleKey, row, {
        id: row.id || row.key,
        configName: text(row.name, row.key),
        configGroup: text(row.group, row.category),
        value: text(row.value),
        updatedBy: avatar(row.updatedBy || row.operator, row.updatedAt),
        status: statusText(row.status ?? 1),
        createdAt: text(row.updatedAt, createdAt)
      })
    case 'admins':
      return withMeta(moduleKey, row, {
        id: row.id,
        admin: avatar(row.nickname || row.name || row.username, row.phone),
        account: text(row.username, row.account),
        role: text(row.roleName, row.role?.name),
        scope: text(row.scope, row.dataScope, '全部数据'),
        lastLogin: text(row.lastLoginAt, row.lastLoginTime),
        status: statusText(row.status)
      })
    case 'files':
      return withMeta(moduleKey, row, {
        id: row.id,
        file: avatar(row.originalName || row.filename || row.name, row.url),
        fileType: text(row.mimeType, row.type),
        size: text(row.size),
        usage: text(row.scene, row.bizType),
        uploader: avatar(row.uploaderName || row.createdBy, row.uploaderId),
        status: statusText(row.status ?? 1),
        createdAt
      })
    default:
      return withMeta(moduleKey, row, row)
  }
}

function idOf(row: any) {
  return row?.id || row?.__raw?.id || row?.key || row?.__raw?.key
}

function rawOf(row: any) {
  return row?.__raw || row || {}
}

function cleanData(data: Record<string, any> = {}) {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('__') || value === undefined) continue
    out[key] = typeof value === 'object' && value && 'name' in value ? (value as any).name : value
  }
  return out
}

function normalizeWriteData(moduleKey: string, data: Record<string, any>) {
  const normalized = { ...data }
  const rename = (from: string, to: string) => {
    if (normalized[from] !== undefined && normalized[to] === undefined) {
      normalized[to] = normalized[from]
      delete normalized[from]
    }
  }
  if (moduleKey === 'merchants') {
    rename('merchant', 'name')
    rename('contact', 'contactName')
  }
  if (moduleKey === 'products') rename('product', 'name')
  if (moduleKey === 'posts') rename('content', 'title')
  if (moduleKey === 'marketing') rename('activity', 'name')
  if (moduleKey === 'admins') {
    rename('admin', 'name')
    rename('account', 'username')
  }
  if (moduleKey === 'system') {
    rename('configName', 'name')
    rename('configGroup', 'group')
  }
  return normalized
}

export async function fetchRiders(params: Record<string, any> = {}) {
  const data = await request.get('/admin/riders', { params: { page: 1, pageSize: 100, status: 'online', ...params } })
  return listOf(data).map((r: any) => ({
    ...r,
    id: r.userId || r.id,
    regionRiderId: r.id,
    name: r.realName || r.User?.nickname || r.phone || r.userId || r.id,
    phone: r.phone || r.User?.phone || '',
  }))
}

export async function fetchUserTags(params: Record<string, any> = {}) {
  const data = await request.get('/admin/user-tags', { params })
  return listOf(data)
}

export async function fetchRoles() {
  const data = await request.get('/admin/roles')
  return listOf(data)
}

export async function fetchRoleList() {
  return request.get('/admin/roles')
}

export async function fetchPermissions() {
  return request.get('/admin/permissions')
}

export async function createRole(data: Record<string, any>) {
  return request.post('/admin/roles', data)
}

export async function updateRole(id: string, data: Record<string, any>) {
  return request.put(`/admin/roles/${id}`, data)
}

export async function deleteRole(id: string) {
  return request.delete(`/admin/roles/${id}`)
}

export async function fetchMiniProgramPaths(params: Record<string, any> = {}) {
  return request.get('/admin/miniapp-pages/source-scan', { params })
}

async function putStatus(moduleKey: string, row: any, status: any) {
  const id = idOf(row)
  const endpoint = moduleEndpoint[moduleKey]
  if (!id || !endpoint) throw new Error('缺少业务 ID，无法更新状态')
  if (moduleKey === 'regions' || moduleKey === 'admins') return request.put(`${endpoint}/${id}/status`, { status: status === 'enabled' ? 1 : 0 })
  if (moduleKey === 'users' || moduleKey === 'merchants' || moduleKey === 'products' || moduleKey === 'orders') return request.put(`${endpoint}/${id}/status`, { status })
  if (moduleKey === 'marketing') return request.put(`${endpoint}/${id}/toggle`)
  return request.put(`${endpoint}/${id}`, { status })
}

async function auditOne(moduleKey: string, row: any, approved: boolean, reason?: string) {
  const id = idOf(row)
  if (!id) throw new Error('缺少业务 ID，无法审核')
  const status = approved ? 'approved' : 'rejected'
  if (moduleKey === 'verification') return request.put(`/admin/users/${id}/cert`, { status, reason })
  if (moduleKey === 'merchants') return request.put(`/admin/merchants/${id}/audit`, { status, remark: reason })
  if (moduleKey === 'products') return request.put(`/admin/products/${id}/audit`, { status, reason })
  if (moduleKey === 'posts') return request.put(`/admin/posts/${id}/audit`, { status, reason })
  if (moduleKey === 'contentAudit') return request.put(`/admin/reports/${id}/handle`, { status: approved ? 'handled' : 'rejected', result: reason })
  if (moduleKey === 'refunds') return request.put(`/admin/refunds/${id}/audit`, { status, remark: reason })
  return putStatus(moduleKey, row, approved ? 'approved' : 'rejected')
}

async function deleteOne(moduleKey: string, row: any) {
  const id = idOf(row)
  const endpoint = moduleEndpoint[moduleKey]
  if (!id || !endpoint) throw new Error('缺少业务 ID，无法删除')
  if (['users', 'finance', 'orders', 'refunds', 'delivery'].includes(moduleKey)) return putStatus(moduleKey, row, 'disabled')
  return request.delete(`${endpoint}/${id}`)
}

export function exportRows(filename: string, rows: any[]) {
  const visibleRows = rows.map(row => {
    const copy: Record<string, any> = {}
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('__')) continue
      copy[key] = typeof value === 'object' && value ? (value as any).name || JSON.stringify(value) : value
    }
    return copy
  })
  const headers = Array.from(new Set(visibleRows.flatMap(row => Object.keys(row))))
  const csv = [headers.join(','), ...visibleRows.map(row => headers.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export async function loginAdmin(data: { username: string; password: string }) {
  const res: any = await request.post('/auth/admin/login', data)
  const token = res?.token || res?.accessToken || res?.data?.token || res?.data?.accessToken
  if (token) {
    localStorage.setItem('LM_ADMIN_TOKEN', token)
    localStorage.setItem('admin_token', token)
  }
  return res
}

export async function logoutAdmin() {
  return request.post('/auth/admin/logout')
}

export async function getProfile() {
  return request.get('/auth/admin/profile')
}

export async function fetchDashboard() {
  const [stats, trends, regions, todos, orderSources, merchantRank] = await Promise.allSettled([
    request.get('/admin/dashboard'),
    request.get('/admin/dashboard/trends'),
    request.get('/admin/dashboard/regions'),
    request.get('/admin/dashboard/todos'),
    request.get('/admin/dashboard/order-sources'),
    request.get('/admin/dashboard/merchant-rank')
  ])
  return {
    stats: stats.status === 'fulfilled' ? stats.value : null,
    trends: trends.status === 'fulfilled' ? trends.value : [],
    regions: regions.status === 'fulfilled' ? listOf(regions.value) : [],
    todos: todos.status === 'fulfilled' ? todos.value : null,
    orderSources: orderSources.status === 'fulfilled' ? orderSources.value : null,
    merchantRank: merchantRank.status === 'fulfilled' ? merchantRank.value : null,
  }
}

const moduleStatsEndpoints: Record<string, string> = {
  verification: '/admin/verifications/stats',
  contentAudit: '/admin/reports/stats',
  posts: '/admin/posts/stats',
  refunds: '/admin/refunds/stats',
  orders: '/admin/orders/stats',
  merchants: '/admin/merchants/stats',
  products: '/admin/products/stats',
  regions: '/admin/regions/stats',
  finance: '/admin/finance/stats',
  delivery: '/admin/delivery-orders/stats',
  files: '/upload/files/stats',
}

export async function fetchModuleStats(key: string): Promise<Record<string, any>> {
  const ep = moduleStatsEndpoints[key]
  if (!ep) return {}
  try {
    return await request.get(ep)
  } catch {
    return {}
  }
}

export async function fetchModulePage(moduleKey: string, params: Record<string, any> = {}): Promise<PagePayload> {
  const endpoint = moduleEndpoint[moduleKey]
  if (!endpoint) return { rows: [], total: 0 }
  const query: Record<string, any> = { page: 1, pageSize: 10, ...params }
  if (moduleKey === 'verification') query.studentCertStatus = query.status || 'pending'
  if (moduleKey === 'delivery') {
    if (query.keyword && !query.orderNo) {
      query.orderNo = query.keyword
      delete query.keyword
    }
    if (Array.isArray(query.date)) {
      query.startDate = query.date[0]
      query.endDate = query.date[1]
      delete query.date
    }
  }
  const data = await request.get(endpoint, { params: query })
  const sourceRows = listOf(data)
  return {
    rows: sourceRows.map(row => mapRow(moduleKey, row)),
    total: totalOf(data, sourceRows)
  }
}

export async function runModuleAction(moduleKey: string, action: ModuleAction, payload: ActionPayload = {}) {
  const rows = payload.rows?.length ? payload.rows : payload.row ? [payload.row] : []
  const endpoint = moduleEndpoint[moduleKey]
  const data = normalizeWriteData(moduleKey, cleanData(payload.data))

  if (action === 'export') {
    exportRows(moduleKey, rows)
    return true
  }
  if (action === 'create') {
    if (!endpoint) throw new Error('该模块暂未配置新增接口')
    if (['verification', 'finance', 'orders', 'refunds', 'delivery', 'files'].includes(moduleKey)) throw new Error('该模块不支持后台直接新增')
    if (moduleKey === 'system') return request.put('/admin/configs', { configs: [data] })
    return request.post(endpoint, data)
  }
  if (action === 'update') {
    const row = payload.row
    const id = idOf(row)
    if (!id || !endpoint) throw new Error('缺少业务 ID，无法保存')
    if (moduleKey === 'system') return request.put('/admin/configs', { configs: [{ ...rawOf(row), ...data }] })
    return request.put(`${endpoint}/${id}`, data)
  }
  if (action === 'delete' || action === 'batchDelete') return Promise.all(rows.map(row => deleteOne(moduleKey, row)))
  if (action === 'enable' || action === 'batchEnable') return Promise.all(rows.map(row => putStatus(moduleKey, row, 'enabled')))
  if (action === 'disable' || action === 'batchDisable') return Promise.all(rows.map(row => putStatus(moduleKey, row, 'disabled')))
  if (action === 'approve' || action === 'batchApprove') return Promise.all(rows.map(row => auditOne(moduleKey, row, true, payload.reason)))
  if (action === 'reject' || action === 'batchReject') return Promise.all(rows.map(row => auditOne(moduleKey, row, false, payload.reason)))
  if (action === 'complete') {
    if (moduleKey === 'refunds') return Promise.all(rows.map(row => request.put(`/admin/refunds/${idOf(row)}/complete`, { transferNo: data.transferNo || data.transactionId })))
    return Promise.all(rows.map(row => putStatus(moduleKey, row, 'completed')))
  }
  if (action === 'assign') {
    if (moduleKey !== 'delivery') throw new Error('只有跑腿配送订单支持派单')
    if (!data.riderId) throw new Error('请选择骑手')
    return Promise.all(rows.map(row => request.post(`/admin/errand/orders/${idOf(row)}/assign`, { riderId: data.riderId })))
  }
  if (action === 'batchTag') {
    if (moduleKey !== 'users') throw new Error('只有用户管理支持批量标签')
    const tagIds = Array.isArray(data.tagIds) ? data.tagIds : []
    if (!tagIds.length) throw new Error('请选择用户标签')
    return Promise.all(rows.map(row => request.post(`/admin/users/${idOf(row)}/tags`, { tagIds })))
  }
  if (action === 'resetPassword') {
    if (moduleKey !== 'admins') throw new Error('只有管理员账号支持重置密码')
    if (!data.password) throw new Error('请输入新密码')
    return Promise.all(rows.map(row => request.put(`/admin/admins/${idOf(row)}/reset-password`, { password: data.password })))
  }
  if (action === 'cancel') {
    if (moduleKey === 'orders') return Promise.all(rows.map(row => request.put(`/admin/orders/${idOf(row)}/cancel`, { reason: payload.reason })))
    if (moduleKey === 'delivery') return Promise.all(rows.map(row => request.put(`/admin/errand/orders/${idOf(row)}/cancel`, { reason: payload.reason })))
    return Promise.all(rows.map(row => putStatus(moduleKey, row, 'cancelled')))
  }
  throw new Error('暂不支持该业务动作')
}

export async function uploadAdminFile(file: File, scene = 'admin') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('scene', scene)
  return request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export async function fetchRegions() {
  const data = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
  return listOf(data)
}

export async function fetchRegionDetail(id: string | number) {
  return request.get(`/admin/regions/${id}`)
}

export async function createRegion(data: any) {
  return request.post('/admin/regions', data)
}

export async function updateRegion(id: string | number, data: any) {
  return request.put(`/admin/regions/${id}`, data)
}

export async function fetchConfigGroup(group: string) {
  return request.get(`/admin/config-group/${group}`)
}

export async function saveConfigGroup(group: string, data: Record<string, any>) {
  return request.put(`/admin/config-group/${group}`, data)
}

export async function fetchRegionTabbar(regionId: string | number) {
  const res: any = await request.get('/admin/regions/tabbar', { params: { regionId } })
  return res?.data || res || null
}

export async function saveRegionTabbar(regionId: string | number, config: any) {
  return request.put('/admin/regions/tabbar', { regionId, config })
}

export async function fetchRegionShareSetting(regionId: string | number) {
  return request.get(`/admin/share/settings/${regionId}`)
}

export async function saveRegionShareSetting(regionId: string | number, data: any) {
  return request.put(`/admin/share/settings/${regionId}`, data)
}

// ==================== 邮箱配置 ====================

export async function fetchEmailConfig() {
  return request.get('/admin/email-config')
}

export async function saveEmailConfig(data: Record<string, any>) {
  return request.put('/admin/email-config', data)
}

export async function testEmailConfig(data: { toEmail: string; subject?: string; content?: string }) {
  return request.post('/admin/email-config/test', data)
}

// ==================== 微信模板消息 ====================

export async function fetchWechatTemplates(params: Record<string, any> = {}) {
  return request.get('/admin/wechat-templates', { params })
}

export async function createWechatTemplate(data: Record<string, any>) {
  return request.post('/admin/wechat-templates', data)
}

export async function updateWechatTemplate(id: string, data: Record<string, any>) {
  return request.put(`/admin/wechat-templates/${id}`, data)
}

export async function deleteWechatTemplate(id: string) {
  return request.delete(`/admin/wechat-templates/${id}`)
}

// ==================== 文件管理 ====================

export async function fetchUploadFiles(params: Record<string, any> = {}) {
  return request.get('/admin/upload-files', { params: { page: 1, pageSize: 20, ...params } })
}

// ==================== 存储配置 ====================

export async function fetchStorageConfig() {
  const res: any = await request.get('/admin/config/storage')
  return res?.data || res
}

export async function saveStorageConfig(data: Record<string, any>) {
  return request.put('/admin/config/storage', data)
}

export async function testStorageConfig(data: Record<string, any>) {
  return request.post('/admin/config/storage/test', data)
}

// ==================== AI 配置 ====================

export async function fetchAiConfig() {
  const res: any = await request.get('/admin/config/ai')
  return res?.data || res
}

export async function saveAiConfig(data: Record<string, any>) {
  return request.put('/admin/config/ai', data)
}

export async function testAiConfig() {
  return request.post('/admin/config/ai/test')
}

// ==================== 机器人配置 ====================

export async function fetchRobotConfig() {
  const res: any = await request.get('/admin/config/robot')
  return res?.data || res
}

export async function saveRobotConfig(data: Record<string, any>) {
  return request.put('/admin/config/robot', data)
}

// ==================== 用户管理扩展 ====================

export async function fetchUserStats() {
  return request.get('/admin/users/stats')
}

export async function createRobots(data: Record<string, any>) {
  return request.post('/admin/users/robots', data)
}

export async function fetchUserDetail(id: string) {
  return request.get(`/admin/users/${id}`)
}

// ==================== 微信 AccessToken ====================

export async function fetchWechatAccessToken(platform: string, data: Record<string, any> = {}) {
  return request.post(`/admin/config/wechat-token/${platform}`, data)
}

// ==================== AI 运营配置 ====================

export async function fetchAiOpsConfig() {
  return request.get('/admin/config/ai-ops')
}

export async function saveAiOpsConfig(data: Record<string, any>) {
  return request.put('/admin/config/ai-ops', data)
}

export async function resetAiOpsConfig() {
  return request.post('/admin/config/ai-ops/reset')
}

export async function testAiOpsGenerate(data: Record<string, any> = {}) {
  return request.post('/admin/config/ai-ops/test-generate', data)
}

// ==================== 区域运营工作台 ====================

export async function fetchRegionOpsOverview() {
  return request.get('/admin/ops/regions/overview')
}

export async function fetchRegionLaunchChecklist(regionId: string) {
  return request.get(`/admin/ops/regions/${regionId}/launch-checklist`)
}

export async function fetchRegionHealthScore(regionId: string) {
  return request.get(`/admin/ops/regions/${regionId}/health-score`)
}

export async function fetchRegionOpsTasks(regionId: string) {
  return request.get(`/admin/ops/regions/${regionId}/tasks`)
}

export async function completeRegionOpsTask(regionId: string, taskId: string) {
  return request.post(`/admin/ops/regions/${regionId}/tasks/${taskId}/complete`)
}

export async function generateRegionOpsTasks(regionId: string) {
  return request.post(`/admin/ops/regions/${regionId}/tasks/generate`)
}

// ==================== 高德地图配置 ====================

export async function fetchAmapConfig() {
  const res: any = await request.get('/admin/config/amap')
  return res?.data || res
}

export async function saveAmapConfig(data: Record<string, any>) {
  return request.put('/admin/config/amap', data)
}

export async function testAmapWebKey() {
  return request.post('/admin/config/amap/test-web')
}

export async function testAmapJsKey() {
  return request.post('/admin/config/amap/test-js')
}

// ==================== 高德地图代理服务 ====================

export async function amapGeocode(address: string, city?: string) {
  return request.post('/admin/amap/geocode', { address, city })
}

export async function amapRegeocode(longitude: number, latitude: number) {
  return request.post('/admin/amap/regeocode', { longitude, latitude })
}

export async function amapPlaceSearch(keywords: string, city?: string) {
  return request.post('/admin/amap/place-search', { keywords, city })
}

// ==================== 文件上传 ====================

export async function uploadImage(file: File, scene: string = 'default') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('scene', scene)
  return request.post('/admin/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// ==================== 学校库管理 ====================

export async function fetchSchools(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return request.get(`/admin/schools${qs ? '?' + qs : ''}`)
}

export async function fetchSchoolStats() {
  return request.get('/admin/schools/stats')
}

export async function createSchool(data: Record<string, any>) {
  return request.post('/admin/schools', data)
}

export async function updateSchool(id: string, data: Record<string, any>) {
  return request.put(`/admin/schools/${id}`, data)
}

export async function updateSchoolStatus(id: string, isEnabled: boolean) {
  return request.patch(`/admin/schools/${id}/status`, { isEnabled })
}

export async function deleteSchool(id: string) {
  return request.delete(`/admin/schools/${id}`)
}

export async function fetchRegionSchools(regionId: string) {
  return request.get(`/admin/regions/${regionId}/schools`)
}

export async function bindSchoolsToRegion(regionId: string, schoolIds: string[]) {
  return request.put(`/admin/regions/${regionId}/schools`, { schoolIds })
}

// ==================== 通知中心 ====================

export async function sendNotification(data: Record<string, any>) {
  return request.post('/admin/notifications/send', data)
}

export async function fetchWechatMessageLogs(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return request.get(`/admin/wechat-message-logs${qs ? '?' + qs : ''}`)
}

export async function retryWechatMessage(logId: string) {
  return request.post(`/admin/wechat-message-logs/${logId}/retry`)
}

export async function fetchRealtimeSessions(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return request.get(`/admin/realtime/sessions${qs ? '?' + qs : ''}`)
}

export async function testPushToUser(userId: string, message: string) {
  return request.post('/admin/realtime/test-push', { userId, message })
}

export async function fetchOfficialConversations(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return request.get(`/admin/realtime/official-conversations${qs ? '?' + qs : ''}`)
}

export async function fetchOfficialConversationMessages(conversationId: string, params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return request.get(`/admin/realtime/official-conversations/${conversationId}/messages${qs ? '?' + qs : ''}`)
}

export async function replyOfficialConversation(conversationId: string, content: string) {
  return request.post(`/admin/realtime/official-conversations/${conversationId}/reply`, { content })
}

// ==================== 微信公众号 ====================

export async function fetchWechatOfficialConfig() {
  return request.get('/admin/wechat/official/config')
}

export async function testWechatOfficialToken() {
  return request.post('/admin/wechat/official/test-token')
}

export async function generateWechatBindQrcode(userId: string) {
  return request.post('/admin/wechat/official/generate-bind-qrcode', { userId })
}

// ==================== 通知中心总览 ====================

export async function fetchNotifyStats() {
  return request.get('/admin/notifications/stats')
}

export async function fetchSubscribeConsents(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, String(value))
  })
  const qs = query.toString()
  return request.get(`/admin/wechat-subscribe-consents${qs ? '?' + qs : ''}`)
}

export async function fetchOfficialBindings(params: Record<string, any> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, String(value))
  })
  const qs = query.toString()
  return request.get(`/admin/wechat/official/bindings${qs ? '?' + qs : ''}`)
}

export async function deleteOfficialBinding(id: string) {
  return request.delete(`/admin/wechat/official/bindings/${id}`)
}

export async function broadcastToAll(message: string, title?: string) {
  return request.post('/admin/realtime/broadcast', { message, title })
}

export async function pushToRegion(regionId: string, message: string, title?: string) {
  return request.post('/admin/realtime/push-region', { regionId, message, title })
}
