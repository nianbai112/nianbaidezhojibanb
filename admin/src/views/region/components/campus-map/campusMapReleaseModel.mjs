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

function officialNumberOf(value = {}) {
  const number = Number(value.officialNumber)
  return Number.isInteger(number) && number > 0 ? number : null
}

function normalizedPlaceName(value = {}) {
  return clean(value.officialName || value.title || value.name).replace(/\s+/g, '').toLowerCase()
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
  const officialNumber = officialNumberOf(place)
  return features.find((feature) => {
    if (artworkFeatureKey && featureId(feature) === artworkFeatureKey) return true
    if (stableId && clean(feature.placeId) === stableId) return true
    return officialNumber !== null && officialNumberOf(feature) === officialNumber
  })
}

function uniquelyNamedFeatureFor(place, places, features) {
  const name = normalizedPlaceName(place)
  if (!name) return undefined
  const placeMatches = places.filter((candidate) => normalizedPlaceName(candidate) === name)
  const featureMatches = features.filter((candidate) => normalizedPlaceName(candidate) === name)
  if (placeMatches.length !== 1 || featureMatches.length !== 1) return undefined
  return featureMatches[0]
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

function hasValidPublicCoordinate(place = {}) {
  const longitude = Number(place.longitude)
  const latitude = Number(place.latitude)
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && !(longitude === 0 && latitude === 0)
}

function isFutureProject(place = {}) {
  // phase 是历史目录分组，可能在管理员把建筑改为“已建”后仍残留 future。
  // 发布判断必须以地点档案中可见的建设状态为准。
  return ['under_construction', 'planned'].includes(clean(place.constructionStatus))
}

function isSelectedForRelease(place = {}) {
  if (clean(place.publishStatus) === 'hidden') return false
  const scope = clean(place.visibilityScope)
  // 没有 scope 的旧数据继续进入检查，避免静默漏发；明确“待后续采集”的记录不计本批。
  return scope === 'phase1_active' || !scope
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
    && clean(place.publishStatus) !== 'hidden'
    && clean(place.visibilityScope) === 'future_reference'
    && place.searchable !== true
    && place.navigable !== true
}

function batchStateNeedsPreparation(place, features) {
  if (clean(place.publishStatus) === 'hidden') return false
  if (isFutureProject(place)) {
    return clean(place.publishStatus) !== 'draft'
      || clean(place.visibilityScope) !== 'future_reference'
      || place.searchable === true
      || place.navigable === true
  }
  const eligible = isBound(place, features)
    && isVerified(place)
    && hasValidPublicCoordinate(place)
    && hasAvailabilityExplanation(place)
  if (eligible) {
    return clean(place.publishStatus) !== 'published'
      || clean(place.visibilityScope) !== 'phase1_active'
  }
  return clean(place.publishStatus) !== 'review'
    || clean(place.visibilityScope) !== 'phase1_review'
    || place.searchable === true
    || place.navigable === true
}

function stage(key, label, completed, total, summary, options = {}) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0))
  return {
    key,
    label,
    completed: safeCompleted,
    total: safeTotal,
    status: options.forceError
      ? 'error'
      : options.forcePass || (safeTotal > 0 && safeCompleted === safeTotal) ? 'pass' : 'error',
    summary,
  }
}

export function buildReleasePlaceBatch(catalog = [], features = []) {
  const canonicalPlaces = Array.isArray(catalog) ? catalog : []
  const drawableFeatures = Array.isArray(features) ? features : []
  const byStableKey = new Map()
  canonicalPlaces.forEach((place, index) => {
    const stableId = projectId(place)
    const number = officialNumberOf(place)
    const key = stableId || (number !== null ? `official-${number}` : `catalog-${index}`)
    const existing = byStableKey.get(key)
    byStableKey.set(key, existing ? { ...existing, ...place } : { ...place })
  })
  const canonicalBatch = [...byStableKey.values()]
  return canonicalBatch.map((place) => {
    const feature = boundFeatureFor(place, drawableFeatures)
      || uniquelyNamedFeatureFor(place, canonicalBatch, drawableFeatures)
    const stableId = projectId(place)
    if (!feature) return { ...place, id: stableId || place.id, placeId: stableId || place.placeId }
    return {
      // 地点档案是状态事实源；图形只提供坐标、几何和绘图标识，不能用旧草稿
      // 覆盖建设、审核或发布状态。
      ...feature,
      ...place,
      id: stableId || place.id,
      placeId: stableId || place.placeId,
      featureId: featureId(feature),
      artworkFeatureKey: clean(place.artworkFeatureKey) || featureId(feature),
    }
  })
}

function orphanFeaturesFor(places, features) {
  return features.filter((feature) => !places.some((place) => (
    boundFeatureFor(place, [feature])
    || uniquelyNamedFeatureFor(place, places, features) === feature
  )))
}

function issue(input) {
  return { level: 'error', ...input }
}

function buildIssues({
  places,
  catalogPlaces,
  features,
  qualityChecks,
  boundPlaces,
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

  orphanFeaturesFor(catalogPlaces || places, features)
    .filter((feature) => clean(feature.visibilityScope) === 'phase1_active'
      && clean(feature.publishStatus) === 'published')
    .forEach((feature, index) => {
    const id = featureId(feature)
    issues.push(issue({
      key: `binding-feature:${id || index}`,
      stage: 'binding',
      title: `绑定图层对象“${clean(feature.title) || '未命名'}”`,
      message: '该建筑或点位还没有对应的地点档案。',
      featureId: id || undefined,
      action: 'bindFeature',
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

  // 这是整改队列的批量修复项，必须排在绑定/核验这些具体问题之后，
  // 但又必须早于“发布草稿”，避免用旧状态生成正式版本。
  const batchDrift = (catalogPlaces || places).filter((place) => batchStateNeedsPreparation(place, features))
  if (batchDrift.length) {
    issues.push(issue({
      key: 'batch:prepare',
      stage: 'candidate',
      title: '按骑手审核结果更新本批范围',
      message: `${batchDrift.length} 个地点的发布状态与当前建设/核验条件不一致；统一整理后再发布。`,
      action: 'prepareBatch',
    }))
  }

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
      level: candidatePlaces.length ? 'warning' : 'error',
      title: candidatePlaces.length ? '发布本批并自动验证用户端' : '正式版本还没有完成用户端验证',
      message: candidatePlaces.length
        ? '当前线上版没有公开地点；点击“发布本批”后，系统会自动检查公共接口和公开地点数。'
        : '需要确认公共接口返回当前版本，且公开地点数大于 0。',
      action: candidatePlaces.length ? 'publish' : 'quality',
    }))
  }

  return issues
}

export function buildCampusReleaseCockpit(input = {}) {
  const places = Array.isArray(input.places) ? input.places : []
  const features = Array.isArray(input.features) ? input.features : []
  const routes = Array.isArray(input.routes) ? input.routes : []
  const qualityChecks = Array.isArray(input.qualityChecks) ? input.qualityChecks : []
  const futureReferencePlaces = places.filter(isValidFutureReference)
  const deferredPlaces = places.filter((place) => clean(place.publishStatus) !== 'hidden'
    && !isSelectedForRelease(place)
    && !isValidFutureReference(place))
  const releasePlaces = places.filter(isSelectedForRelease)
  const boundPlaces = releasePlaces.filter((place) => isBound(place, features))
  const verifiedPlaces = boundPlaces.filter(isVerified)
  const candidatePlaces = verifiedPlaces.filter((place) => isCandidate(place, features) && !isFutureVisible(place))
  const releaseTotal = releasePlaces.length
  const orphanFeatures = orphanFeaturesFor(places, features)
    .filter((feature) => clean(feature.visibilityScope) === 'phase1_active'
      && clean(feature.publishStatus) === 'published')
  const qualityErrors = qualityChecks.filter((check) => check?.status === 'error')
  const activeVersion = Number(input.activeVersion || 0)
  const publicPlaceCount = Number(input.publishedPlaceCount || 0)
  const publicationVerified = Boolean(input.publicationVerified)
  const hasUnsavedChanges = Boolean(input.hasUnsavedChanges)

  const stages = [
    stage('binding', RELEASE_STAGES[0][1], boundPlaces.length, releaseTotal,
      orphanFeatures.length ? `${orphanFeatures.length} 个图形未归档` : '本批稳定地点和画师锚点',
      { forceError: orphanFeatures.length > 0 }),
    stage('verification', RELEASE_STAGES[1][1], verifiedPlaces.length, releaseTotal, releaseTotal ? '本批坐标、入口和证据' : '等待本批地点'),
    stage('candidate', RELEASE_STAGES[2][1], qualityErrors.length ? 0 : candidatePlaces.length, releaseTotal, qualityErrors.length ? `${qualityErrors.length} 项必须修复` : '本批公开且可解释'),
    stage('version', RELEASE_STAGES[3][1], activeVersion > 0 && publicPlaceCount > 0 && !hasUnsavedChanges ? candidatePlaces.length : 0, releaseTotal,
      activeVersion > 0 && publicPlaceCount > 0 ? `线上 v${activeVersion}` : candidatePlaces.length ? '本批待发布' : '还没有正式版本'),
    stage('online', RELEASE_STAGES[4][1], publicationVerified ? publicPlaceCount : 0, releaseTotal, publicationVerified ? `${publicPlaceCount} 个公开地点` : '公共接口待验证'),
  ]

  const issues = buildIssues({
    places: releasePlaces,
    catalogPlaces: places,
    features,
    routes,
    qualityChecks,
    boundPlaces,
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
    scope: {
      releaseTotal,
      deferredCount: deferredPlaces.length,
      futureReferenceCount: futureReferencePlaces.length,
      orphanFeatureCount: orphanFeatures.length,
    },
    nextAction: first
      ? { ...first, label: first.title }
      : { action: 'quality', stage: 'online', label: '查看发布检查', message: '五个阶段已完成' },
  }
}
