export function accuracyBand(accuracy) {
  const value = Number(accuracy)
  if (Number.isFinite(value) && value <= 8) return { key: 'good', label: '良好', color: '#16a34a' }
  if (Number.isFinite(value) && value <= 15) return { key: 'review', label: '需复核', color: '#eab308' }
  return { key: 'poor', label: '较差', color: '#dc2626' }
}

export function toCollectorOption(value = {}) {
  return {
    value: String(value.userId || value.id || ''),
    uid: Number(value.uid || 0),
    label: String(value.nickname || value.realName || '未命名骑手'),
    realName: String(value.realName || ''),
    phone: String(value.phone || ''),
    avatar: String(value.avatar || ''),
    regionId: String(value.regionId || ''),
  }
}

export function buildProfessionalTaskPayload(value = {}) {
  const objectTypes = ['road', 'building', 'entrance', 'facility', 'issue']
  return {
    name: String(value.name || '').trim(),
    instructions: String(value.instructions || '').trim(),
    status: String(value.status || 'draft'),
    collectorUserIds: [...new Set((value.collectorUserIds || []).map(String).filter(Boolean))],
    allowedClients: ['rider_app'],
    objectTypes: (value.objectTypes || []).filter((item) => objectTypes.includes(item)),
    priority: Number(value.priority) || 3,
    ...(value.dueAt ? { dueAt: String(value.dueAt) } : {}),
    ...(value.boundary ? { boundary: value.boundary } : {}),
  }
}

export function toCollectionFeatures(objects = []) {
  return {
    type: 'FeatureCollection',
    features: objects
      .filter((item) => item?.id && item?.geometry?.type && Array.isArray(item.geometry.coordinates))
      .map((item) => ({
        type: 'Feature',
        id: item.id,
        geometry: item.geometry,
        properties: {
          ...(item.properties || {}),
          objectType: item.objectType,
          reviewStatus: item.reviewStatus,
        },
      })),
  }
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

export function formatSessionDuration(session = {}) {
  const startedAt = new Date(session.startedAt).getTime()
  const endedAt = new Date(session.endedAt || Date.now()).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return '--'
  const seconds = Math.floor((endedAt - startedAt) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}分${seconds % 60}秒`
}
