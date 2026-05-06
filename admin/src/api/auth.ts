import request from '@/utils/request'
import type { ApiResponse } from '@/types/api'
import type { LoginRequest, LoginResponse, AdminUser } from '@/types/auth'

export const authApi = {
  /** 后台账号密码登录（后端如无此接口需自行实现） */
  login(data: LoginRequest) {
    return request.post<ApiResponse<LoginResponse>>('/admin/login', data)
  },

  /** 获取当前管理员信息 → 后端 admin/profile */
  getUserInfo() {
    return request.get<ApiResponse<AdminUser>>('/admin/profile')
  },

  /** 获取验证码（后端暂未强制校验时返回占位图） */
  getCaptcha() {
    return Promise.resolve({
      data: {
        code: 0,
        message: 'success',
        data: { captchaId: '', image: '' },
      },
    } as any)
  },

  /** 刷新 token → 后端 admin/refresh */
  refreshToken(refreshToken: string) {
    return request.post<ApiResponse<LoginResponse>>('/admin/refresh', { refreshToken })
  },

  /** 退出登录 → 后端 admin/logout */
  logout() {
    return request.post<ApiResponse>('/admin/logout')
  },
}
