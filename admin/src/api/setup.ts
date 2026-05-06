import axios from 'axios'
import type { ApiResponse } from '@/types/api'

const setupRequest = axios.create({
  baseURL: window.location.origin,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export const setupApi = {
  status() {
    return setupRequest.get<ApiResponse>('/setup/status')
  },
  check(token: string) {
    return setupRequest.post<ApiResponse>('/setup/check', {}, { headers: { 'x-setup-token': token } })
  },
  init(data: any, token: string) {
    return setupRequest.post<ApiResponse>('/setup/init', data, { headers: { 'x-setup-token': token } })
  },
}
