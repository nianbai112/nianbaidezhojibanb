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
