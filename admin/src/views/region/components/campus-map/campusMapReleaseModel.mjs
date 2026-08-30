const RELEASE_STAGES = [
  ['binding', '档案绑定'],
  ['verification', '现场核验'],
  ['candidate', '发布候选'],
  ['version', '正式版本'],
  ['online', '用户在线'],
]

function clean(value) {
  return String(value ?? '').trim()
}

function projectId(place = {}) {
  const stable = clean(place.placeId || place.id)
  if (stable) return stable
  const number = Number(place.officialNumber)
  return Number.isInteger(number) && number > 0 ? `official-${number}` : ''
}

function featureId(feature = {}) {
  return clean(feature.id || feature.featureId)
}

function displayName(place = {}, fallback = '未命名地点') {
  const name = clean(place.officialName || place.title || place.name)
  const number = Number(place.officialNumber)
  return `${Number.isInteger(number) && number > 0 ? `#${number} ` : ''}${name || fallback}`
}

function hasArtworkCoordinates(place = {}) {
  if (place.artworkAnchorX == null || place.artworkAnchorY == null) return false
  if (clean(place.artworkAnchorX) === '' || clean(place.artworkAnchorY) === '') return false
  const x = Number(place.artworkAnchorX)
  const y = Number(place.artworkAnchorY)
  return Number.isFinite(x) && Number.isFinite(y)
}

function boundFeatureFor(place, features) {
  const stableId = projectId(place)
  const artworkFeatureKey = clean(place.artworkFeatureKey)
  return features.find((feature) => {
    if (artworkFeatureKey && featureId(feature) === artworkFeatureKey) return true
    return stableId && clean(feature.placeId) === stableId
  })
}

function isBound(place, features) {
  const officialNumber = Number(place.officialNumber)
  return Boolean(
    projectId(place)
    && Number.isInteger(officialNumber)
    && officialNumber > 0
    && (clean(place.artworkFeatureKey) || hasArtworkCoordinates(place) || boundFeatureFor(place, features)),
  )
}

function isVerified(place = {}) {
  return clean(place.coordinateStatus) === 'verified'
}

function hasAvailabilityExplanation(place = {}) {
  return clean(place.serviceStatus || 'unknown') === 'open'
    || Boolean(clean(place.unavailableMessage))
}

function isCandidate(place, features) {
  return isBound(place, features)
    && isVerified(place)
    && clean(place.publishStatus) === 'published'
    && clean(place.visibilityScope) === 'phase1_active'
    && hasAvailabilityExplanation(place)
}

function isFutureProject(place = {}) {
  return clean(place.phase) === 'future'
    || ['under_construction', 'planned'].includes(clean(place.constructionStatus))
}

function isFutureVisible(place = {}) {
  return isFutureProject(place) && (
    clean(place.visibilityScope) !== 'future_reference'
    || place.searchable === true
    || place.navigable === true
  )
}

function isValidFutureReference(place = {}) {
  return isFutureProject(place)
    && clean(place.visibilityScope) === 'future_reference'
    && place.searchable !== true
    && place.navigable !== true
}

function stage(key, label, completed, total, summary, forcePass = false) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0))
  return {
    key,
    label,
    completed: safeCompleted,
    total: safeTotal,
    status: forcePass || (safeTotal > 0 && safeCompleted === safeTotal) ? 'pass' : 'error',
    summary,
  }
}

function issue(input) {
  return { level: 'error', ...input }
}

function buildIssues({
  places,
  features,
  qualityChecks,
  boundPlaces,
  verifiedPlaces,
  candidatePlaces,
  activeVersion,
  publishedPlaceCount,
  publicationVerified,
  hasUnsavedChanges,
}) {
  const issues = []

  if (!places.length && !features.length) {
    issues.push(issue({
      key: 'binding:empty',
      stage: 'binding',
      title: '先建立地点档案',
      message: '还没有可与画师矢量图绑定的正式地点。',
      action: 'catalog',
    }))
  }

  places.filter((place) => !isBound(place, features)).forEach((place, index) => {
    const stableId = projectId(place)
    issues.push(issue({
      key: `binding:${stableId || index}`,
      stage: 'binding',
      title: `补齐 ${displayName(place)} 的图上绑定`,
      message: '需要稳定地点 ID、正式编号和画师图锚点。',
      placeId: stableId || undefined,
      featureId: clean(place.artworkFeatureKey) || undefined,
      action: 'catalog',
    }))
  })

  const knownFeatureIds = new Set(places.map((place) => clean(place.artworkFeatureKey)).filter(Boolean))
  const knownPlaceIds = new Set(places.map(projectId).filter(Boolean))
  features.filter((feature) => {
    const stableId = clean(feature.placeId)
    return !(stableId && knownPlaceIds.has(stableId)) && !knownFeatureIds.has(featureId(feature))
  }).forEach((feature, index) => {
    const id = featureId(feature)
    issues.push(issue({
      key: `binding-feature:${id || index}`,
      stage: 'binding',
      title: `绑定图层对象“${clean(feature.title) || '未命名'}”`,
      message: '该建筑或点位还没有对应的地点档案。',
      featureId: id || undefined,
      action: 'catalog',
    }))
  })

  places.filter(isFutureVisible).forEach((place, index) => {
    const stableId = projectId(place)
    issues.push(issue({
      key: `future-visible:${stableId || index}`,
      stage: 'candidate',
      title: `收回 ${displayName(place)} 的一期曝光`,
      message: '在建或未来建筑只能作为后台参考，不能搜索或导航。',
      placeId: stableId || undefined,
      featureId: clean(place.artworkFeatureKey) || undefined,
      action: 'catalog',
    }))
  })

  boundPlaces.filter((place) => !isVerified(place)).forEach((place, index) => {
    const stableId = projectId(place)
    issues.push(issue({
      key: `verification:${stableId || index}`,
      stage: 'verification',
      title: `派骑手核验 ${displayName(place)}`,
      message: '缺少审核通过的 GCJ-02 坐标；入口和必需照片也应同步核验。',
      placeId: stableId || undefined,
      featureId: clean(place.artworkFeatureKey) || undefined,
      action: 'collection',
    }))
  })

  places.filter((place) => !isValidFutureReference(place)
      && clean(place.serviceStatus) === 'unopened'
      && !clean(place.unavailableMessage))
    .forEach((place, index) => {
      const stableId = projectId(place)
      issues.push(issue({
        key: `availability:${stableId || index}`,
        stage: 'candidate',
        title: `说明 ${displayName(place)} 为什么未开放`,
        message: '未开放地点必须给用户一句可理解的说明。',
        placeId: stableId || undefined,
        featureId: clean(place.artworkFeatureKey) || undefined,
        action: 'catalog',
      }))
    })

  const coveredQualityKeys = new Set(['campus-projects', 'building-availability', 'public-places'])
  qualityChecks.filter((check) => check?.status === 'error' && !coveredQualityKeys.has(clean(check.key)))
    .forEach((check, index) => {
      const key = clean(check.key) || String(index)
      issues.push(issue({
        key: `quality:${key}`,
        stage: 'candidate',
        title: clean(check.label) || '修复发布检查项',
        message: clean(check.message) || '该检查项未通过。',
        action: 'quality',
      }))
    })

  if (hasUnsavedChanges) {
    issues.push(issue({
      key: 'draft-unpublished',
      stage: 'version',
      level: 'warning',
      title: '将当前改动生成正式版本',
      message: '草稿已变化，用户现在看到的仍然是旧版本。',
      action: 'publish',
    }))
  } else if (candidatePlaces.length && Number(activeVersion || 0) <= 0) {
    issues.push(issue({
      key: 'formal-version-missing',
      stage: 'version',
      title: '发布第一个正式版本',
      message: '发布候选已准备，但还没有不可变的线上版本。',
      action: 'publish',
    }))
  }

  if (Number(activeVersion || 0) > 0
    && (!publicationVerified || Number(publishedPlaceCount || 0) <= 0)) {
    issues.push(issue({
      key: 'online-not-verified',
      stage: 'online',
      title: '正式版本还没有完成用户端验证',
      message: '需要确认公共接口返回当前版本，且公开地点数大于 0。',
      action: 'quality',
    }))
  }

  return issues
}

export function buildCampusReleaseCockpit(input = {}) {
  const places = Array.isArray(input.places) ? input.places : []
  const features = Array.isArray(input.features) ? input.features : []
  const routes = Array.isArray(input.routes) ? input.routes : []
  const qualityChecks = Array.isArray(input.qualityChecks) ? input.qualityChecks : []
  const boundPlaces = places.filter((place) => isBound(place, features))
  const phaseOnePlaces = places.filter((place) => !isValidFutureReference(place))
  const phaseOneBoundPlaces = phaseOnePlaces.filter((place) => isBound(place, features))
  const verifiedPlaces = phaseOneBoundPlaces.filter(isVerified)
  const candidatePlaces = verifiedPlaces.filter((place) => isCandidate(place, features) && !isFutureVisible(place))
  const total = Math.max(places.length, new Set(features.map((feature) => clean(feature.placeId) || featureId(feature)).filter(Boolean)).size)
  const phaseOneTotal = phaseOnePlaces.length
  const qualityErrors = qualityChecks.filter((check) => check?.status === 'error')
  const activeVersion = Number(input.activeVersion || 0)
  const publicPlaceCount = Number(input.publishedPlaceCount || 0)
  const publicationVerified = Boolean(input.publicationVerified)
  const hasUnsavedChanges = Boolean(input.hasUnsavedChanges)

  const stages = [
    stage('binding', RELEASE_STAGES[0][1], boundPlaces.length, total, total ? '稳定地点和画师锚点' : '等待建立地点'),
    stage('verification', RELEASE_STAGES[1][1], verifiedPlaces.length, phaseOneTotal, phaseOneTotal ? '坐标、入口和证据' : '等待一期地点'),
    stage('candidate', RELEASE_STAGES[2][1], qualityErrors.length ? 0 : candidatePlaces.length, phaseOneTotal, qualityErrors.length ? `${qualityErrors.length} 项必须修复` : '一期公开且可解释'),
    stage('version', RELEASE_STAGES[3][1], activeVersion > 0 && !hasUnsavedChanges ? candidatePlaces.length : 0, phaseOneTotal, activeVersion > 0 ? `线上 v${activeVersion}` : '还没有正式版本'),
    stage('online', RELEASE_STAGES[4][1], publicationVerified ? publicPlaceCount : 0, phaseOneTotal, publicationVerified ? `${publicPlaceCount} 个公开地点` : '公共接口待验证'),
  ]

  const issues = buildIssues({
    places,
    features,
    routes,
    qualityChecks,
    boundPlaces: phaseOneBoundPlaces,
    verifiedPlaces,
    candidatePlaces,
    activeVersion,
    publishedPlaceCount: publicPlaceCount,
    publicationVerified,
    hasUnsavedChanges,
  })
  const first = issues[0]

  return {
    stages,
    issues,
    nextAction: first
      ? { action: first.action, label: first.title, message: first.message }
      : { action: 'quality', label: '查看发布检查', message: '五个阶段已完成' },
  }
}
