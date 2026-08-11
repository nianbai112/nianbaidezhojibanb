export function unwrapData<T = any>(res: any, fallback: T): T {
  const data = res?.data?.data ?? res?.data ?? res
  return (data ?? fallback) as T
}

export function unwrapPage(res: any) {
  const data = unwrapData<any>(res, {})
  if (Array.isArray(data)) return { list: data, total: data.length, page: 1, pageSize: data.length }
  const list = Array.isArray(data?.list)
    ? data.list
    : Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.records)
          ? data.records
          : []
  return {
    list,
    total: Number(data?.total ?? data?.count ?? data?.pagination?.total ?? list.length ?? 0),
    page: Number(data?.page ?? 1),
    pageSize: Number(data?.pageSize ?? list.length ?? 20),
  }
}

export function formatTime(value: any) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

export function formatMoney(value: any) {
  const amount = Number(value ?? 0)
  return `¥${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`
}

export function formatNumber(value: any) {
  const next = Number(value ?? 0)
  return Number.isFinite(next) ? next : 0
}

export function dateRangeFrom(row: any, startKey = 'startAt', endKey = 'endAt') {
  const start = row?.[startKey]
  const end = row?.[endKey]
  if (!start || !end) return null
  return [new Date(start), new Date(end)]
}

export function cleanPayload<T extends Record<string, any>>(payload: T): T {
  const next: Record<string, any> = {}
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return
    if (value === '') {
      next[key] = null
      return
    }
    next[key] = value
  })
  return next as T
}

export function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.message || fallback
}
