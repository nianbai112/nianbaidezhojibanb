import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

export const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000
})

const recentGetRequests = new Map<string, number>()
let lastErrorToast = { key: '', at: 0 }

function getRequestKey(config: any) {
  return `${String(config?.method || 'get').toLowerCase()}:${config?.baseURL || ''}:${config?.url || ''}:${JSON.stringify(config?.params || {})}`
}

function showErrorOnce(message: string) {
  const now = Date.now()
  if (lastErrorToast.key === message && now - lastErrorToast.at < 3000) return
  lastErrorToast = { key: message, at: now }
  ElMessage.error(message)
}

request.interceptors.request.use(config => {
  const token = localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (String(config.method || 'get').toLowerCase() === 'get') {
    const now = Date.now()
    if (recentGetRequests.size > 200) {
      recentGetRequests.forEach((at, requestKey) => {
        if (now - at > 600) recentGetRequests.delete(requestKey)
      })
    }
    const key = getRequestKey(config)
    const lastAt = recentGetRequests.get(key) || 0
    recentGetRequests.set(key, now)
    if (now - lastAt < 600) {
      const error: any = new Error('重复请求已忽略')
      error.__silent = true
      error.code = 'ERR_CANCELED'
      return Promise.reject(error)
    }
  }
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

function normalizeApiErrorMessage(value: any) {
  const text = String(value || '').trim()
  const lower = text.toLowerCase()
  if (!text) return ''
  if (lower.includes('tx.comment.create')) {
    return '发布评论失败：评论数据写入异常，请联系技术处理'
  }
  if (lower.includes('tx.post.create')) {
    return '发布笔记失败：笔记数据写入异常，请联系技术处理'
  }
  if (lower.includes('transaction already closed') || text.includes('事务')) {
    return '任务执行时间过长，系统已自动中断，请稍后重试；如果反复出现请联系技术处理'
  }
  if (lower.includes('fetch failed') || lower.includes('network error')) {
    return 'AI服务连接失败，请检查模型配置、网络或服务商接口状态'
  }
  if (text.includes('/backend/src/') || text.includes('/Users/')) {
    return '后端处理异常，请联系技术处理'
  }
  return text
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
    if (error?.__silent || error?.code === 'ERR_CANCELED') return Promise.reject(error)
    const status = error?.response?.status
    const responseMessage = error?.response?.data?.message
    const rawMessage = error?.message || ''
    let message = Array.isArray(responseMessage)
      ? responseMessage.join('；')
      : responseMessage || rawMessage || '接口请求失败'
    message = normalizeApiErrorMessage(message) || '接口请求失败'

    const isTimeout = error?.code === 'ECONNABORTED' || rawMessage.toLowerCase().includes('timeout')
    const isNetworkError = rawMessage.includes('Network Error') || rawMessage.includes('ECONNREFUSED')
    if (isTimeout) {
      message = '请求超时，请稍后重试'
    } else if (!error?.response || isNetworkError) {
      message = '后台服务暂时不可用，请稍后刷新重试'
    } else if ([500, 502, 503, 504].includes(status) && !responseMessage) {
      message = '系统暂时繁忙，请稍后重试'
    } else if (status === 403) {
      message = '没有权限访问该功能，请联系超级管理员分配权限'
    }

    showErrorOnce(message)
    error.userMessage = message
    error.message = message
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
