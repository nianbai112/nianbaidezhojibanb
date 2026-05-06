import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import { setToken, clearToken } from '@/utils/request'
import type { AdminUser, LoginRequest, RoleCode } from '@/types/auth'

/* ───── 内部工具 ───── */

/** 从 user 对象中提取角色 code（兼容多种后端返回格式） */
function extractRoleCode(u: Record<string, any> | null): string | null {
  if (!u) return null
  // 1. 直接字段 roleCode / role_code
  if (u.roleCode) return u.roleCode as string
  if (u.role_code) return u.role_code as string
  // 2. 嵌套 role 对象
  if (u.role && typeof u.role === 'object' && u.role.code) return u.role.code as string
  // 3. roles 数组第一项
  if (Array.isArray(u.roles) && u.roles.length > 0) {
    const first = u.roles[0]
    if (typeof first === 'string') return first
    if (typeof first === 'object' && first !== null) {
      return (first.code || first.roleCode || first.role_code || null) as string | null
    }
  }
  return null
}

/** 判断是否超级管理员（支持多种格式） */
function isSuperAdminCode(code: string | null): boolean {
  if (!code) return false
  const c = code.toUpperCase()
  return c === 'SUPER_ADMIN' || c === 'SUPER ADMIN'
}

/** 判断 user 对象中是否包含超级管理员角色 */
function userHasSuperRole(u: Record<string, any> | null): boolean {
  if (!u) return false
  // 角色 code 直接匹配
  const code = extractRoleCode(u)
  if (isSuperAdminCode(code)) return true
  // roles 数组中任一匹配
  if (Array.isArray(u.roles)) {
    return u.roles.some((r: any) => {
      if (typeof r === 'string') return isSuperAdminCode(r)
      if (typeof r === 'object' && r !== null) {
        return isSuperAdminCode(r.code || r.roleCode || r.role_code || null)
      }
      return false
    })
  }
  return false
}

/** 从登录/用户信息响应中提取权限列表 */
function extractPermissions(d: Record<string, any>, userObj: Record<string, any> | null): string[] {
  // 1. 直接 permissions 数组
  if (Array.isArray(d.permissions) && d.permissions.length > 0) return d.permissions
  // 2. user 对象下的 permissions
  if (d.user && Array.isArray(d.user.permissions) && d.user.permissions.length > 0) return d.user.permissions
  if (userObj && Array.isArray(userObj.permissions) && userObj.permissions.length > 0) return userObj.permissions
  // 3. 超级管理员自动赋予 *
  if (userHasSuperRole(userObj ?? d.user ?? d)) return ['*']
  // 4. 根据 roleCode 兜底
  const code = extractRoleCode(userObj ?? d.user ?? d)
  if (code) return getDefaultPermissions(code)
  return []
}

/* ───── Store ───── */

export const useUserStore = defineStore('user', () => {
  const user = ref<AdminUser | null>(null)
  const token = ref<string>('')
  const permissions = ref<string[]>([])

  const isLoggedIn = computed(() => !!token.value)

  /** 从 user 对象中提取角色 code */
  const roleCode = computed<RoleCode | null>(() => {
    return extractRoleCode(user.value as any) as RoleCode | null
  })

  /** 超级管理员：roleCode 或 roles 数组中任一匹配 */
  const isSuperAdmin = computed(() => {
    if (isSuperAdminCode(roleCode.value)) return true
    // 权限列表中包含 * 也视作超级管理员
    if (permissions.value.includes('*')) return true
    return userHasSuperRole(user.value as any)
  })

  const isAreaAdmin = computed(() => roleCode.value === 'area_admin' || roleCode.value === 'ADMIN')
  const isMerchantAdmin = computed(() => roleCode.value === 'merchant_admin')
  const regionId = computed(() => (user.value as any)?.regionId ?? null)
  const merchantId = computed(() => (user.value as any)?.merchantId ?? null)

  /* ───── 权限检查 ───── */

  /** 检查是否有某权限
   *  - super_admin / * 直接 true
   *  - 精确匹配
   *  - 模块通配符：如 user:* 匹配 user:view / user:ban 等
   */
  function hasPermission(code: string): boolean {
    if (isSuperAdmin.value) return true
    if (permissions.value.includes('*')) return true
    if (permissions.value.includes(code)) return true
    // 模块通配符：shop:* → shop:view / shop:order:view 等
    const colon = code.indexOf(':')
    if (colon > 0) {
      const prefix = code.substring(0, colon)
      const wildcard = prefix + ':*'
      return permissions.value.includes(wildcard)
    }
    return false
  }

  /** 检查是否有任一权限 */
  function hasAnyPermission(codes: string[]): boolean {
    if (isSuperAdmin.value) return true
    if (permissions.value.includes('*')) return true
    return codes.some((c) => hasPermission(c))
  }

  /* ───── 生命周期 ───── */

  /** 登录 */
  async function login(data: LoginRequest) {
    const res = await authApi.login(data)
    const d = res.data?.data || res.data
    // 兼容 token / accessToken
    const tk = d?.token || d?.accessToken || ''
    const rt = d?.refreshToken || ''
    const u = d?.user || d
    token.value = tk
    user.value = u
    setToken({ token: tk, refreshToken: rt })
    const perms = extractPermissions(d, u)
    permissions.value = perms
    localStorage.setItem('admin_user', JSON.stringify(u))
    localStorage.setItem('admin_permissions', JSON.stringify(perms))
  }

  /** 获取用户信息（刷新页面后恢复） */
  async function fetchUserInfo() {
    const res = await authApi.getUserInfo()
    const d: any = res.data?.data || res.data
    user.value = d as AdminUser
    const perms = extractPermissions(d, d)
    permissions.value = perms
    localStorage.setItem('admin_user', JSON.stringify(d))
    localStorage.setItem('admin_permissions', JSON.stringify(perms))
  }

  /** 退出登录 */
  function logout() {
    try { authApi.logout() } catch { /* ignore */ }
    token.value = ''
    user.value = null
    permissions.value = []
    clearToken()
  }

  /** 从 localStorage 恢复状态（刷新页面时） */
  function restoreState() {
    const stored = localStorage.getItem('admin_token')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        token.value = data.token || data.accessToken || ''
      } catch {
        token.value = stored
      }
    }
    const storedUser = localStorage.getItem('admin_user')
    if (storedUser) {
      try { user.value = JSON.parse(storedUser) } catch { /* ignore */ }
    }
    const storedPerms = localStorage.getItem('admin_permissions')
    if (storedPerms) {
      try { permissions.value = JSON.parse(storedPerms) } catch { /* ignore */ }
    }
  }

  return {
    user, token, permissions,
    isLoggedIn, roleCode, isSuperAdmin, isAreaAdmin, isMerchantAdmin,
    regionId, merchantId,
    hasPermission, hasAnyPermission,
    login, fetchUserInfo, logout, restoreState,
  }
})

/* ───── 默认权限映射（兜底） ───── */

/** 根据角色获取默认权限 */
function getDefaultPermissions(roleCode: string): string[] {
  const map: Record<string, string[]> = {
    super_admin: ['*'],
    SUPER_ADMIN: ['*'],
    area_admin: [
      'dashboard:view', 'region:view', 'region:edit',
      'user:view', 'user:edit', 'user:ban', 'user:cert',
      'post:audit', 'post:delete', 'post:top', 'comment:audit', 'comment:delete', 'report:handle',
      'merchant:view', 'merchant:audit', 'product:view', 'review:manage',
      'order:view', 'order:refund',
      'delivery:view', 'rider:view', 'rider:audit',
      'errand:config:view', 'errand:config:update',
      'errand:item-size:view', 'errand:item-size:create', 'errand:item-size:update', 'errand:item-size:delete',
      'errand:pickup-point:view', 'errand:pickup-point:create', 'errand:pickup-point:update', 'errand:pickup-point:delete',
      'errand:stats:view',
      'finance:view', 'finance:settlement', 'withdraw:view',
      'coupon:view', 'coupon:edit', 'activity:view', 'activity:edit', 'groupbuy:view', 'groupbuy:edit',
      'content:manage', 'circle:manage', 'system:config',
    ],
    ADMIN: [
      'dashboard:view', 'region:view', 'region:edit',
      'user:view', 'user:edit', 'user:ban', 'user:cert',
      'post:audit', 'post:delete', 'post:top', 'comment:audit', 'comment:delete', 'report:handle',
      'merchant:view', 'merchant:audit', 'product:view', 'review:manage',
      'order:view', 'order:refund',
      'delivery:view', 'rider:view', 'rider:audit',
      'errand:config:view', 'errand:config:update',
      'errand:item-size:view', 'errand:item-size:create', 'errand:item-size:update', 'errand:item-size:delete',
      'errand:pickup-point:view', 'errand:pickup-point:create', 'errand:pickup-point:update', 'errand:pickup-point:delete',
      'errand:stats:view',
      'finance:view', 'finance:settlement', 'withdraw:view',
      'coupon:view', 'coupon:edit', 'activity:view', 'activity:edit', 'groupbuy:view', 'groupbuy:edit',
      'content:manage', 'circle:manage', 'system:config',
    ],
    merchant_admin: [
      'dashboard:view',
      'product:view', 'product:edit', 'order:view', 'merchant:view',
      'finance:view',
    ],
    rider: ['delivery:view', 'rider:view'],
    customer_service: [
      'user:view',
      'post:audit', 'report:handle',
      'content:manage',
    ],
    auditor: [
      'dashboard:view',
      'post:audit', 'comment:audit', 'report:handle',
      'merchant:audit', 'review:manage',
      'rider:audit',
    ],
  }
  return map[roleCode] || []
}
