import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCampusProject,
  campusProjectCatalogItems,
  campusProjectCounts,
  campusProjectAvailabilityError,
  catalogPlaceId,
  createCampusProjectCatalogLoader,
  findCampusProjectArtworkFeature,
  persistedCampusMapItems,
  pickCampusProjectMetadata,
  publicPlacePhotoUrls,
  resolveCampusProjectFeatureState,
} from './campusProjectModel.mjs'

test('project counters exclude deliberately hidden places', () => {
  assert.deepEqual(campusProjectCounts([
    { visibilityScope: 'phase1_active', publishStatus: 'published' },
    { visibilityScope: 'phase1_review', publishStatus: 'review' },
    { visibilityScope: 'future_reference', publishStatus: 'draft' },
    { visibilityScope: 'future_reference', publishStatus: 'hidden' },
  ]), { active: 1, review: 1, future: 1, unmatched: 0 })
})

test('campus project catalog accepts the paginated items response used by the admin API', () => {
  const items = Array.from({ length: 38 }, (_, index) => ({ officialNumber: index + 1 }))
  assert.equal(campusProjectCatalogItems({ data: { items, total: 38 } }).length, 38)
  assert.equal(campusProjectCatalogItems({ items, total: 38 }).length, 38)
  assert.equal(campusProjectCatalogItems(items).length, 38)
})

test('campus project catalog loader shares simultaneous requests for the same map', async () => {
  let calls = 0
  let resolveRequest
  const loader = createCampusProjectCatalogLoader(() => {
    calls += 1
    return new Promise((resolve) => { resolveRequest = resolve })
  })

  const first = loader('region-1', 'campus-main')
  const second = loader('region-1', 'campus-main')
  assert.equal(calls, 1)

  resolveRequest({ items: [{ officialNumber: 23, officialName: '教学楼A' }] })
  assert.deepEqual(await first, [{ officialNumber: 23, officialName: '教学楼A' }])
  assert.deepEqual(await second, [{ officialNumber: 23, officialName: '教学楼A' }])
})

test('blocks contradictory stable-place availability before admin save', () => {
  assert.match(campusProjectAvailabilityError({
    officialName: '图书馆', publishStatus: 'draft', serviceStatus: 'closed', navigable: true,
  }), /不能开启导航/)
  assert.match(campusProjectAvailabilityError({
    officialName: '图书馆', publishStatus: 'published', serviceStatus: 'unopened', navigable: false,
  }), /必须填写用户端不可用说明/)
  assert.equal(campusProjectAvailabilityError({
    officialName: '图书馆', publishStatus: 'published', serviceStatus: 'limited',
    unavailableMessage: '仅工作日开放', navigable: true,
  }), '')
  assert.equal(campusProjectAvailabilityError({
    officialName: '图书馆', publishStatus: 'draft', serviceStatus: 'unknown', navigable: false,
  }), '')
})

test('prefers stable place identity and scopes legacy ids by region', () => {
  assert.equal(catalogPlaceId({ placeId: 'place-7', id: 'row-7', officialNumber: 7 }, 'region-a'), 'place-7')
  assert.equal(catalogPlaceId({ id: 'row-7', officialNumber: 7 }, 'region-a'), 'row-7')
  assert.equal(catalogPlaceId({ officialNumber: 7 }, 'region-a'), 'campus-place:region-a:7')
  assert.equal(catalogPlaceId({ officialNumber: 7 }, 'region-b'), 'campus-place:region-b:7')
})

test('uses only approved public media and falls back to legacy photo urls', () => {
  assert.deepEqual(publicPlacePhotoUrls({
    media: [
      { id: 'approved', mediaType: 'facade', url: '/approved.jpg', reviewStatus: 'approved', isPublic: true },
      { id: 'entrance', mediaType: 'entrance', url: '/entrance.jpg', reviewStatus: 'approved', isPublic: true },
      { id: 'construction', mediaType: 'construction', url: '/construction.jpg', reviewStatus: 'approved', isPublic: true },
      { id: 'pending', kind: 'photo', url: '/pending.jpg', reviewStatus: 'pending', isPublic: true },
      { id: 'rejected', mediaType: 'signage', url: '/rejected.jpg', reviewStatus: 'rejected', isPublic: true },
      { id: 'private', kind: 'photo', url: '/private.jpg', reviewStatus: 'approved', isPublic: false },
    ],
    photos: ['/legacy-must-not-leak.jpg'],
  }), ['/approved.jpg', '/entrance.jpg', '/construction.jpg'])
  assert.deepEqual(publicPlacePhotoUrls({ photos: ['/legacy.jpg'] }), ['/legacy.jpg'])
})

test('binds both a point and polygon feature to the same stable placeId while preserving feature keys', () => {
  const project = {
    placeId: 'place-7', officialNumber: 7, officialName: '人和楼',
    constructionStatus: 'built', semanticType: 'teaching',
  }
  const point = applyCampusProject({ id: 'poi-7', title: '候选点' }, project, 'poi')
  const area = applyCampusProject({ id: 'area-7', title: '建筑轮廓', points: [{}, {}, {}] }, project, 'area')
  assert.equal(point.placeId, 'place-7')
  assert.equal(area.placeId, 'place-7')
  assert.equal(point.artworkFeatureKey, 'poi-7')
  assert.equal(area.artworkFeatureKey, 'area-7')
  assert.equal(point.geometryStatus, 'verified_point')
  assert.equal(area.geometryStatus, 'verified_polygon')
  assert.equal(pickCampusProjectMetadata(area).placeId, 'place-7')
})

test('uses the existing SVG building outline instead of creating a duplicate place marker', () => {
  const area = {
    id: 'area-7', placeId: 'place-7', officialNumber: 7,
    points: [{ xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.2, yRatio: 0.1 }, { xRatio: 0.2, yRatio: 0.2 }],
  }
  const result = findCampusProjectArtworkFeature({
    placeId: 'place-7', officialNumber: 7, artworkFeatureKey: 'area-7',
    artworkGeometry: { type: 'Polygon', coordinates: [] },
  }, [], [area], 'region-a')

  assert.equal(result?.kind, 'area')
  assert.equal(result?.item, area)
})

test('keeps catalog preview markers out of draft and rollback snapshots', () => {
  const realPoint = { id: 'entrance-7', placeId: 'place-7' }
  const previewMarker = { id: 'area-8', placeId: 'place-8', catalogPreviewOnly: true }

  assert.deepEqual(persistedCampusMapItems([realPoint, previewMarker]), [realPoint])
})

test('visible construction status overrides a stale legacy future phase', () => {
  const result = applyCampusProject({ id: 'gate-22' }, {
    id: 'place-22', officialNumber: 22, officialName: '第一校门',
    phase: 'future', constructionStatus: 'built', visibilityScope: 'phase1_active',
  }, 'poi')
  assert.equal(result.constructionStatus, 'built')
  assert.equal(result.phase, 'phase1')
})

test('canonical place availability overrides stale drawing properties', () => {
  const result = resolveCampusProjectFeatureState({
    serviceStatus: 'open', searchable: true, navigable: true, constructionStatus: 'built',
  }, {
    serviceStatus: 'temporarily_closed', unavailableMessage: '现场临时封闭',
    searchable: false, navigable: false, constructionStatus: 'built',
  })
  assert.equal(result.serviceStatus, 'temporarily_closed')
  assert.equal(result.unavailableMessage, '现场临时封闭')
  assert.equal(result.searchable, true)
  assert.equal(result.navigable, false)
})

test('future places cannot become searchable or navigable through stale drawing defaults', () => {
  const result = resolveCampusProjectFeatureState({ searchable: true, navigable: true }, {
    constructionStatus: 'planned', visibilityScope: 'future_reference', serviceStatus: 'unknown',
  })
  assert.equal(result.serviceStatus, 'unknown')
  assert.equal(result.searchable, false)
  assert.equal(result.navigable, false)
})

test('preserves the canonical place archive fields without copying private media into map features', () => {
  const metadata = pickCampusProjectMetadata({
    placeId: 'place-7',
    addressDescription: '校园北区，人和楼东门',
    longitude: 108.755214,
    latitude: 30.977782,
    coordinateStatus: 'verified',
    publishStatus: 'published',
    artworkFeatureKey: 'area-7',
    artworkAnchorX: 612,
    artworkAnchorY: 318,
    media: [{ id: 'private', isPublic: false, url: '/private.jpg' }],
    photos: ['/legacy-private.jpg'],
  })
  assert.deepEqual(metadata, {
    placeId: 'place-7',
    artworkFeatureKey: 'area-7',
    artworkAnchorX: 612,
    artworkAnchorY: 318,
    publishStatus: 'published',
    addressDescription: '校园北区，人和楼东门',
    coordinateStatus: 'verified',
    longitude: 108.755214,
    latitude: 30.977782,
  })
})
