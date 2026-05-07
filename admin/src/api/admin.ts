import { request } from './request'

export interface PagePayload {
  rows: any[]
  total: number
  stats?: any[]
  sideMetrics?: any[]
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
    processing: '处理中'
  }
  return map[s] || s || '正常'
}

function avatar(name: any, sub?: any, extra?: any) {
  return { name: text(name), sub: text(sub, extra, '') }
}

function mapRow(moduleKey: string, row: any) {
  const createdAt = text(row.createdAt, row.createTime, row.updatedAt, row.submitTime)
  switch (moduleKey) {
    case 'regions':
      return {
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
      }
    case 'users':
    case 'verification':
      return {
        id: row.id,
        user: avatar(row.nickname || row.name || row.username, row.phone || row.openid),
        phone: text(row.phone, row.mobile),
        school: text(row.schoolName, row.school, row.university, row.region?.name),
        cert: statusText(row.studentCertStatus || row.certStatus),
        realName: text(row.realName, row.name),
        studentNo: text(row.studentId, row.studentNo),
        posts: row.postCount,
        orders: row.orderCount,
        amount: money(row.consumeAmount, row.totalAmount, row.balance),
        status: statusText(row.status),
        createdAt
      }
    case 'merchants':
      return {
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
      }
    case 'products':
      return {
        id: row.id,
        product: avatar(row.name || row.title, row.description),
        merchant: text(row.merchantName, row.merchant?.name),
        category: text(row.categoryName, row.category?.name),
        price: money(row.price, row.salePrice),
        stock: row.stock,
        sales: row.sales,
        status: statusText(row.status || row.auditStatus),
        createdAt: text(row.updatedAt, createdAt)
      }
    case 'orders':
      return {
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
      }
    case 'refunds':
      return {
        id: row.id,
        orderNo: text(row.refundNo, row.orderNo, row.id),
        user: avatar(row.userName || row.user?.nickname, row.userPhone),
        merchant: text(row.merchantName, row.merchant?.name),
        reason: text(row.reason, row.remark),
        amount: money(row.amount, row.refundAmount),
        status: statusText(row.status),
        createdAt
      }
    case 'finance':
      return {
        id: row.id,
        flowNo: text(row.flowNo, row.transactionNo, row.id),
        merchant: text(row.merchantName, row.userName, row.targetName),
        tradeType: text(row.type, row.tradeType),
        orderAmount: money(row.amount, row.orderAmount),
        fee: money(row.fee, row.serviceFee),
        merchantIncome: money(row.merchantIncome, row.settleAmount),
        status: statusText(row.status),
        settledAt: text(row.settledAt, row.createdAt)
      }
    case 'contentAudit':
      return {
        id: row.id,
        content: avatar(row.content || row.reason || row.title, row.targetType),
        user: avatar(row.userName || row.reporter?.nickname, row.userPhone),
        contentType: text(row.targetType, row.type),
        topic: text(row.topicName, row.circleName),
        reason: text(row.reason),
        heat: row.heat || row.count,
        status: statusText(row.status),
        createdAt
      }
    case 'posts':
      return {
        id: row.id,
        content: avatar(row.title || row.content, row.summary),
        user: avatar(row.userName || row.user?.nickname, row.user?.phone),
        topic: text(row.topicName, row.circleName),
        views: row.viewCount || row.views,
        comments: row.commentCount,
        likes: row.likeCount,
        status: statusText(row.status || row.auditStatus),
        createdAt
      }
    case 'marketing':
      return {
        id: row.id,
        activity: avatar(row.name || row.title, row.description),
        activityType: text(row.type, row.couponType),
        merchant: text(row.merchantName, row.scope),
        budget: money(row.budget, row.totalAmount),
        used: money(row.usedAmount, row.used),
        conversion: Number(row.conversion || 0),
        status: statusText(row.status),
        createdAt
      }
    case 'delivery':
      return {
        id: row.id,
        orderNo: text(row.orderNo, row.id),
        user: avatar(row.userName || row.user?.nickname, row.userPhone),
        rider: avatar(row.riderName || row.rider?.name, row.riderPhone),
        serviceType: text(row.serviceType, row.type),
        distance: text(row.distance ? `${row.distance}km` : ''),
        amount: money(row.amount, row.payAmount),
        status: statusText(row.status),
        createdAt
      }
    case 'system':
      return {
        id: row.id || row.key,
        configName: text(row.name, row.key),
        configGroup: text(row.group, row.category),
        value: text(row.value),
        updatedBy: avatar(row.updatedBy || row.operator, row.updatedAt),
        status: statusText(row.status ?? 1),
        createdAt: text(row.updatedAt, createdAt)
      }
    case 'admins':
      return {
        id: row.id,
        admin: avatar(row.nickname || row.name || row.username, row.phone),
        account: text(row.username, row.account),
        role: text(row.roleName, row.role?.name),
        scope: text(row.scope, row.dataScope, '全部数据'),
        lastLogin: text(row.lastLoginAt, row.lastLoginTime),
        status: statusText(row.status)
      }
    case 'files':
      return {
        id: row.id,
        file: avatar(row.originalName || row.filename || row.name, row.url),
        fileType: text(row.mimeType, row.type),
        size: text(row.size),
        usage: text(row.scene, row.bizType),
        uploader: avatar(row.uploaderName || row.createdBy, row.uploaderId),
        status: statusText(row.status ?? 1),
        createdAt
      }
    default:
      return row
  }
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

export async function getProfile() {
  return request.get('/auth/admin/profile')
}

export async function fetchDashboard() {
  const [stats, trends, regions] = await Promise.allSettled([
    request.get('/admin/dashboard'),
    request.get('/admin/dashboard/trends'),
    request.get('/admin/dashboard/regions')
  ])
  return {
    stats: stats.status === 'fulfilled' ? stats.value : null,
    trends: trends.status === 'fulfilled' ? trends.value : [],
    regions: regions.status === 'fulfilled' ? listOf(regions.value) : []
  }
}

export async function fetchModulePage(moduleKey: string, params: Record<string, any> = {}): Promise<PagePayload> {
  const endpoint = moduleEndpoint[moduleKey]
  if (!endpoint) return { rows: [], total: 0 }
  const query: Record<string, any> = { page: 1, pageSize: 10, ...params }
  if (moduleKey === 'verification') query.studentCertStatus = query.status || 'pending'
  const data = await request.get(endpoint, { params: query })
  const sourceRows = listOf(data)
  return {
    rows: sourceRows.map(row => mapRow(moduleKey, row)),
    total: totalOf(data, sourceRows)
  }
}

export async function fetchRegions() {
  const data = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
  return listOf(data)
}

export async function updateRegion(id: string | number, data: any) {
  return request.put(`/admin/regions/${id}`, data)
}
