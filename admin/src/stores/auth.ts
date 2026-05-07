import { defineStore } from 'pinia'
import { getProfile, loginAdmin } from '@/api/admin'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('LM_ADMIN_TOKEN') || '',
    user: { name: '运营管理员', role: '超级管理员' }
  }),
  actions: {
    async login(username: string, password: string) {
      const data: any = await loginAdmin({ username, password })
      this.token = localStorage.getItem('LM_ADMIN_TOKEN') || data?.token || data?.accessToken || ''
      this.user.name = data?.user?.nickname || data?.user?.username || username
      this.user.role = data?.user?.roleName || data?.user?.role?.name || '运营管理员'
      return data
    },
    async loadProfile() {
      const profile: any = await getProfile()
      this.user.name = profile?.nickname || profile?.username || profile?.name || this.user.name
      this.user.role = profile?.roleName || profile?.role?.name || this.user.role
      return profile
    },
    logout() {
      this.token = ''
      localStorage.removeItem('LM_ADMIN_TOKEN')
      localStorage.removeItem('admin_token')
    }
  }
})
