export const CAMPUS_PROJECT_KEYS = [
  'officialNumber',
  'officialName',
  'engineeringAlias',
  'phase',
  'constructionStatus',
  'visibilityScope',
  'semanticType',
  'searchable',
  'navigable',
  'geometryStatus',
  'sourceConfidence',
]

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

export function applyCampusProject(item = {}, project = {}, kind = inferKind(item)) {
  const future = project.constructionStatus === 'under_construction' || project.phase === 'future'
  const officialName = String(project.officialName || '').trim()
  const previousTitle = String(item.title || '').trim()
  return {
    ...item,
    ...pickCampusProjectMetadata(project),
    officialNumber: Number(project.officialNumber),
    officialName,
    engineeringAlias: String(project.engineeringAlias || (previousTitle !== officialName ? previousTitle : '')).trim(),
    title: officialName || previousTitle,
    phase: future ? 'future' : 'phase1',
    constructionStatus: future ? 'under_construction' : 'built',
    visibilityScope: future ? 'future_reference' : 'phase1_active',
    semanticType: String(project.semanticType || item.semanticType || 'building'),
    searchable: !future,
    navigable: false,
    geometryStatus: kind === 'area' ? 'verified_polygon' : 'verified_point',
    sourceConfidence: 'official_signage_and_cad',
  }
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
