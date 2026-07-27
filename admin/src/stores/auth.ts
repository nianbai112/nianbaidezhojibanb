import { defineStore } from 'pinia'
import { getProfile, loginAdmin, logoutAdmin, persistAdminLoginPayload } from '@/api/admin'

function parseStoredArray(key: string) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('LM_ADMIN_TOKEN') || '',
    user: { name: '运营管理员', role: localStorage.getItem('LM_ADMIN_ROLE') || '超级管理员' },
    permissions: parseStoredArray('LM_ADMIN_PERMISSIONS') as string[],
    menus: parseStoredArray('LM_ADMIN_MENUS') as Array<{ path?: string }>,
    passwordResetRequired: false,
    mfaEnabled: false,
  }),
  getters: {
    accessContext: (state) => ({
      role: state.user.role,
      permissions: state.permissions,
      menus: state.menus
    }),
    needsPasswordReset: (state) => state.passwordResetRequired,
  },
  actions: {
    applyLoginPayload(payload: any) {
      const data = persistAdminLoginPayload(payload)
      this.token = localStorage.getItem('LM_ADMIN_TOKEN') || data?.token || data?.accessToken || ''
      const user = data?.user || data
      this.user.name = user?.nickname || user?.realName || user?.username || data?.nickname || this.user.name
      this.user.role = user?.roleName || user?.role?.name || user?.roles?.[0]?.name || data?.role || this.user.role
      this.permissions = Array.isArray(data?.permissions) ? data.permissions : parseStoredArray('LM_ADMIN_PERMISSIONS')
      this.menus = Array.isArray(data?.menus) ? data.menus : parseStoredArray('LM_ADMIN_MENUS')
      this.passwordResetRequired = data?.forcePasswordReset || user?.passwordResetRequired || false
      this.mfaEnabled = user?.mfaEnabled || false
      localStorage.setItem('LM_ADMIN_ROLE', this.user.role)
      return data
    },
    async login(username: string, password: string, captcha?: { captchaId?: string; captcha?: string }, mfaCode?: string) {
      const data: any = await loginAdmin({ username, password, ...captcha, mfaCode })
      this.applyLoginPayload(data)
      if (!this.user.name) this.user.name = username
      return data
    },
    async loadProfile() {
      const profile: any = await getProfile()
      this.user.name = profile?.nickname || profile?.username || profile?.name || this.user.name
      this.user.role = profile?.roleName || profile?.role?.name || this.user.role
      this.passwordResetRequired = profile?.passwordResetRequired || false
      this.mfaEnabled = profile?.mfaEnabled || false
      this.permissions = Array.isArray(profile?.permissions) ? profile.permissions : this.permissions
      return profile
    },
    async logout() {
      try {
        if (this.token || localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')) {
          await logoutAdmin()
        }
      } catch {
        // 即使服务端退出接口失败，也必须允许管理员清理本地登录态。
      }
      this.token = ''
      this.permissions = []
      this.menus = []
      this.passwordResetRequired = false
      this.mfaEnabled = false
      localStorage.removeItem('LM_ADMIN_TOKEN')
      localStorage.removeItem('admin_token')
      localStorage.removeItem('LM_ADMIN_PERMISSIONS')
      localStorage.removeItem('LM_ADMIN_MENUS')
      localStorage.removeItem('LM_ADMIN_ROLE')
    }
  }
})
