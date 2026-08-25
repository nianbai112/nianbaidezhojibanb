export function accuracyBand(accuracy) {
  const value = Number(accuracy)
  if (Number.isFinite(value) && value <= 8) return { key: 'good', label: '良好', color: '#16a34a' }
  if (Number.isFinite(value) && value <= 15) return { key: 'review', label: '需复核', color: '#eab308' }
  return { key: 'poor', label: '较差', color: '#dc2626' }
}

export function toRawPolyline(points = []) {
  return points
    .filter((point) => Number.isFinite(Number(point?.longitude)) && Number.isFinite(Number(point?.latitude)))
    .map((point) => [Number(point.longitude), Number(point.latitude)])
}

export function buildCollectorPath(accessCode) {
  return `/campusMap/collector/index?code=${encodeURIComponent(String(accessCode || ''))}`
}

export function toSvgPolyline(points = [], width = 640, height = 320) {
  const line = points.filter((point) => Array.isArray(point) && point.length >= 2)
  if (!line.length) return ''
  if (line.length === 1) return `${width / 2},${height / 2}`
  const xs = line.map((point) => Number(point[0]))
  const ys = line.map((point) => Number(point[1]))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 8
  const xSpan = maxX - minX || 1
  const ySpan = maxY - minY || 1
  return line.map(([x, y]) => {
    const px = pad + ((Number(x) - minX) / xSpan) * (width - pad * 2)
    const py = height - pad - ((Number(y) - minY) / ySpan) * (height - pad * 2)
    return `${Number(px.toFixed(1))},${Number(py.toFixed(1))}`
  }).join(' ')
}

export function taskSessionCount(task = {}) {
  return Number(task?._count?.sessions ?? task?.sessions?.length ?? 0)
}

export function toCollectorOption(row = {}) {
  const user = row.User || row.user || {}
  const phone = String(row.phone || user.phone || '')
  return {
    value: String(row.userId || user.id || row.id || ''),
    label: String(row.realName || user.nickname || row.nickname || phone || '未命名骑手'),
    phone: /^\d{11}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone,
    uid: user.uid ?? row.uid ?? '',
    avatar: String(user.avatar || row.avatar || ''),
  }
}

export function buildProfessionalTaskPayload(form = {}) {
  return {
    name: String(form.name || '').trim(),
    instructions: String(form.instructions || '').trim(),
    status: String(form.status || 'draft'),
    collectorUserIds: [...new Set((form.collectorUserIds || []).map(String).filter(Boolean))],
    allowedClients: ['rider_app'],
    objectTypes: [...new Set((form.objectTypes || []).map(String).filter(Boolean))],
    priority: Number(form.priority) || 3,
    dueAt: form.dueAt || null,
    boundary: form.boundary || null,
  }
}

export function formatSessionDuration(session = {}) {
  const startedAt = new Date(session.startedAt).getTime()
  const endedAt = new Date(session.endedAt || Date.now()).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return '--'
  const seconds = Math.floor((endedAt - startedAt) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}分${seconds % 60}秒`
}

export const OBJECT_TYPE_LABELS = {
  road: '道路', building: '建筑', entrance: '入口', facility: '设施', issue: '异常',
}

export function objectTypeLabel(objectType) {
  return OBJECT_TYPE_LABELS[objectType] || objectType || '--'
}

export const REVIEW_STATUSES = [
  { value: 'pending', label: '待审核', type: 'warning' },
  { value: 'approved', label: '已通过', type: 'success' },
  { value: 'resample', label: '要求重采', type: 'danger' },
  { value: 'held', label: '已暂缓', type: 'info' },
  { value: 'void', label: '已作废', type: 'info' },
]

export function reviewStatusLabel(status) {
  return REVIEW_STATUSES.find((item) => item.value === status)?.label || status || '--'
}

export function reviewStatusType(status) {
  return REVIEW_STATUSES.find((item) => item.value === status)?.type || 'info'
}

export function geometrySummary(geometry = {}) {
  const type = String(geometry?.type || '')
  const coordinates = geometry?.coordinates
  if (type === 'LineString') {
    const count = Array.isArray(coordinates) ? coordinates.length : 0
    return `线 · ${count} 个点`
  }
  if (type === 'Polygon') {
    const ring = Array.isArray(coordinates?.[0]) ? coordinates[0] : []
    return `面 · ${Math.max(0, ring.length - 1)} 个顶点`
  }
  if (type === 'Point') return '点 · 单点定位'
  return type || '--'
}

export function objectPropertiesList(properties = {}) {
  const rows = []
  const push = (label, value) => {
    if (value === undefined || value === null || value === '') return
    rows.push({ label, value })
  }
  push('名称', properties.name)
  push('分类 / 用途', properties.subtype)
  push('路面', properties.surface)
  push('开放状态', properties.openStatus)
  push('严重程度', properties.severity)
  push('无障碍通行', properties.accessible === undefined ? undefined : (properties.accessible ? '是' : '否'))
  push('现场说明', properties.note)
  return rows
}
