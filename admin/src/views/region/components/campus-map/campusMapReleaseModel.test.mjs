import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCampusReleaseCockpit, buildReleasePlaceBatch } from './campusMapReleaseModel.mjs'

const readyPlace = {
  id: 'place-3',
  placeId: 'place-3',
  officialNumber: 3,
  officialName: '天枢楼',
  artworkFeatureKey: 'area-3',
  artworkAnchorX: 120,
  artworkAnchorY: 220,
  coordinateStatus: 'verified',
  longitude: 108.75,
  latitude: 30.97,
  constructionStatus: 'built',
  publishStatus: 'published',
  visibilityScope: 'phase1_active',
  serviceStatus: 'open',
  searchable: true,
}

test('binding blockers outrank later release blockers', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ id: 'place-4', officialName: '天启楼', coordinateStatus: 'pending' }],
    features: [{ id: 'area-4', title: '天启楼' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: true,
  })

  assert.equal(result.stages.length, 5)
  assert.deepEqual(result.stages.map((stage) => stage.key), [
    'binding',
    'verification',
    'candidate',
    'version',
    'online',
  ])
  assert.equal(result.issues[0].stage, 'binding')
  assert.equal(result.issues[0].action, 'catalog')
  assert.equal(result.nextAction.action, 'catalog')
})

test('fully published data completes all five stages', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(result.stages.map((stage) => stage.status), ['pass', 'pass', 'pass', 'pass', 'pass'])
  assert.equal(result.issues.length, 0)
  assert.equal(result.nextAction.action, 'quality')
})

test('a generated version is not online until the public response is verified', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.equal(result.stages.at(-1).status, 'error')
  assert.equal(result.issues.at(-1).key, 'online-not-verified')
  assert.equal(result.issues.at(-1).level, 'warning')
  assert.equal(result.issues.at(-1).action, 'publish')
  assert.equal(result.stages.find((stage) => stage.key === 'version').summary, '本批待发布')
})

test('future buildings and missing field evidence stay ahead of draft publication issues', () => {
  const future = {
    ...readyPlace,
    id: 'place-15',
    placeId: 'place-15',
    officialNumber: 15,
    officialName: '学生餐厅',
    constructionStatus: 'under_construction',
    visibilityScope: 'phase1_active',
    coordinateStatus: 'pending',
  }
  const result = buildCampusReleaseCockpit({
    places: [future],
    features: [{ id: 'area-15', placeId: 'place-15' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 2,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: true,
  })

  assert.deepEqual(result.issues.slice(0, 3).map((issue) => issue.key), [
    'future-visible:place-15',
    'verification:place-15',
    'batch:prepare',
  ])
  assert.equal(result.issues[3].key, 'draft-unpublished')
})

test('a valid future reference does not block the phase-one release stages', () => {
  const futureReference = {
    ...readyPlace,
    id: 'place-15',
    placeId: 'place-15',
    officialNumber: 15,
    officialName: '学生餐厅',
    artworkFeatureKey: 'area-15',
    phase: 'future',
    constructionStatus: 'under_construction',
    visibilityScope: 'future_reference',
    coordinateStatus: 'pending',
    publishStatus: 'draft',
    searchable: false,
    navigable: false,
  }
  const result = buildCampusReleaseCockpit({
    places: [readyPlace, futureReference],
    features: [
      { id: 'area-3', placeId: 'place-3' },
      { id: 'area-15', placeId: 'place-15' },
    ],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(result.stages.map((stage) => stage.status), ['pass', 'pass', 'pass', 'pass', 'pass'])
  assert.equal(result.stages.find((stage) => stage.key === 'binding').total, 1)
  assert.equal(result.stages.find((stage) => stage.key === 'candidate').total, 1)
  assert.deepEqual(new Set(result.stages.map((stage) => stage.total)), new Set([1]))
  assert.equal(result.scope.futureReferenceCount, 1)
  assert.equal(result.issues.length, 0)
})

test('a built place is not treated as future when a stale legacy phase remains', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ ...readyPlace, phase: 'future', constructionStatus: 'built' }],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })
  assert.equal(result.issues.some((issue) => issue.key.startsWith('future-visible:')), false)
  assert.equal(result.scope.releaseTotal, 1)
})

test('places explicitly left for later collection do not block the rolling release batch', () => {
  const deferred = {
    ...readyPlace,
    id: 'place-4', placeId: 'place-4', officialNumber: 4, officialName: '天启楼',
    coordinateStatus: 'uncollected', publishStatus: 'review', visibilityScope: 'phase1_review',
  }
  const result = buildCampusReleaseCockpit({
    places: [readyPlace, deferred],
    features: [{ id: 'area-3', placeId: 'place-3' }, { id: 'area-4', placeId: 'place-4' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 7,
    publishedPlaceCount: 1,
    publicationVerified: true,
    hasUnsavedChanges: false,
  })
  assert.equal(result.scope.releaseTotal, 1)
  assert.equal(result.scope.deferredCount, 1)
  assert.equal(result.issues.some((issue) => issue.key === 'verification:place-4'), false)
})

test('the existing rectification queue owns rolling-batch preparation when catalog state drifts', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ ...readyPlace, publishStatus: 'review', visibilityScope: 'phase1_review' }],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [], qualityChecks: [], activeVersion: 2, publishedPlaceCount: 0,
    publicationVerified: false, hasUnsavedChanges: false,
  })
  assert.equal(result.issues[0].key, 'batch:prepare')
  assert.equal(result.issues[0].action, 'prepareBatch')
})

test('canonical catalog status wins over stale drawing properties', () => {
  const [place] = buildReleasePlaceBatch([
    { ...readyPlace, publishStatus: 'review', visibilityScope: 'phase1_review' },
  ], [{
    id: 'area-3', placeId: 'place-3', publishStatus: 'published', visibilityScope: 'phase1_active',
    constructionStatus: 'planned', phase: 'future',
  }])
  assert.equal(place.publishStatus, 'review')
  assert.equal(place.visibilityScope, 'phase1_review')
  assert.equal(place.constructionStatus, readyPlace.constructionStatus)
  assert.equal(place.featureId, 'area-3')
})

test('hidden places stay outside both the current and later collection counts', () => {
  const result = buildCampusReleaseCockpit({
    places: [
      readyPlace,
      { ...readyPlace, id: 'place-16', placeId: 'place-16', officialNumber: 16,
        publishStatus: 'hidden', visibilityScope: 'future_reference', coordinateStatus: 'uncollected' },
      { ...readyPlace, id: 'place-17', placeId: 'place-17', officialNumber: 17,
        publishStatus: 'review', visibilityScope: 'future_reference', coordinateStatus: 'uncollected' },
    ],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [], qualityChecks: [], activeVersion: 7, publishedPlaceCount: 1,
    publicationVerified: true, hasUnsavedChanges: false,
  })
  assert.equal(result.scope.releaseTotal, 1)
  assert.equal(result.scope.deferredCount, 1)
  assert.equal(result.scope.futureReferenceCount, 0)
})

test('an unopened published place must explain its state', () => {
  const result = buildCampusReleaseCockpit({
    places: [{ ...readyPlace, serviceStatus: 'unopened', unavailableMessage: '' }],
    features: [{ id: 'area-3', placeId: 'place-3' }],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  const issue = result.issues.find((item) => item.key === 'availability:place-3')
  assert.ok(issue)
  assert.equal(issue.action, 'catalog')
  assert.equal(result.stages.find((stage) => stage.key === 'candidate').status, 'error')
})

test('null artwork coordinates never count as a vector binding', () => {
  const result = buildCampusReleaseCockpit({
    places: [{
      id: 'place-9',
      officialNumber: 9,
      officialName: '龙韬楼',
      artworkAnchorX: null,
      artworkAnchorY: null,
      coordinateStatus: 'verified',
    }],
    features: [],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.equal(result.stages[0].completed, 0)
  assert.equal(result.issues[0].key, 'binding:place-9')
})

test('builds the release batch from canonical places and matches legacy features by official number', () => {
  const places = buildReleasePlaceBatch([
    readyPlace,
    { ...readyPlace, id: 'place-4', placeId: 'place-4', officialNumber: 4, officialName: '天启楼' },
  ], [
    { id: 'legacy-area-3', officialNumber: 3, title: '天枢楼' },
    { id: 'legacy-area-4', officialNumber: 4, title: '天启楼' },
  ])

  assert.equal(places.length, 2)
  assert.deepEqual(places.map((place) => place.placeId), ['place-3', 'place-4'])
  assert.deepEqual(places.map((place) => place.featureId), ['legacy-area-3', 'legacy-area-4'])
})

test('matches an unnumbered legacy drawing object only when its place name is unique', () => {
  const features = [
    { id: 'legacy-area-3', title: '天枢楼' },
    { id: 'legacy-area-4', title: '天启楼' },
  ]
  const places = buildReleasePlaceBatch([
    readyPlace,
    { ...readyPlace, id: 'place-4', placeId: 'place-4', officialNumber: 4, officialName: '天启楼' },
  ], features)
  const result = buildCampusReleaseCockpit({
    places,
    features,
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(places.map((place) => place.featureId), ['legacy-area-3', 'legacy-area-4'])
  assert.equal(result.scope.orphanFeatureCount, 0)
  assert.equal(result.stages[0].completed, 2)
})

test('uses one release denominator and does not let an unselected drawing block the rolling batch', () => {
  const result = buildCampusReleaseCockpit({
    places: [readyPlace],
    features: [
      { id: 'legacy-area-3', officialNumber: 3, title: '天枢楼' },
      { id: 'orphan-area', title: '未归档建筑' },
    ],
    routes: [],
    qualityChecks: [],
    activeVersion: 0,
    publishedPlaceCount: 0,
    publicationVerified: false,
    hasUnsavedChanges: false,
  })

  assert.deepEqual(new Set(result.stages.map((stage) => stage.total)), new Set([1]))
  assert.equal(result.scope.releaseTotal, 1)
  assert.equal(result.scope.orphanFeatureCount, 0)
  assert.equal(result.stages[0].status, 'pass')
  assert.equal(result.issues.some((issue) => issue.key === 'binding-feature:orphan-area'), false)
  assert.equal(result.nextAction.action, 'publish')
})
