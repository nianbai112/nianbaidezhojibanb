import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

export const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000
})

request.interceptors.request.use(config => {
  const token = localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function withDataAlias<T>(value: T): T {
  if (value && typeof value === 'object' && !('data' in (value as any))) {
    try {
      Object.defineProperty(value as any, 'data', {
        value,
        enumerable: false,
        configurable: true
      })
    } catch {
      // Some readonly objects cannot be decorated; keep the original payload.
    }
  }
  return value
}

request.interceptors.response.use(
  response => {
    const payload = response.data
    const numericCode =
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      (typeof payload.code === 'number' || /^\d+$/.test(String(payload.code)))
    if (payload && typeof payload === 'object' && payload.success === false) {
      throw payload
    }
    if (numericCode && ![0, 200].includes(Number(payload.code))) {
      throw payload
    }
    return numericCode && 'data' in payload ? withDataAlias(payload.data) : withDataAlias(payload)
  },
  error => {
    const status = error?.response?.status
    const responseMessage = error?.response?.data?.message
    const rawMessage = error?.message || ''
    let message = Array.isArray(responseMessage)
      ? responseMessage.join('；')
      : responseMessage || rawMessage || '接口请求失败'

    if (!error?.response || rawMessage.includes('Network Error') || rawMessage.includes('ECONNREFUSED')) {
      message = '后端服务未启动或网络不可达，请确认 3000 端口正在运行'
    } else if ([500, 502, 503, 504].includes(status) && !responseMessage) {
      message = '后端接口异常，请查看后端终端日志或重启 3000 服务'
    } else if (status === 403) {
      message = '没有权限访问该功能，请联系超级管理员分配权限'
    }

    ElMessage.error(message)
    if (status === 401 && !router.currentRoute.value.path.includes('/login')) {
      localStorage.removeItem('LM_ADMIN_TOKEN')
      localStorage.removeItem('admin_token')
      router.push('/login')
    }
    return Promise.reject(error)
  }
)

export interface PageQuery { page?: number; pageSize?: number; [key: string]: any }
export function getPage<T = any>(url: string, params: PageQuery = {}) { return request.get<any, T>(url, { params }) }
export function postAction<T = any>(url: string, data: any = {}) { return request.post<any, T>(url, data) }
export function putAction<T = any>(url: string, data: any = {}) { return request.put<any, T>(url, data) }
export function deleteAction<T = any>(url: string, params: any = {}) { return request.delete<any, T>(url, { params }) }
