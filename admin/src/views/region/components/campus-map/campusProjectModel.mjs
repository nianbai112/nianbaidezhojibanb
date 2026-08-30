export const CAMPUS_PROJECT_KEYS = [
  'placeId',
  'artworkFeatureKey',
  'artworkAnchorX',
  'artworkAnchorY',
  'artworkGeometry',
  'officialNumber',
  'officialName',
  'engineeringAlias',
  'phase',
  'constructionStatus',
  'publishStatus',
  'visibilityScope',
  'semanticType',
  'searchable',
  'navigable',
  'geometryStatus',
  'sourceConfidence',
  'address',
  'addressDescription',
  'serviceStatus',
  'unavailableMessage',
  'coordinateStatus',
  'longitude',
  'latitude',
]

export function campusProjectCatalogItems(response = {}) {
  const payload = response?.data ?? response
  if (Array.isArray(payload?.items)) return payload.items
  return Array.isArray(payload) ? payload : []
}

export function createCampusProjectCatalogLoader(fetchCatalog) {
  let activeLoad = null

  return async function loadCampusProjectCatalog(regionId, mapId) {
    const key = `${String(regionId || '')}:${String(mapId || '')}`
    if (activeLoad?.key === key) return activeLoad.promise

    const promise = Promise.resolve(fetchCatalog(regionId, mapId))
      .then(campusProjectCatalogItems)
    const entry = { key, promise }
    activeLoad = entry

    try {
      return await promise
    } finally {
      if (activeLoad === entry) activeLoad = null
    }
  }
}

const styles = {
  teaching: ['#0F766E', 'rgba(15, 118, 110, 0.22)'],
  dorm: ['#7C3AED', 'rgba(124, 58, 237, 0.22)'],
  canteen: ['#F97316', 'rgba(249, 115, 22, 0.22)'],
  office: ['#475569', 'rgba(71, 85, 105, 0.22)'],
  sports: ['#16A34A', 'rgba(22, 163, 74, 0.22)'],
  library: ['#2563EB', 'rgba(37, 99, 235, 0.22)'],
  gate: ['#DC2626', 'rgba(220, 38, 38, 0.22)'],
  parking: ['#334155', 'rgba(51, 65, 85, 0.22)'],
  research: ['#0369A1', 'rgba(3, 105, 161, 0.22)'],
  museum: ['#92400E', 'rgba(146, 64, 14, 0.22)'],
  building: ['#4F6272', 'rgba(79, 98, 114, 0.22)'],
}

const NON_NAVIGABLE_SERVICE_STATUSES = new Set(['unopened', 'temporarily_closed', 'closed'])

export function campusProjectAvailabilityError(project = {}) {
  const serviceStatus = String(project.serviceStatus || 'unknown')
  const title = String(project.displayName || project.officialName || '当前地点').trim()
  if (project.navigable === true && NON_NAVIGABLE_SERVICE_STATUSES.has(serviceStatus)) {
    return `地点“${title}”当前状态不能开启导航`
  }
  if (String(project.publishStatus || 'draft') === 'published'
    && serviceStatus !== 'open'
    && !String(project.unavailableMessage || '').trim()) {
    return `地点“${title}”不是“已开放”状态时必须填写用户端不可用说明`
  }
  return ''
}

export function applyCampusProject(item = {}, project = {}, kind = inferKind(item)) {
  const officialName = String(project.officialName || '').trim()
  const previousTitle = String(item.title || '').trim()
  const placeId = catalogPlaceId(project)
  const constructionStatus = String(project.constructionStatus || item.constructionStatus || 'built')
  const future = project.phase === 'future' || ['under_construction', 'planned'].includes(constructionStatus)
  return {
    ...item,
    ...pickCampusProjectMetadata(project),
    placeId,
    artworkFeatureKey: String(project.artworkFeatureKey || item.artworkFeatureKey || item.id || '').trim(),
    officialNumber: Number(project.officialNumber),
    officialName,
    engineeringAlias: String(project.engineeringAlias || (previousTitle !== officialName ? previousTitle : '')).trim(),
    title: officialName || previousTitle,
    phase: String(project.phase || item.phase || (future ? 'future' : 'phase1')),
    constructionStatus,
    publishStatus: String(project.publishStatus || item.publishStatus || 'draft'),
    visibilityScope: String(project.visibilityScope || item.visibilityScope || (future ? 'future_reference' : 'phase1_review')),
    semanticType: String(project.semanticType || item.semanticType || 'building'),
    searchable: project.searchable ?? item.searchable ?? false,
    navigable: project.navigable ?? item.navigable ?? false,
    geometryStatus: String(project.geometryStatus || (kind === 'area' ? 'verified_polygon' : 'verified_point')),
    sourceConfidence: String(project.sourceConfidence || item.sourceConfidence || 'official_signage_and_cad'),
  }
}

export function catalogPlaceId(project = {}, regionId = '') {
  const stableId = String(project.placeId || project.id || '').trim()
  if (stableId) return stableId
  const number = Number(project.officialNumber)
  if (!Number.isInteger(number) || number <= 0) return ''
  const scope = String(regionId || project.regionId || 'legacy').trim() || 'legacy'
  return `campus-place:${scope}:${number}`
}

export function catalogPlaceOption(project = {}, regionId = '') {
  const placeId = catalogPlaceId(project, regionId)
  const officialNumber = Number(project.officialNumber)
  const officialName = String(project.officialName || project.title || placeId || '未命名地点').trim()
  return {
    ...project,
    placeId,
    id: placeId,
    title: officialName,
    label: `${Number.isInteger(officialNumber) && officialNumber > 0 ? `#${officialNumber} ` : ''}${officialName}`,
  }
}

export function publicPlaceMedia(project = {}) {
  const media = Array.isArray(project.media)
    ? project.media
    : Array.isArray(project.publicMedia)
      ? project.publicMedia
      : null
  if (media) {
    return media.filter((item) => {
      if (!item || typeof item !== 'object' || !String(item.url || '').trim()) return false
      const kind = String(item.mediaType || item.kind || item.type || 'gallery').toLowerCase()
      const status = String(item.reviewStatus || item.auditStatus || item.status || 'approved').toLowerCase()
      const isPublic = item.isPublic ?? item.public ?? item.visibility !== 'private'
      return ['photo', 'image', 'cover', 'gallery', 'facade', 'entrance', 'signage', 'construction'].includes(kind)
        && ['approved', 'published', 'public'].includes(status)
        && isPublic !== false
    })
  }
  return (Array.isArray(project.photos) ? project.photos : [])
    .map((url, index) => ({ id: `legacy-photo-${index}`, url: String(url), kind: 'photo', reviewStatus: 'approved', isPublic: true }))
    .filter((item) => item.url)
}

export function publicPlacePhotoUrls(project = {}) {
  return publicPlaceMedia(project).map((item) => String(item.url)).filter(Boolean)
}

export function campusProjectCounts(items = []) {
  return items.reduce((counts, item) => {
    if (item?.visibilityScope === 'phase1_active') counts.active += 1
    if (item?.visibilityScope === 'phase1_review') counts.review += 1
    if (item?.visibilityScope === 'future_reference') counts.future += 1
    if (item?.geometryStatus === 'unmatched') counts.unmatched += 1
    return counts
  }, { active: 0, review: 0, future: 0, unmatched: 0 })
}

export function campusProjectStyle(item = {}) {
  const [stroke, fill] = styles[item.semanticType] || styles.building
  return { stroke, fill }
}

export function pickCampusProjectMetadata(item = {}) {
  return CAMPUS_PROJECT_KEYS.reduce((metadata, key) => {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') metadata[key] = item[key]
    return metadata
  }, {})
}

export function normalizeImportedPoiProject(item = {}) {
  if (isManaged(item)) return pickCampusProjectMetadata(item)
  const layer = String(item.sourceLayer || item.Layer || '').toLowerCase()
  if (layer !== 'labels' && layer !== 'entrances') return {}
  return reviewMetadata()
}

export function normalizeImportedAreaProject(item = {}) {
  if (isManaged(item)) return pickCampusProjectMetadata(item)
  const layer = String(item.sourceLayer || item.Layer || '').toLowerCase()
  if (layer !== 'buildings') return {}
  return reviewMetadata()
}

function isManaged(item) {
  return Boolean(item?.officialNumber || item?.visibilityScope || item?.constructionStatus)
}

function reviewMetadata() {
  return {
    visibilityScope: 'phase1_review',
    constructionStatus: 'built',
    geometryStatus: 'unmatched',
    searchable: false,
    navigable: false,
  }
}

function inferKind(item) {
  return Array.isArray(item?.points) && item.points.length >= 3 ? 'area' : 'poi'
}
