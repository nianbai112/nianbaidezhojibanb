import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'
import { message } from 'ant-design-vue'
import router from '@/router'
import type { ApiResponse } from '@/types/api'

// 创建 axios 实例
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// 是否正在刷新 token
let isRefreshing = false
// 等待刷新 token 的请求队列
let pendingRequests: Array<(token: string) => void> = []

/** 获取 token（兼容 token / accessToken 字段） */
function getToken(): string | null {
  const stored = localStorage.getItem('admin_token')
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    return data.token || data.accessToken || null
  } catch {
    return stored
  }
}

/** 存储 token（兼容 token / accessToken 两种后端返回） */
export function setToken(tokenOrObj: string | { token?: string; accessToken?: string; refreshToken?: string }, refreshToken?: string): void {
  let tk = ''
  let rt = refreshToken || ''
  if (typeof tokenOrObj === 'string') {
    tk = tokenOrObj
  } else {
    tk = tokenOrObj.token || tokenOrObj.accessToken || ''
    rt = tokenOrObj.refreshToken || rt
  }
  localStorage.setItem('admin_token', JSON.stringify({ token: tk, refreshToken: rt }))
}

/** 清除 token */
export function clearToken(): void {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_user')
  localStorage.removeItem('admin_permissions')
}

// ----- 请求拦截器 -----
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ----- 响应拦截器 -----
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data

    // 成功：code 为 0 或 200
    if (res.code === 0 || res.code === 200 || res.code === undefined) {
      return response
    }

    // token 过期或无效
    if (res.code === 401) {
      if (!isRefreshing) {
        isRefreshing = true
        const stored = localStorage.getItem('admin_token')
        let refreshTokenVal = ''
        try {
          const data = stored ? JSON.parse(stored) : {}
          refreshTokenVal = data.refreshToken || ''
        } catch { /* ignore */ }

        if (refreshTokenVal) {
          return request
            .post('/admin/refresh', { refreshToken: refreshTokenVal })
            .then((refreshRes) => {
              const d = refreshRes.data.data || {}
              setToken(d.token || d.accessToken, d.refreshToken)
              pendingRequests.forEach((cb) => cb(d.token || d.accessToken))
              pendingRequests = []
              return request(response.config)
            })
            .catch(() => {
              clearToken()
              router.push('/login')
              return Promise.reject(res)
            })
            .finally(() => { isRefreshing = false })
        }
        // 没有 refreshToken，直接跳登录
        isRefreshing = false
        clearToken()
        router.push('/login')
        return Promise.reject(res)
      }

      // 正在刷新中，加入队列等待
      return new Promise((resolve) => {
        pendingRequests.push((token: string) => {
          if (response.config.headers) {
            response.config.headers.Authorization = `Bearer ${token}`
          }
          resolve(request(response.config))
        })
      })
    }

    // 其他业务错误
    message.error(res.message || '请求失败')
    return Promise.reject(res)
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearToken()
      router.push('/login')
      return Promise.reject(error)
    }
    // 网络错误
    if (!error.response) {
      message.error('网络连接失败，请检查网络')
      return Promise.reject(error)
    }
    const msg = (error.response?.data as any)?.message || error.message || '请求失败'
    message.error(msg)
    return Promise.reject(error)
  },
)

export default request
