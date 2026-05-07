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

request.interceptors.response.use(
  response => {
    const payload = response.data
    if (payload && typeof payload === 'object' && 'code' in payload && ![0, 200].includes(Number(payload.code))) {
      throw payload
    }
    return payload?.data ?? payload
  },
  error => {
    const message = error?.response?.data?.message || error?.message || '接口请求失败'
    ElMessage.error(message)
    if (error?.response?.status === 401) {
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
