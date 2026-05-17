import { defineStore } from 'pinia'
import { getProfile, loginAdmin, logoutAdmin, persistAdminLoginPayload } from '@/api/admin'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('LM_ADMIN_TOKEN') || '',
    user: { name: '运营管理员', role: '超级管理员' }
  }),
  actions: {
    applyLoginPayload(payload: any) {
      const data = persistAdminLoginPayload(payload)
      this.token = localStorage.getItem('LM_ADMIN_TOKEN') || data?.token || data?.accessToken || ''
      const user = data?.user || data
      this.user.name = user?.nickname || user?.realName || user?.username || data?.nickname || this.user.name
      this.user.role = user?.roleName || user?.role?.name || user?.roles?.[0]?.name || data?.role || this.user.role
      return data
    },
    async login(username: string, password: string) {
      const data: any = await loginAdmin({ username, password })
      this.applyLoginPayload(data)
      if (!this.user.name) this.user.name = username
      return data
    },
    async loadProfile() {
      const profile: any = await getProfile()
      this.user.name = profile?.nickname || profile?.username || profile?.name || this.user.name
      this.user.role = profile?.roleName || profile?.role?.name || this.user.role
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
      localStorage.removeItem('LM_ADMIN_TOKEN')
      localStorage.removeItem('admin_token')
    }
  }
})
