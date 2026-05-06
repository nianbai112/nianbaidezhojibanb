/** 角色编码 */
export type RoleCode =
  | 'super_admin'      // 平台超级管理员
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'REGION_ADMIN'
  | 'MERCHANT'
  | 'area_admin'       // 区域管理员
  | 'merchant_admin'   // 商家管理员
  | 'rider'            // 骑手
  | 'customer_service' // 客服
  | 'auditor'          // 审核员

/** 角色 */
export interface Role {
  id: number
  code: RoleCode
  name: string
  description: string
  permissions: string[]
  menus: MenuItem[]
  status: 0 | 1
  createdAt: string
}

/** 管理员账号 */
export interface AdminUser {
  id: number
  username: string
  realName: string
  avatar: string
  phone: string
  email: string
  roleId: number
  roleCode: RoleCode
  roleName: string
  permissions?: string[]
  regionId?: number       // 区域管理员所属区域
  merchantId?: number     // 商家管理员所属商家
  status: 0 | 1
  lastLoginAt: string
  createdAt: string
}

/** 登录请求 */
export interface LoginRequest {
  username: string
  password: string
  captcha?: string
  captchaId?: string
  remember?: boolean
}

/** 登录响应 */
export interface LoginResponse {
  token: string
  accessToken?: string
  refreshToken: string
  expiresIn: number
  permissions?: string[]
  user: AdminUser
}

/** 菜单项 */
export interface MenuItem {
  id: number
  parentId: number
  name: string
  path: string
  component: string
  icon: string
  sort: number
  hidden: boolean
  keepAlive: boolean
  permission?: string
  children?: MenuItem[]
}

/** 权限标识 */
export type PermissionCode = string
