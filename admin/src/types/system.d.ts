/** 操作日志 */
export interface OperationLog {
  id: number
  userId: number
  username: string
  module: string
  action: string
  target: string
  targetId: number | string
  detail: string
  ip: string
  userAgent: string
  createdAt: string
}

/** 文件存储配置 */
export interface StorageConfig {
  type: 'local' | 'aliyun_oss' | 'tencent_cos' | 'qiniu'
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  cdnDomain: string
  maxSize: number        // 最大上传大小，MB
  allowedTypes: string   // 允许的文件类型，逗号分隔
}

/** 微信支付配置 */
export interface WechatPayConfig {
  appId: string
  mchId: string
  apiKey: string
  apiV3Key: string
  serialNo: string
  privateKeyPath: string
  notifyUrl: string
  refundNotifyUrl: string
  status: 0 | 1
}

/** 系统配置项 */
export interface SystemConfig {
  id: number
  key: string
  value: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'image'
  group: string
  label: string
  description: string
  sort: number
}

/** 仪表盘统计数据 */
export interface DashboardStats {
  todayGmv: number
  yesterdayGmv: number
  gmvGrowth: number
  totalGmv: number
  todayOrders: number
  yesterdayOrders: number
  totalOrders: number
  orderGrowth: number
  totalUsers: number
  todayNewUsers: number
  userGrowth: number
  dauEstimate: number
  postCount: number
  commentCount: number
  merchantCount: number
  activeMerchantCount: number
  regionCount: number
  pendingPosts: number
  pendingMerchants: number
  pendingWithdraws: number
  pendingReports: number
  pendingRefunds: number
  pendingCerts: number
}

export interface TrendDataPoint {
  date: string
  gmv: number
  orders: number
  users: number
  posts: number
}

/** 区域/学校数据概览 */
export interface RegionOverview {
  id: string
  name: string
  code: string
  isOpen: boolean
  userCount: number
  postCount: number
  merchantCount: number
  orderCount: number
  createdAt: string
}

/** 菜单权限树 */
export interface PermissionTree {
  id: number
  parentId: number
  name: string
  code: string
  type: 'menu' | 'button' | 'api'
  children?: PermissionTree[]
}

/** 邮箱配置 */
export interface EmailConfig {
  id?: string
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromEmail?: string
  fromName?: string
  subjectPrefix?: string
  emailSignature?: string
  timeout?: number
}

/** 网站信息 */
export interface WebsiteInfo {
  siteName?: string
  siteShortName?: string
  siteLogo?: string
  icpNumber?: string
  policeNumber?: string
  policeLink?: string
  copyright?: string
}

/** 微信模板消息 */
export interface WechatTemplate {
  id: string
  platformType: string
  templateType: string
  templateId: string
  defaultPage?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** 小程序页面路径 */
export interface MiniappPage {
  id: string
  packageName?: string
  path: string
  title?: string
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

/** 上传文件记录 */
export interface UploadFileRecord {
  id: string
  userId: string
  fileName: string
  fileSize: number
  fileType: string
  mimeType?: string
  url: string
  scene?: string
  hash?: string
  ip?: string
  createdAt: string
}
