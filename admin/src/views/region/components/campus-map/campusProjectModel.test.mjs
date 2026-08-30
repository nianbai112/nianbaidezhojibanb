import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCampusProject,
  campusProjectCatalogItems,
  campusProjectAvailabilityError,
  catalogPlaceId,
  createCampusProjectCatalogLoader,
  pickCampusProjectMetadata,
  publicPlacePhotoUrls,
} from './campusProjectModel.mjs'

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
