import { request } from '@/api/request'

/**
 * 共享幂等 GET：app-pages 页多个编辑器（首页/消息页/我的页等）以 keep-alive
 * 同时挂载时，会并发发起完全相同的 GET（主题、区域列表、区域详情等），
 * 触发 request 层 600ms 相同 GET 去重 → 静默取消（ERR_CANCELED），后到编辑器
 * 拿不到数据。这里对相同 url+params 的请求在 ttl 内共享同一个 Promise，
 * 从根上消除去重竞态；ttl 过后自动失效，不影响手动刷新拿到新数据。
 */
const inflight = new Map<string, Promise<any>>()

export function sharedGet<T = any>(url: string, params?: Record<string, any>, ttl = 3000): Promise<T> {
  const key = `${url}?${JSON.stringify(params || {})}`
  const hit = inflight.get(key)
  if (hit) return hit as Promise<T>
  const p = request.get(url, params ? { params } : undefined) as Promise<T>
  inflight.set(key, p)
  const clear = () => setTimeout(() => {
    if (inflight.get(key) === p) inflight.delete(key)
  }, ttl)
  p.then(clear, clear)
  return p
}
