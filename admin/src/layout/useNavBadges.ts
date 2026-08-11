/**
 * 侧栏队列徽章聚合（2026-07-19）
 * 数据源：
 *  - GET /admin/dashboard/todos      → 审核举报/学生认证/商家审核/提现审核/异常订单/订单申诉
 *  - GET /admin/ops/alerts/summary   → 异常中心（pendingAlertCount）
 * 失败时保留上一次计数，不清零闪烁；60s 轮询，并响应 admin-header-stats-refresh 事件即时刷新。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { request } from '@/api/request'

export interface NavBadgeCounts {
  [key: string]: number
}

const counts: Ref<NavBadgeCounts> = ref({})
let timer: number | undefined
let started = false

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * request.ts 对 600ms 内相同 GET 做去重（ERR_CANCELED 静默拒绝）。
 * 仪表盘页也会拉 /admin/dashboard/todos，首屏同帧必然撞车——
 * 撞车时延迟 700ms 重试一次，保证徽章首轮渲染有数据。
 */
async function safeGet(url: string): Promise<any> {
  try {
    return await request.get(url)
  } catch (err: any) {
    if (err?.code === 'ERR_CANCELED') {
      await new Promise((resolve) => setTimeout(resolve, 700))
      return request.get(url).catch(() => undefined)
    }
    return undefined
  }
}

async function refresh() {
  const patch: NavBadgeCounts = {}
  const todos = await safeGet('/admin/dashboard/todos')
  if (todos) {
    patch.audit = toNum(todos?.pendingReports)
    patch.certs = toNum(todos?.pendingCerts)
    patch.merchantAudit = toNum(todos?.pendingMerchants)
    patch.withdrawals = toNum(todos?.pendingWithdraws)
    patch.errandAbnormal = toNum(todos?.abnormalOrders)
    patch.appeals = toNum(todos?.pendingOrderAppeals)
  }
  const summary = await safeGet('/admin/ops/alerts/summary')
  if (summary) {
    patch.alerts = toNum(summary?.pendingAlertCount)
  }
  // 接口失败时保留旧值，避免徽章闪烁
  counts.value = { ...counts.value, ...patch }
}

function handleExternalRefresh() {
  refresh()
}

export function useNavBadges() {
  onMounted(() => {
    if (!started) {
      started = true
      refresh()
      timer = window.setInterval(refresh, 60000)
      window.addEventListener('admin-header-stats-refresh', handleExternalRefresh)
    }
  })

  onBeforeUnmount(() => {
    if (timer) window.clearInterval(timer)
    window.removeEventListener('admin-header-stats-refresh', handleExternalRefresh)
    timer = undefined
    started = false
  })

  function badgeFor(key?: string): number {
    if (!key) return 0
    return counts.value[key] || 0
  }

  return { badgeCounts: counts, badgeFor, refreshBadges: refresh }
}
