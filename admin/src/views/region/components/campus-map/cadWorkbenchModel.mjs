import { pickCampusProjectMetadata } from './campusProjectModel.mjs'

const FALLBACK_LAYER_NAME = '未分层'

export function cadFeatureRecords({ pois = [], areas = [], routes = [], calibrationPoints = [] } = {}) {
  return [
    ...areas.map((item) => cadFeatureRecord('area', item)),
    ...routes.map((item) => cadFeatureRecord('route', item)),
    ...pois.map((item) => cadFeatureRecord('poi', item)),
    ...calibrationPoints.map((item) => cadFeatureRecord('calibration', item)),
  ]
}

export function cadLayerRows(records = []) {
  const layerMap = new Map()
  records.forEach((record) => {
    if (record.kind === 'calibration') return
    const name = normalizeLayerName(record.layer)
    const row = layerMap.get(name) || {
      name,
      count: 0,
      poiCount: 0,
      areaCount: 0,
      routeCount: 0,
    }
    row.count += 1
    if (record.kind === 'poi') row.poiCount += 1
    if (record.kind === 'area') row.areaCount += 1
    if (record.kind === 'route') row.routeCount += 1
    layerMap.set(name, row)
  })
  return Array.from(layerMap.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })
}

export function isCadLayerVisible(layerName, hiddenLayers = new Set()) {
  return !hiddenLayers.has(normalizeLayerName(layerName))
}

export function campusMapWorkflowSteps({
  editorMode = 'image',
  hasVisualBaseMap = false,
  hasVectorBaseMap = false,
  featureCount = 0,
  calibrationPointCount = 0,
  canPublish = false,
} = {}) {
  const hasBase = Boolean(hasVisualBaseMap || hasVectorBaseMap)
  return [
    {
      key: 'cad',
      title: '画师矢量图',
      subtitle: hasBase ? '完整校园图已加载' : '等待加载 SVG',
      status: hasBase ? 'done' : 'current',
      disabled: false,
    },
    {
      key: 'draw',
      title: '地点与建筑',
      subtitle: featureCount ? `${featureCount} 个可控对象` : '名称、状态、照片',
      status: hasBase ? 'current' : 'todo',
      disabled: !hasBase,
    },
    {
      key: 'amap',
      title: '真实坐标',
      subtitle: calibrationPointCount ? `${calibrationPointCount} 个校准点` : '高德仅用于定位',
      status: calibrationPointCount >= 3 ? 'done' : 'todo',
      disabled: !hasBase && featureCount === 0,
    },
    {
      key: 'preview',
      title: '发布预览',
      subtitle: canPublish ? '可发布' : '检查后发布',
      status: canPublish ? 'done' : 'todo',
      disabled: featureCount === 0,
    },
  ]
}

export function normalizeLayerName(layerName) {
  const value = String(layerName || '').trim()
  return value || FALLBACK_LAYER_NAME
}

function cadFeatureRecord(kind, item = {}) {
  return {
    id: String(item.id || ''),
    kind,
    layer: normalizeLayerName(item.sourceLayer),
    title: String(item.title || defaultTitle(kind)),
    color: item.color || '',
    category: item.category || '',
    semanticType: item.semanticType || '',
    ...pickCampusProjectMetadata(item),
    xRatio: item.xRatio,
    yRatio: item.yRatio,
    points: Array.isArray(item.points) ? item.points : [],
  }
}

function defaultTitle(kind) {
  if (kind === 'poi') return '点位'
  if (kind === 'area') return '区域'
  if (kind === 'route') return '路线'
  return '校准点'
}
