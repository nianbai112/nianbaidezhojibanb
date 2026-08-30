import { publicPlaceMedia } from './campusProjectModel.mjs'

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
  const taskType = normalizeTaskType(form.taskType, form.objectTypes, form.targetPlaceIds)
  return {
    name: String(form.name || '').trim(),
    instructions: String(form.instructions || '').trim(),
    status: String(form.status || 'draft'),
    collectorUserIds: [...new Set((form.collectorUserIds || []).map(String).filter(Boolean))],
    allowedClients: ['rider_app'],
    taskType,
    objectTypes: objectTypesForTaskType(taskType, form.objectTypes),
    targetPlaceIds: [...new Set((form.targetPlaceIds || []).map(String).filter(Boolean))],
    targetFeatureIds: [...new Set((form.targetFeatureIds || []).map(String).filter(Boolean))],
    priority: Number(form.priority) || 3,
    dueAt: form.dueAt || null,
    boundary: form.boundary || null,
  }
}

export const TASK_TYPES = [
  { value: 'route_collection', label: '路线采集' },
  { value: 'place_verification', label: '地点核验' },
  { value: 'mixed', label: '路线 + 地点综合采集' },
]

export function normalizeTaskType(taskType, objectTypes = [], targetPlaceIds = []) {
  if (TASK_TYPES.some((item) => item.value === taskType)) return taskType
  const types = new Set((objectTypes || []).map(String))
  const hasRoad = types.has('road')
  const hasPlace = (targetPlaceIds || []).length > 0 || [...types].some((type) => type !== 'road')
  if (hasRoad && hasPlace) return 'mixed'
  return hasRoad ? 'route_collection' : 'place_verification'
}

export function taskTypeLabel(task = {}) {
  const value = normalizeTaskType(task.taskType, task.objectTypes, task.targetPlaceIds)
  return TASK_TYPES.find((item) => item.value === value)?.label || value
}

export function objectTypesForTaskType(taskType, current = []) {
  if (taskType === 'route_collection') return ['road']
  if (taskType === 'place_verification') return ['place_verification']
  if (taskType === 'mixed') return ['road', 'place_verification']
  return [...new Set((current || []).map(String).filter(Boolean))]
}

export function buildPlaceTargetOptions(places = []) {
  const normalized = places.map((place, index) => {
    const targetId = String(place?.placeId || place?.id || '').trim()
    const officialNumber = Number(place?.officialNumber)
    const title = String(place?.officialName || place?.title || targetId || `未命名地点 ${index + 1}`)
    const featureKind = String(place?.featureKind || (Array.isArray(place?.points) ? 'area' : 'poi'))
    const selectable = place?.catalogBacked !== false
    return {
      ...place,
      id: targetId,
      placeId: targetId,
      title,
      featureKind,
      selectable,
      label: `${Number.isInteger(officialNumber) && officialNumber > 0 ? `#${officialNumber} ` : ''}${title} · ${featureKind === 'area' ? '建筑轮廓' : '点位'}${selectable ? '' : ' · 未建档，请先建立地点档案并绑定'}`,
    }
  }).filter((place) => place.id)
  return [...new Map(normalized.map((place) => [place.id, place])).values()]
}

export const REVIEW_APPLY_FIELDS = [
  { value: 'location', label: '真实位置' },
  { value: 'entrance', label: '主入口' },
  { value: 'address', label: '校内地址' },
  { value: 'constructionStatus', label: '建设状态' },
  { value: 'serviceStatus', label: '开放状态' },
  { value: 'geometry', label: '路线 / 轮廓' },
  { value: 'media', label: '现场照片' },
]

export function reviewApplyFieldsForObject(object = {}) {
  const objectType = String(object.objectType || '')
  const allowed = objectType === 'road'
    ? new Set(['geometry', 'media'])
    : objectType === 'place_verification'
      ? new Set(['location', 'entrance', 'address', 'constructionStatus', 'serviceStatus', 'media'])
      : new Set(['location', 'address', 'constructionStatus', 'serviceStatus', 'media'])
  return REVIEW_APPLY_FIELDS.filter((field) => allowed.has(field.value))
}

export function isImageEvidenceAttachment(attachment = {}) {
  const kind = String(attachment?.kind || 'photo').toLowerCase()
  const mimeType = String(attachment?.mimeType || '').toLowerCase()
  return ['photo', 'image'].includes(kind) || mimeType.startsWith('image/')
}

export function defaultReviewApplyFields(object = {}) {
  if (object.objectType === 'road') {
    const hasPhotoEvidence = Array.isArray(object.attachments)
      && object.attachments.some(isImageEvidenceAttachment)
    return ['geometry', ...(hasPhotoEvidence ? ['media'] : [])]
  }
  return []
}

export function buildReviewPayload(form = {}, object = {}) {
  const allowed = new Set(REVIEW_APPLY_FIELDS.map((item) => item.value))
  const applyFields = [...new Set((form.applyFields || []).map(String).filter((field) => allowed.has(field)))]
  const promoteAttachmentIds = [...new Set((form.promoteAttachmentIds || []).map(String).filter(Boolean))]
  return {
    decision: String(form.decision || 'approved'),
    note: String(form.note || '').trim(),
    targetPlaceId: String(form.targetPlaceId || object?.properties?.targetPlaceId || '').trim() || undefined,
    applyFields,
    promoteAttachmentIds: applyFields.includes('media') ? promoteAttachmentIds : [],
  }
}

export function reviewComparisonRows(currentPlace = {}, object = {}) {
  const properties = object.properties || {}
  const currentLocation = coordinateText(currentPlace.longitude, currentPlace.latitude)
  const candidateLocation = coordinateText(object.longitude, object.latitude)
  return [
    { field: 'location', label: '真实位置', current: currentLocation, candidate: candidateLocation },
    {
      field: 'entrance', label: '主入口',
      current: (currentPlace.entrances || []).find((item) => item.isPrimary)?.name || '--',
      candidate: properties.entranceCandidate?.name || '--',
    },
    { field: 'address', label: '校内地址', current: currentPlace.addressDescription || currentPlace.address || '--', candidate: properties.addressDescription || properties.address || properties.addressText || properties.campusAddress || '--' },
    { field: 'constructionStatus', label: '建设状态', current: currentPlace.constructionStatus || '--', candidate: properties.constructionStatus || '--' },
    { field: 'serviceStatus', label: '开放状态', current: currentPlace.serviceStatus || '--', candidate: properties.serviceStatus || properties.openStatus || '--' },
    { field: 'geometry', label: '路线 / 轮廓', current: currentPlace.geometryStatus || '--', candidate: geometrySummary(object.geometry) },
    { field: 'media', label: '现场照片', current: `${publicPlaceMedia(currentPlace).length} 张`, candidate: `${Array.isArray(object.attachments) ? object.attachments.filter(isImageEvidenceAttachment).length : 0} 张` },
  ]
}

export function objectGeometryPolyline(object = {}) {
  const geometry = object.geometry || {}
  if (geometry.type === 'LineString') return toRawPolyline((geometry.coordinates || []).map(([longitude, latitude]) => ({ longitude, latitude })))
  if (geometry.type === 'Polygon') return toRawPolyline((geometry.coordinates?.[0] || []).map(([longitude, latitude]) => ({ longitude, latitude })))
  if (geometry.type === 'Point') return toRawPolyline([{ longitude: geometry.coordinates?.[0], latitude: geometry.coordinates?.[1] }])
  return []
}

export function roadEvidenceNotes(object = {}) {
  const rows = []
  const push = (value, label = '旁注') => {
    const text = String(value || '').trim()
    if (text) rows.push({ label, text })
  }
  push(object?.properties?.note)
  push(object?.properties?.remarks)
  const qualityNotes = Array.isArray(object?.quality?.notes) ? object.quality.notes : []
  qualityNotes.forEach((note) => push(typeof note === 'object' ? note.text || note.note : note, typeof note === 'object' ? note.label : '质量旁注'))
  const markers = [
    ...(Array.isArray(object?.markers) ? object.markers : []),
    ...(Array.isArray(object?.evidence?.markers) ? object.evidence.markers : []),
  ]
  markers.forEach((marker) => push(marker?.note || marker?.text, marker?.templateLabelSnapshot || marker?.label || '沿途旁注'))
  return [...new Map(rows.map((row) => [`${row.label}:${row.text}`, row])).values()]
}

export function routeDependencyReviewState(object = {}) {
  const dependency = object?.objectType === 'road' ? object?.routeDependency : null
  if (!dependency) {
    return { visible: false, blocked: false, type: 'info', title: '', description: '' }
  }
  if (dependency.ready === true || dependency.status === 'ready') {
    return {
      visible: true,
      blocked: false,
      type: 'success',
      title: '上一段路线已审核并写入地图草稿',
      description: '共享路口已经过服务端核验，本段可以继续审核。',
    }
  }
  const messages = {
    waiting_review: ['请先审核上一段路线', '本段依赖上一段的共享路口；上一段审核并写入地图草稿后，才能通过本段。'],
    not_applied: ['上一段路线尚未写入地图草稿', '上一段虽然显示已通过，但缺少成功合并证据，请先重新处理上一段。'],
    resample_required: ['上一段路线正在等待重采', '请先完成上一段补采并审核替代结果，再处理本段。'],
    unavailable: ['上一段路线已不可用', '上一段已作废或被替代，本段必须重新关联可信共享路口。'],
    invalid: ['路线前置关系无效', '上一段与本段不属于同一采集会话，或共享路口字段不完整。'],
    anchor_invalid: ['上一段缺少可信路口证据', '上一段虽已通过，但末点或服务端锚点证据不完整，请先重新审核上一段路线。'],
    missing: ['找不到上一段路线', '上一段可能已删除、跨区域或数据不完整，本段暂不能通过。'],
  }
  const [title, description] = messages[dependency.status] || messages.missing
  return { visible: true, blocked: true, type: 'warning', title, description }
}

function coordinateText(longitude, latitude) {
  if (!hasCoordinate(longitude, latitude)) return '--'
  const lng = Number(longitude)
  const lat = Number(latitude)
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`
}

function hasCoordinate(longitude, latitude) {
  if (longitude === null || longitude === undefined || longitude === '') return false
  if (latitude === null || latitude === undefined || latitude === '') return false
  return Number.isFinite(Number(longitude)) && Number.isFinite(Number(latitude))
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
  road: '道路', place_verification: '地点核验', building: '建筑', entrance: '入口', facility: '设施', issue: '异常',
}

export function objectTypeLabel(objectType) {
  return OBJECT_TYPE_LABELS[objectType] || objectType || '--'
}

export const REVIEW_STATUSES = [
  { value: 'pending', label: '待审核', type: 'warning' },
  { value: 'approved', label: '已通过', type: 'success' },
  { value: 'resample', label: '要求重采', type: 'danger' },
  { value: 'superseded', label: '已补采替代', type: 'info', decision: false },
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
  push('校内地址', properties.addressDescription || properties.address || properties.addressText || properties.campusAddress)
  push('建设状态', properties.constructionStatus)
  push('开放状态', properties.serviceStatus)
  push('路面', properties.surface)
  push('开放状态', properties.openStatus)
  push('严重程度', properties.severity)
  push('无障碍通行', properties.accessible === undefined ? undefined : (properties.accessible ? '是' : '否'))
  push('现场说明', properties.note)
  return rows
}
